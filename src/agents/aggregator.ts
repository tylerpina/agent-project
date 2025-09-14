import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";
import { allTools } from "../tools/index.js";
import type { WorkerResult } from "./worker.js";
import type { ReviewResult } from "./reviewer.js";
import type { Task, Api, Entity, Scenario } from "../schemas/spec.js";
import path from "node:path";

// Aggregation result schema
const AggregationResultSchema = z.object({
  projectName: z.string(),
  status: z.enum(["success", "partial", "failed"]),
  outputs: z.object({
    codebase: z.object({
      structure: z.record(z.array(z.string())), // directory -> files mapping
      totalFiles: z.number(),
      totalLines: z.number(),
      languages: z.array(z.string()),
    }),
    documentation: z.object({
      readme: z.string(),
      apiDocs: z.string().optional(),
      coverage: z.string().optional(),
    }),
    tests: z.object({
      totalTests: z.number(),
      passRate: z.number(),
      coverage: z.number(),
      suites: z.array(z.string()),
    }),
    deployment: z.object({
      packageJson: z.boolean(),
      dockerfile: z.boolean(),
      ciConfig: z.boolean(),
      envExample: z.boolean(),
    }),
  }),
  quality: z.object({
    overallScore: z.number().min(0).max(100),
    taskCompletion: z.number().min(0).max(100),
    codeQuality: z.number().min(0).max(100),
    testCoverage: z.number().min(0).max(100),
    documentation: z.number().min(0).max(100),
  }),
  issues: z.array(
    z.object({
      type: z.enum(["error", "warning", "info"]),
      category: z.string(),
      description: z.string(),
      affectedTasks: z.array(z.string()),
    })
  ),
  metadata: z.object({
    aggregatedAt: z.date(),
    tasksProcessed: z.number(),
    buildDuration: z.number(),
    outputPath: z.string(),
  }),
});

export type AggregationResult = z.infer<typeof AggregationResultSchema>;

/**
 * Aggregator Agent - Combines task outputs into a cohesive codebase
 *
 * This agent takes all completed task results and:
 * 1. Merges code files into a proper project structure
 * 2. Resolves conflicts and dependencies between tasks
 * 3. Generates comprehensive documentation (README, API docs)
 * 4. Creates deployment configurations (package.json, Dockerfile, etc.)
 * 5. Runs final validation and quality checks
 * 6. Produces a complete, deployable codebase
 */
export class AggregatorAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  /**
   * Aggregate all task results into a complete project
   */
  async aggregateProject(
    taskResults: Array<{
      task: Task;
      workerResult: WorkerResult;
      reviewResult: ReviewResult;
    }>,
    context: {
      projectName: string;
      entities: Entity[];
      apis: Api[];
      scenarios: Scenario[];
      workspacePath: string;
      specPath: string;
    }
  ): Promise<AggregationResult> {
    const aggregationStart = new Date();

    try {
      console.log(
        `🧩 Aggregating ${taskResults.length} task results into complete project...`
      );

      // Build comprehensive aggregation context
      const systemPrompt = this.buildSystemPrompt(context);
      const userPrompt = this.buildUserPrompt(taskResults, context);

      // Perform AI-powered project aggregation
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        tools: allTools, // Full access to create final project structure
        maxToolRoundtrips: 15, // Allow extensive file operations
        temperature: 0.1, // Low temperature for consistent output
        maxTokens: 10000,
      });

      // Parse the aggregation result
      let aggregationData: any;
      try {
        aggregationData = parseJsonResponse(result.text);
      } catch (parseError) {
        // Fallback to basic aggregation structure
        aggregationData = {
          projectName: context.projectName,
          status: "partial",
          outputs: {
            codebase: {
              structure: {},
              totalFiles: 0,
              totalLines: 0,
              languages: [],
            },
            documentation: { readme: "Basic project structure created" },
            tests: { totalTests: 0, passRate: 0, coverage: 0, suites: [] },
            deployment: {
              packageJson: false,
              dockerfile: false,
              ciConfig: false,
              envExample: false,
            },
          },
          quality: {
            overallScore: 50,
            taskCompletion: 50,
            codeQuality: 50,
            testCoverage: 0,
            documentation: 30,
          },
          issues: [
            {
              type: "warning",
              category: "aggregation",
              description: "Failed to parse aggregation results",
              affectedTasks: [],
            },
          ],
        };
      }

      const aggregationEnd = new Date();
      const buildDuration =
        aggregationEnd.getTime() - aggregationStart.getTime();

      // Calculate final metrics
      const approvedTasks = taskResults.filter(
        (tr) => tr.reviewResult.status === "approved"
      ).length;
      const taskCompletionRate = (approvedTasks / taskResults.length) * 100;

      const avgQualityScore =
        taskResults.reduce((sum, tr) => sum + tr.reviewResult.score, 0) /
        taskResults.length;

      // Build final aggregation result
      const aggregationResult: AggregationResult = {
        projectName: context.projectName,
        status:
          aggregationData.status ||
          (approvedTasks === taskResults.length ? "success" : "partial"),
        outputs: {
          codebase: {
            structure: aggregationData.outputs?.codebase?.structure || {},
            totalFiles: aggregationData.outputs?.codebase?.totalFiles || 0,
            totalLines: aggregationData.outputs?.codebase?.totalLines || 0,
            languages: aggregationData.outputs?.codebase?.languages || [
              "typescript",
            ],
          },
          documentation: {
            readme:
              aggregationData.outputs?.documentation?.readme ||
              "Project documentation",
            apiDocs: aggregationData.outputs?.documentation?.apiDocs,
            coverage: aggregationData.outputs?.documentation?.coverage,
          },
          tests: {
            totalTests: aggregationData.outputs?.tests?.totalTests || 0,
            passRate: aggregationData.outputs?.tests?.passRate || 0,
            coverage: aggregationData.outputs?.tests?.coverage || 0,
            suites: aggregationData.outputs?.tests?.suites || [],
          },
          deployment: {
            packageJson:
              aggregationData.outputs?.deployment?.packageJson || false,
            dockerfile:
              aggregationData.outputs?.deployment?.dockerfile || false,
            ciConfig: aggregationData.outputs?.deployment?.ciConfig || false,
            envExample:
              aggregationData.outputs?.deployment?.envExample || false,
          },
        },
        quality: {
          overallScore: Math.round((taskCompletionRate + avgQualityScore) / 2),
          taskCompletion: taskCompletionRate,
          codeQuality: avgQualityScore,
          testCoverage: aggregationData.quality?.testCoverage || 0,
          documentation: aggregationData.quality?.documentation || 50,
        },
        issues: aggregationData.issues || [],
        metadata: {
          aggregatedAt: aggregationEnd,
          tasksProcessed: taskResults.length,
          buildDuration,
          outputPath: path.join(context.workspacePath, "build"),
        },
      };

      console.log(
        `✅ Project aggregation completed - Overall Score: ${aggregationResult.quality.overallScore}/100`
      );
      return aggregationResult;
    } catch (error) {
      console.error(`❌ Project aggregation failed:`, error);

      const aggregationEnd = new Date();
      return {
        projectName: context.projectName,
        status: "failed",
        outputs: {
          codebase: {
            structure: {},
            totalFiles: 0,
            totalLines: 0,
            languages: [],
          },
          documentation: { readme: `Aggregation failed: ${error}` },
          tests: { totalTests: 0, passRate: 0, coverage: 0, suites: [] },
          deployment: {
            packageJson: false,
            dockerfile: false,
            ciConfig: false,
            envExample: false,
          },
        },
        quality: {
          overallScore: 0,
          taskCompletion: 0,
          codeQuality: 0,
          testCoverage: 0,
          documentation: 0,
        },
        issues: [
          {
            type: "error",
            category: "aggregation",
            description: `Aggregation process failed: ${error}`,
            affectedTasks: taskResults.map((tr) => tr.task.id),
          },
        ],
        metadata: {
          aggregatedAt: aggregationEnd,
          tasksProcessed: taskResults.length,
          buildDuration: aggregationEnd.getTime() - aggregationStart.getTime(),
          outputPath: path.join(context.workspacePath, "build"),
        },
      };
    }
  }

  /**
   * Build comprehensive system prompt for the aggregator agent
   */
  private buildSystemPrompt(context: any): string {
    return `You are a Senior Software Architect AI agent responsible for aggregating individual task outputs into a complete, production-ready codebase.

ROLE & RESPONSIBILITIES:
- Merge code files from multiple tasks into a cohesive project structure
- Resolve conflicts and ensure proper integration between components
- Generate comprehensive project documentation (README, API docs, deployment guides)
- Create deployment configurations (package.json, Dockerfile, CI/CD configs)
- Establish proper project structure and build processes
- Ensure code quality and consistency across the entire codebase
- Generate final validation reports and quality metrics

PROJECT AGGREGATION PROCESS:
1. **Structure Organization**: Create proper directory structure (src/, tests/, docs/, etc.)
2. **Code Integration**: Merge task outputs, resolve conflicts, ensure consistency
3. **Dependency Management**: Create package.json with all required dependencies
4. **Documentation Generation**: Create comprehensive README and API documentation
5. **Test Integration**: Combine test suites and ensure comprehensive coverage
6. **Build Configuration**: Set up build scripts, linting, and CI/CD
7. **Deployment Preparation**: Create Docker configs, environment examples
8. **Quality Validation**: Run final tests, linting, and quality checks

QUALITY STANDARDS:
- Follow industry-standard project structure conventions
- Ensure all code follows consistent style and patterns
- Generate comprehensive documentation for users and developers
- Create production-ready deployment configurations
- Maintain high test coverage and code quality
- Provide clear setup and deployment instructions

OUTPUT REQUIREMENTS:
- Complete, deployable codebase in /build directory
- Comprehensive README.md with setup instructions
- API documentation (if applicable)
- Test suites with good coverage
- Production-ready package.json and deployment configs
- Quality metrics and validation reports

Use the available tools to create the complete project structure and all necessary files.`;
  }

  /**
   * Build specific user prompt for the aggregation
   */
  private buildUserPrompt(taskResults: any[], context: any): string {
    const completedTasks = taskResults.filter(
      (tr) => tr.reviewResult.status === "approved"
    );
    const pendingTasks = taskResults.filter(
      (tr) => tr.reviewResult.status !== "approved"
    );

    return `PROJECT AGGREGATION REQUEST:

**Project**: ${context.projectName}
**Workspace**: ${context.workspacePath}
**Target**: ${path.join(context.workspacePath, "build")}

**Project Specification**:
- Entities: ${context.entities.length} (${context.entities
      .map((e: Entity) => e.name)
      .join(", ")})
- APIs: ${context.apis.length} endpoints
- Scenarios: ${context.scenarios.length} acceptance criteria

**Task Results to Aggregate**:
${taskResults
  .map(
    (tr) =>
      `- ${tr.task.id}: ${
        tr.task.title
      } [${tr.reviewResult.status.toUpperCase()}] (Score: ${
        tr.reviewResult.score
      }/100)
  Files: ${tr.workerResult.outputs.files.length} | Tests: ${
        tr.workerResult.outputs.testResults?.passed || 0
      } passed`
  )
  .join("\n")}

**Completed Tasks (${completedTasks.length})**:
${completedTasks
  .map((tr) => {
    const files = tr.workerResult.outputs.files
      .map((f: any) => `${f.path} (${f.type})`)
      .join(", ");
    return `- ${tr.task.id}: ${files}`;
  })
  .join("\n")}

**Pending/Failed Tasks (${pendingTasks.length})**:
${pendingTasks
  .map(
    (tr) =>
      `- ${tr.task.id}: ${tr.reviewResult.status} - ${tr.reviewResult.feedback.summary}`
  )
  .join("\n")}

**Aggregation Requirements**:

1. **Project Structure**: Create standard directory layout:
   /build/
   - src/           # Source code
   - tests/         # Test files  
   - docs/          # Documentation
   - package.json   # Dependencies and scripts
   - README.md      # Project documentation
   - Dockerfile     # Container configuration
   - .env.example   # Environment variables

2. **Code Integration**: 
   - Merge all approved task outputs into cohesive codebase
   - Resolve any conflicts between task implementations
   - Ensure consistent coding style and patterns
   - Add proper imports/exports and module structure

3. **Documentation**:
   - Generate comprehensive README.md with:
     * Project description and features
     * Setup and installation instructions
     * API documentation (if applicable)
     * Usage examples
     * Development guide
   - Create API documentation from endpoint specifications
   - Include test coverage reports

4. **Deployment Configuration**:
   - Create package.json with all dependencies and scripts
   - Generate Dockerfile for containerization
   - Add CI/CD configuration (GitHub Actions or similar)
   - Create .env.example with required environment variables

5. **Quality Assurance**:
   - Run all tests and ensure they pass
   - Check code quality with linting
   - Validate API endpoints work correctly
   - Ensure deployment configurations are valid

**Expected Output**:
Please use the available tools to create the complete project structure and provide a JSON response with:
- Project status and quality metrics
- Detailed breakdown of generated files and structure
- Test results and coverage information
- Any issues or warnings encountered
- Deployment readiness assessment

Create a production-ready codebase that can be immediately deployed and used.`;
  }

  /**
   * Generate comprehensive README.md for the project
   */
  async generateReadme(
    context: {
      projectName: string;
      entities: Entity[];
      apis: Api[];
      scenarios: Scenario[];
    },
    aggregationResult: AggregationResult
  ): Promise<string> {
    const apiEndpoints = context.apis
      .map(
        (api) =>
          `- \`${api.method} ${api.route}\` - ${api.summary || "API endpoint"}`
      )
      .join("\n");

    const entities = context.entities
      .map((entity) => `- **${entity.name}**: ${entity.attributes.join(", ")}`)
      .join("\n");

    return `# ${context.projectName}

## Overview

${
  context.projectName
} is a modern application built with TypeScript and Node.js. This project was generated using IdeaForge AI-powered development pipeline.

## Features

${context.scenarios
  .slice(0, 5)
  .map((s) => `- ${s.then}`)
  .join("\n")}

## Architecture

### Data Models

${entities}

### API Endpoints

${apiEndpoints}

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

\`\`\`bash
# Clone the repository
git clone <repository-url>
cd ${context.projectName.toLowerCase().replace(/\s+/g, "-")}

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
\`\`\`

### Development

\`\`\`bash
# Start development server
npm run dev

# Run tests
npm test

# Run linting
npm run lint

# Build for production
npm run build
\`\`\`

## Project Structure

\`\`\`
${Object.entries(aggregationResult.outputs.codebase.structure)
  .map(
    ([dir, files]) =>
      `${dir}/\n${(files as string[]).map((f) => `├── ${f}`).join("\n")}`
  )
  .join("\n")}
\`\`\`

## Quality Metrics

- **Overall Score**: ${aggregationResult.quality.overallScore}/100
- **Task Completion**: ${aggregationResult.quality.taskCompletion}%
- **Code Quality**: ${aggregationResult.quality.codeQuality}/100
- **Test Coverage**: ${aggregationResult.quality.testCoverage}%
- **Documentation**: ${aggregationResult.quality.documentation}/100

## Testing

\`\`\`bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm run test:unit
npm run test:integration
\`\`\`

## Deployment

### Docker

\`\`\`bash
# Build Docker image
docker build -t ${context.projectName.toLowerCase().replace(/\s+/g, "-")} .

# Run container
docker run -p 3000:3000 ${context.projectName
      .toLowerCase()
      .replace(/\s+/g, "-")}
\`\`\`

### Environment Variables

Copy \`.env.example\` to \`.env\` and configure:

\`\`\`
NODE_ENV=production
PORT=3000
DATABASE_URL=your_database_url
API_KEY=your_api_key
\`\`\`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details

---

*Generated by IdeaForge AI Development Pipeline*
*Project Quality Score: ${aggregationResult.quality.overallScore}/100*
`;
  }
}

/**
 * Factory function to create an AggregatorAgent
 */
export function createAggregatorAgent(
  model: string = "gpt-4o-mini"
): AggregatorAgent {
  return new AggregatorAgent(model);
}

/**
 * Project assembly orchestrator that manages the complete build process
 */
export class ProjectAssemblyOrchestrator {
  private aggregatorAgent: AggregatorAgent;

  constructor(model: string = "gpt-4o-mini") {
    this.aggregatorAgent = createAggregatorAgent(model);
  }

  /**
   * Assemble complete project from all task results
   */
  async assembleProject(
    taskResults: Array<{
      task: Task;
      workerResult: WorkerResult;
      reviewResult: ReviewResult;
    }>,
    context: {
      projectName: string;
      entities: Entity[];
      apis: Api[];
      scenarios: Scenario[];
      workspacePath: string;
      specPath: string;
    }
  ): Promise<AggregationResult> {
    console.log(`🏗️  Assembling complete project: ${context.projectName}`);

    // Filter for approved tasks only
    const approvedTasks = taskResults.filter(
      (tr) => tr.reviewResult.status === "approved"
    );
    const failedTasks = taskResults.filter(
      (tr) => tr.reviewResult.status !== "approved"
    );

    if (failedTasks.length > 0) {
      console.log(
        `⚠️  ${failedTasks.length} tasks not approved, proceeding with ${approvedTasks.length} approved tasks`
      );
    }

    // Aggregate the project
    const result = await this.aggregatorAgent.aggregateProject(
      taskResults,
      context
    );

    // Generate comprehensive documentation
    if (result.status !== "failed") {
      const readme = await this.aggregatorAgent.generateReadme(context, result);
      result.outputs.documentation.readme = readme;
    }

    console.log(`✅ Project assembly completed with status: ${result.status}`);
    console.log(`📊 Quality Score: ${result.quality.overallScore}/100`);

    return result;
  }
}

// ProjectAssemblyOrchestrator is already exported above as a class
