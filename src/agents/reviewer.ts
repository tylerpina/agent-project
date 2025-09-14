import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";
import { allTools } from "../tools/index.js";
import type { WorkerResult } from "./worker.js";
import type { Task, Scenario, Constraint } from "../schemas/spec.js";

// Review result schema
const ReviewResultSchema = z.object({
  taskId: z.string(),
  status: z.enum(["approved", "needs_changes", "rejected"]),
  score: z.number().min(0).max(100), // Overall quality score
  feedback: z.object({
    strengths: z.array(z.string()),
    issues: z.array(
      z.object({
        type: z.enum(["critical", "major", "minor", "suggestion"]),
        category: z.enum([
          "functionality",
          "testing",
          "code_quality",
          "security",
          "performance",
          "documentation",
        ]),
        description: z.string(),
        file: z.string().optional(),
        line: z.number().optional(),
        suggestion: z.string().optional(),
      })
    ),
    summary: z.string(),
  }),
  checklist: z.object({
    functionality: z.boolean(), // Does it meet acceptance criteria?
    testing: z.boolean(), // Are tests comprehensive and passing?
    codeQuality: z.boolean(), // Is code clean and well-structured?
    security: z.boolean(), // Are security constraints met?
    performance: z.boolean(), // Are performance constraints met?
    documentation: z.boolean(), // Is code properly documented?
  }),
  recommendations: z.array(z.string()),
  metadata: z.object({
    reviewedAt: z.date(),
    reviewDuration: z.number(), // in milliseconds
    filesReviewed: z.number(),
    linesReviewed: z.number(),
  }),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/**
 * Reviewer Agent - Performs comprehensive code review with checklist-driven validation
 *
 * This agent reviews the output from WorkerAgent and provides detailed feedback:
 * 1. Validates that acceptance criteria are met
 * 2. Checks code quality, security, and performance
 * 3. Runs automated tests and linting
 * 4. Provides actionable feedback for improvements
 * 5. Decides whether to approve or request changes
 */
export class ReviewerAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  /**
   * Review a completed task implementation
   */
  async reviewTask(
    workerResult: WorkerResult,
    task: Task,
    context: {
      scenarios: Scenario[];
      constraints: Constraint[];
      workspacePath: string;
      projectName: string;
    }
  ): Promise<ReviewResult> {
    const reviewStart = new Date();

    try {
      console.log(`🔍 Reviewing task ${task.id}: ${task.title}`);

      // Build comprehensive review context
      const systemPrompt = this.buildSystemPrompt(task, context);
      const userPrompt = this.buildUserPrompt(workerResult, task, context);

      // Perform AI-powered code review
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        tools: allTools, // Allow reviewer to examine files, run tests, etc.
        maxToolRoundtrips: 5,
        temperature: 0.1, // Low temperature for consistent reviews
        maxTokens: 6000,
      });

      // Parse the review result
      let reviewData: any;
      try {
        reviewData = parseJsonResponse(result.text);
      } catch (parseError) {
        // Fallback to basic review structure
        reviewData = {
          taskId: task.id,
          status: "needs_changes",
          score: 50,
          feedback: {
            strengths: [],
            issues: [
              {
                type: "major",
                category: "functionality",
                description: "Unable to parse review results properly",
              },
            ],
            summary: result.text,
          },
          checklist: {
            functionality: false,
            testing: false,
            codeQuality: false,
            security: false,
            performance: false,
            documentation: false,
          },
          recommendations: ["Fix review parsing issues"],
        };
      }

      const reviewEnd = new Date();
      const reviewDuration = reviewEnd.getTime() - reviewStart.getTime();

      // Calculate metadata
      const filesReviewed = workerResult.outputs.files.length;
      const linesReviewed = workerResult.outputs.files.reduce(
        (total, file) => total + file.content.split("\n").length,
        0
      );

      // Validate and return structured review
      const reviewResult: ReviewResult = {
        taskId: task.id,
        status: reviewData.status || "needs_changes",
        score: Math.max(0, Math.min(100, reviewData.score || 50)),
        feedback: {
          strengths: reviewData.feedback?.strengths || [],
          issues: reviewData.feedback?.issues || [],
          summary: reviewData.feedback?.summary || "Review completed",
        },
        checklist: {
          functionality: reviewData.checklist?.functionality || false,
          testing: reviewData.checklist?.testing || false,
          codeQuality: reviewData.checklist?.codeQuality || false,
          security: reviewData.checklist?.security || false,
          performance: reviewData.checklist?.performance || false,
          documentation: reviewData.checklist?.documentation || false,
        },
        recommendations: reviewData.recommendations || [],
        metadata: {
          reviewedAt: reviewEnd,
          reviewDuration,
          filesReviewed,
          linesReviewed,
        },
      };

      console.log(
        `✅ Review completed for task ${task.id} - Score: ${reviewResult.score}/100`
      );
      return reviewResult;
    } catch (error) {
      console.error(`❌ Review failed for task ${task.id}:`, error);

      const reviewEnd = new Date();
      return {
        taskId: task.id,
        status: "rejected",
        score: 0,
        feedback: {
          strengths: [],
          issues: [
            {
              type: "critical",
              category: "functionality",
              description: `Review process failed: ${error}`,
            },
          ],
          summary: `Review failed due to error: ${error}`,
        },
        checklist: {
          functionality: false,
          testing: false,
          codeQuality: false,
          security: false,
          performance: false,
          documentation: false,
        },
        recommendations: ["Fix review process errors before proceeding"],
        metadata: {
          reviewedAt: reviewEnd,
          reviewDuration: reviewEnd.getTime() - reviewStart.getTime(),
          filesReviewed: 0,
          linesReviewed: 0,
        },
      };
    }
  }

  /**
   * Build comprehensive system prompt for the reviewer agent
   */
  private buildSystemPrompt(task: Task, context: any): string {
    return `You are a Senior Code Reviewer AI agent performing comprehensive code review.

ROLE & RESPONSIBILITIES:
- Review code for functionality, quality, security, and performance
- Validate that acceptance criteria are fully met
- Check adherence to coding standards and best practices
- Identify potential bugs, security vulnerabilities, and performance issues
- Provide constructive feedback and actionable recommendations
- Use available tools to examine files, run tests, and validate implementations

REVIEW CRITERIA:
1. **Functionality**: Does the code meet all acceptance criteria?
2. **Testing**: Are tests comprehensive, passing, and cover edge cases?
3. **Code Quality**: Is code clean, readable, and well-structured?
4. **Security**: Are security constraints and best practices followed?
5. **Performance**: Are performance requirements met?
6. **Documentation**: Is code properly documented with clear comments?

SCORING GUIDELINES:
- 90-100: Excellent - Ready for production, minor suggestions only
- 80-89: Good - Meets requirements with minor improvements needed
- 70-79: Acceptable - Functional but needs moderate improvements
- 60-69: Needs Work - Major issues that must be addressed
- 0-59: Unacceptable - Critical issues, requires significant rework

REVIEW PROCESS:
1. Examine all generated files using available tools
2. Run tests to verify functionality
3. Check code quality with linting tools
4. Validate against acceptance criteria and constraints
5. Identify strengths and areas for improvement
6. Provide specific, actionable feedback
7. Make approval decision based on quality standards

Be thorough but constructive. Focus on helping improve the code while ensuring it meets all requirements.`;
  }

  /**
   * Build specific user prompt for the review
   */
  private buildUserPrompt(
    workerResult: WorkerResult,
    task: Task,
    context: any
  ): string {
    const relatedScenarios = context.scenarios.filter((s: Scenario) =>
      task.acceptanceCriteria.includes(s.id)
    );

    const relatedConstraints = context.constraints.filter((c: Constraint) =>
      ["perf", "security", "compliance"].includes(c.type)
    );

    return `TASK IMPLEMENTATION TO REVIEW:

**Task Details**:
- ID: ${task.id}
- Title: ${task.title}
- Description: ${task.description}
- Complexity: ${task.estimatedComplexity}

**Implementation Results**:
- Status: ${workerResult.status}
- Files Created: ${workerResult.outputs.files.length}
- Execution Time: ${workerResult.metadata.duration}ms
- Tools Used: ${workerResult.metadata.toolsUsed.join(", ")}

**Files to Review**:
${workerResult.outputs.files
  .map((f) => `- ${f.path} (${f.type}): ${f.content.split("\n").length} lines`)
  .join("\n")}

**Acceptance Criteria to Validate**:
${relatedScenarios
  .map((s) => `- ${s.id}: Given ${s.given}, When ${s.when}, Then ${s.then}`)
  .join("\n")}

**Constraints to Check**:
${relatedConstraints
  .map((c) => `- ${c.type.toUpperCase()}: ${c.rule}`)
  .join("\n")}

**Test Results**:
${
  workerResult.outputs.testResults
    ? `- Passed: ${workerResult.outputs.testResults.passed}
- Failed: ${workerResult.outputs.testResults.failed}
- Coverage: ${workerResult.outputs.testResults.coverage || "N/A"}%`
    : "- No test results available"
}

**Implementation Summary**:
${workerResult.outputs.summary}

**Review Instructions**:
1. Use the available tools to examine each file in detail
2. Run tests to verify functionality works as expected
3. Check that all acceptance criteria are met
4. Validate adherence to constraints (security, performance, etc.)
5. Assess code quality, structure, and documentation
6. Identify any bugs, security issues, or performance problems

Please provide a comprehensive review with:
- Overall quality score (0-100)
- Specific strengths and issues found
- Checklist validation for each review criteria
- Actionable recommendations for improvement
- Final approval decision (approved/needs_changes/rejected)

Respond with a JSON object containing your detailed review results.`;
  }

  /**
   * Run automated quality checks
   */
  async runAutomatedChecks(
    workerResult: WorkerResult,
    workspacePath: string
  ): Promise<{
    linting: { passed: boolean; issues: string[] };
    testing: { passed: boolean; coverage: number; results: string };
    security: { passed: boolean; vulnerabilities: string[] };
  }> {
    // This would integrate with actual linting, testing, and security tools
    // For now, return mock results based on the worker output

    const hasTests = workerResult.outputs.files.some((f) => f.type === "test");
    const hasLintableCode = workerResult.outputs.files.some(
      (f) => f.type === "code"
    );

    return {
      linting: {
        passed: hasLintableCode,
        issues: hasLintableCode ? [] : ["No code files to lint"],
      },
      testing: {
        passed: workerResult.outputs.testResults?.failed === 0,
        coverage: workerResult.outputs.testResults?.coverage || 0,
        results: hasTests ? "Tests executed successfully" : "No tests found",
      },
      security: {
        passed: true, // Would run actual security scanning
        vulnerabilities: [],
      },
    };
  }
}

/**
 * Factory function to create a ReviewerAgent
 */
export function createReviewerAgent(
  model: string = "gpt-4o-mini"
): ReviewerAgent {
  return new ReviewerAgent(model);
}

/**
 * Review loop orchestrator that manages iterative improvements
 */
export class ReviewLoopOrchestrator {
  private reviewerAgent: ReviewerAgent;
  private maxIterations: number;

  constructor(model: string = "gpt-4o-mini", maxIterations: number = 3) {
    this.reviewerAgent = createReviewerAgent(model);
    this.maxIterations = maxIterations;
  }

  /**
   * Run review loop with iterative improvements
   */
  async runReviewLoop(
    workerResult: WorkerResult,
    task: Task,
    context: {
      scenarios: Scenario[];
      constraints: Constraint[];
      workspacePath: string;
      projectName: string;
    }
  ): Promise<{
    finalReview: ReviewResult;
    iterations: ReviewResult[];
    approved: boolean;
  }> {
    const iterations: ReviewResult[] = [];
    let currentResult = workerResult;
    let approved = false;

    console.log(
      `🔄 Starting review loop for task ${task.id} (max ${this.maxIterations} iterations)`
    );

    for (let i = 0; i < this.maxIterations; i++) {
      console.log(`📝 Review iteration ${i + 1}/${this.maxIterations}`);

      const review = await this.reviewerAgent.reviewTask(
        currentResult,
        task,
        context
      );
      iterations.push(review);

      if (review.status === "approved") {
        approved = true;
        console.log(`✅ Task ${task.id} approved after ${i + 1} iteration(s)`);
        break;
      } else if (review.status === "rejected") {
        console.log(`❌ Task ${task.id} rejected - critical issues found`);
        break;
      } else {
        console.log(
          `🔧 Task ${task.id} needs changes - iteration ${i + 1} complete`
        );

        if (i < this.maxIterations - 1) {
          // TODO: Implement automatic fixes based on review feedback
          // For now, we'll just continue with the same result
          console.log(
            `⚠️  Automatic fixes not yet implemented - continuing with current implementation`
          );
        }
      }
    }

    const finalReview = iterations[iterations.length - 1];

    if (!approved && iterations.length === this.maxIterations) {
      console.log(
        `⚠️  Task ${task.id} reached maximum review iterations without approval`
      );
    }

    return {
      finalReview,
      iterations,
      approved,
    };
  }
}

// ReviewLoopOrchestrator is already exported above as a class
