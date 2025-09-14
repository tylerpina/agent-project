import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";
import { allTools } from "../tools/index.js";
import type {
  Task,
  Scenario,
  Entity,
  Api,
  Constraint,
} from "../schemas/spec.js";

// Worker execution result schema
const WorkerResultSchema = z.object({
  taskId: z.string(),
  status: z.enum(["completed", "failed", "needs_review"]),
  outputs: z.object({
    files: z.array(
      z.object({
        path: z.string(),
        content: z.string(),
        type: z.enum(["code", "test", "config", "documentation"]),
      })
    ),
    summary: z.string(),
    testResults: z
      .object({
        passed: z.number(),
        failed: z.number(),
        coverage: z.number().optional(),
      })
      .optional(),
  }),
  logs: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  metadata: z.object({
    startTime: z.date(),
    endTime: z.date(),
    duration: z.number(), // in milliseconds
    toolsUsed: z.array(z.string()),
  }),
});

export type WorkerResult = z.infer<typeof WorkerResultSchema>;

/**
 * Worker Agent - Executes individual tasks with full tool access
 *
 * This agent takes a task from the spec.ai.json and implements it by:
 * 1. Analyzing the task requirements and acceptance criteria
 * 2. Using available tools (file system, testing, linting) to implement
 * 3. Writing code, tests, and documentation
 * 4. Running tests and validation
 * 5. Returning structured results for review
 */
export class WorkerAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  /**
   * Execute a single task with full context
   */
  async executeTask(
    task: Task,
    context: {
      entities: Entity[];
      apis: Api[];
      constraints: Constraint[];
      scenarios: Scenario[];
      workspacePath: string;
      projectName: string;
    }
  ): Promise<WorkerResult> {
    const startTime = new Date();
    const logs: string[] = [];
    const errors: string[] = [];
    const toolsUsed: string[] = [];

    try {
      logs.push(`Starting execution of task ${task.id}: ${task.title}`);

      // Build comprehensive context for the AI agent
      const systemPrompt = this.buildSystemPrompt(task, context);
      const userPrompt = this.buildUserPrompt(task, context);

      logs.push(
        "Analyzing task requirements and generating implementation plan..."
      );

      // Execute the task using AI with tool access
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        tools: allTools,
        maxToolRoundtrips: 10, // Allow multiple tool interactions
        temperature: 0.1, // Low temperature for consistent code generation
        maxTokens: 8000,
      });

      logs.push("AI execution completed, processing results...");

      // Parse the structured result
      let workerData: any;
      try {
        workerData = parseJsonResponse(result.text);
      } catch (parseError) {
        // If JSON parsing fails, create a basic result structure
        workerData = {
          taskId: task.id,
          status: "completed",
          outputs: {
            files: [],
            summary: result.text,
          },
        };
      }

      // Track tools used during execution
      if (result.toolCalls) {
        result.toolCalls.forEach((call) => {
          if (!toolsUsed.includes(call.toolName)) {
            toolsUsed.push(call.toolName);
          }
        });
      }

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      // Validate and return structured result
      const workerResult: WorkerResult = {
        taskId: task.id,
        status: workerData.status || "completed",
        outputs: {
          files: workerData.outputs?.files || [],
          summary: workerData.outputs?.summary || result.text,
          testResults: workerData.outputs?.testResults,
        },
        logs,
        errors,
        metadata: {
          startTime,
          endTime,
          duration,
          toolsUsed,
        },
      };

      logs.push(`Task ${task.id} completed successfully in ${duration}ms`);
      return workerResult;
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      errors.push(`Task execution failed: ${error}`);

      return {
        taskId: task.id,
        status: "failed",
        outputs: {
          files: [],
          summary: `Task failed: ${error}`,
        },
        logs,
        errors,
        metadata: {
          startTime,
          endTime,
          duration,
          toolsUsed,
        },
      };
    }
  }

  /**
   * Build comprehensive system prompt for the worker agent
   */
  private buildSystemPrompt(task: Task, context: any): string {
    return `You are a Senior Software Engineer AI agent executing a specific development task.

ROLE & CAPABILITIES:
- You have access to file system tools (read, write, create directories)
- You can run tests, linting, and code quality checks
- You can validate OpenAPI specifications
- You must implement the task completely and correctly
- You should write clean, well-documented, production-ready code

PROJECT CONTEXT:
- Project: ${context.projectName}
- Workspace: ${context.workspacePath}
- Entities: ${context.entities.map((e) => e.name).join(", ")}
- APIs: ${context.apis.length} endpoints defined
- Constraints: ${context.constraints.length} requirements to follow

TASK EXECUTION PROCESS:
1. Analyze the task requirements and acceptance criteria
2. Plan the implementation approach
3. Create necessary files and directory structure
4. Implement the functionality with proper error handling
5. Write comprehensive tests
6. Run tests and fix any issues
7. Ensure code quality (linting, formatting)
8. Document the implementation

CODE QUALITY STANDARDS:
- Follow TypeScript best practices
- Write comprehensive unit tests
- Include proper error handling
- Add JSDoc comments for functions
- Follow consistent naming conventions
- Ensure type safety throughout

IMPORTANT: Use the available tools to actually implement the task. Don't just describe what to do - actually do it by calling the appropriate tools to create files, run tests, etc.

Return a JSON response with the execution results including all files created, test results, and a summary of what was implemented.`;
  }

  /**
   * Build specific user prompt for the task
   */
  private buildUserPrompt(task: Task, context: any): string {
    const relatedScenarios = context.scenarios.filter((s: Scenario) =>
      task.acceptanceCriteria.includes(s.id)
    );

    const relatedConstraints = context.constraints.filter(
      (c: Constraint) =>
        c.type === "perf" || c.type === "security" || c.type === "compliance"
    );

    return `TASK TO IMPLEMENT:

**Task ID**: ${task.id}
**Title**: ${task.title}
**Description**: ${task.description}
**Estimated Complexity**: ${task.estimatedComplexity}
**Dependencies**: ${task.dependencies.join(", ") || "None"}

**Acceptance Criteria**:
${relatedScenarios
  .map((s) => `- AC-${s.id}: Given ${s.given}, When ${s.when}, Then ${s.then}`)
  .join("\n")}

**Relevant Entities**:
${context.entities
  .map((e: Entity) => `- ${e.name}: ${e.attributes.join(", ")}`)
  .join("\n")}

**Relevant APIs**:
${context.apis
  .map((a: Api) => `- ${a.method} ${a.route}: ${a.summary}`)
  .join("\n")}

**Constraints to Follow**:
${relatedConstraints
  .map((c: Constraint) => `- ${c.type.toUpperCase()}: ${c.rule}`)
  .join("\n")}

**Implementation Requirements**:
1. Create all necessary files in the correct directory structure
2. Implement the functionality according to the acceptance criteria
3. Write comprehensive tests that validate the acceptance criteria
4. Ensure all constraints are met
5. Run tests to verify everything works
6. Follow the project's coding standards

Please implement this task completely using the available tools. Create actual files, write real code, and run tests to ensure everything works correctly.

Respond with a JSON object containing:
{
  "taskId": "${task.id}",
  "status": "completed|failed|needs_review",
  "outputs": {
    "files": [{"path": "...", "content": "...", "type": "code|test|config|documentation"}],
    "summary": "What was implemented and how it meets the acceptance criteria",
    "testResults": {"passed": 0, "failed": 0, "coverage": 0}
  }
}`;
  }

  /**
   * Validate task execution results
   */
  async validateExecution(
    result: WorkerResult,
    task: Task
  ): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check if task was completed
    if (result.status === "failed") {
      issues.push("Task execution failed");
    }

    // Check if files were created
    if (result.outputs.files.length === 0) {
      issues.push("No files were created during task execution");
    }

    // Check if tests were run
    if (!result.outputs.testResults) {
      suggestions.push(
        "Consider adding test results to validate implementation"
      );
    } else if (result.outputs.testResults.failed > 0) {
      issues.push(`${result.outputs.testResults.failed} tests are failing`);
    }

    // Check execution time (warn if too long)
    if (result.metadata.duration > 300000) {
      // 5 minutes
      suggestions.push(
        "Task execution took longer than expected - consider optimization"
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }
}

/**
 * Factory function to create a WorkerAgent
 */
export function createWorkerAgent(model: string = "gpt-4o-mini"): WorkerAgent {
  return new WorkerAgent(model);
}

/**
 * Task execution orchestrator that manages multiple workers
 */
export class TaskExecutionOrchestrator {
  private workerAgent: WorkerAgent;

  constructor(model: string = "gpt-4o-mini") {
    this.workerAgent = createWorkerAgent(model);
  }

  /**
   * Execute multiple tasks in dependency order
   */
  async executeTasks(
    tasks: Task[],
    context: {
      entities: Entity[];
      apis: Api[];
      constraints: Constraint[];
      scenarios: Scenario[];
      workspacePath: string;
      projectName: string;
    }
  ): Promise<WorkerResult[]> {
    const results: WorkerResult[] = [];
    const sortedTasks = this.topologicalSort(tasks);

    console.log(`🚀 Executing ${tasks.length} tasks in dependency order...`);

    for (const task of sortedTasks) {
      console.log(`⚙️  Executing task ${task.id}: ${task.title}`);

      try {
        const result = await this.workerAgent.executeTask(task, context);
        results.push(result);

        if (result.status === "completed") {
          console.log(`✅ Task ${task.id} completed successfully`);
        } else {
          console.log(`⚠️  Task ${task.id} needs attention: ${result.status}`);
        }
      } catch (error) {
        console.error(`❌ Task ${task.id} failed:`, error);
        results.push({
          taskId: task.id,
          status: "failed",
          outputs: {
            files: [],
            summary: `Execution failed: ${error}`,
          },
          logs: [],
          errors: [String(error)],
          metadata: {
            startTime: new Date(),
            endTime: new Date(),
            duration: 0,
            toolsUsed: [],
          },
        });
      }
    }

    return results;
  }

  /**
   * Sort tasks by dependencies using topological sort
   */
  private topologicalSort(tasks: Task[]): Task[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: Task[] = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    function visit(taskId: string) {
      if (visiting.has(taskId)) {
        throw new Error(
          `Circular dependency detected involving task ${taskId}`
        );
      }
      if (visited.has(taskId)) {
        return;
      }

      const task = taskMap.get(taskId);
      if (!task) {
        return; // Skip missing dependencies
      }

      visiting.add(taskId);

      // Visit dependencies first
      for (const depId of task.dependencies) {
        visit(depId);
      }

      visiting.delete(taskId);
      visited.add(taskId);
      result.push(task);
    }

    // Visit all tasks
    for (const task of tasks) {
      visit(task.id);
    }

    return result;
  }
}

// TaskExecutionOrchestrator is already exported above as a class
