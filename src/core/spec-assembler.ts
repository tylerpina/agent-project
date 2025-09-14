import { z } from "zod";
import {
  SpecSchema,
  generateNextTaskId,
  generateNextScenarioId,
  type Spec,
} from "../schemas/spec.js";
import type { SummaryResult } from "../agents/summary.js";
import type { EntityApiResult } from "../agents/entity-api.js";
import type { ConstraintsResult } from "../agents/constraints.js";
import type { ScenariosResult } from "../agents/scenarios.js";
import type { HintsResult } from "../agents/hints.js";

// Assembly configuration
const AssemblyConfigSchema = z.object({
  generateTasks: z.boolean().default(true),
  taskComplexityThreshold: z.enum(["low", "medium", "high"]).default("medium"),
  maxTasksPerEntity: z.number().positive().default(5),
  includeTestTasks: z.boolean().default(true),
  includeDocumentationTasks: z.boolean().default(true),
});

export type AssemblyConfig = z.infer<typeof AssemblyConfigSchema>;

// Assembly result
export interface AssemblyResult {
  spec: Spec;
  metadata: {
    agentResults: {
      summary: SummaryResult;
      entityApi: EntityApiResult;
      constraints: ConstraintsResult;
      scenarios: ScenariosResult;
      hints: HintsResult;
    };
    assembly: {
      tasksGenerated: number;
      scenariosLinked: number;
      constraintsApplied: number;
      validationIssues: string[];
      warnings: string[];
    };
  };
}

/**
 * SpecAssembler - Combines all agent outputs into final spec.ai.json
 *
 * This class is responsible for:
 * - Merging outputs from all compilation agents
 * - Generating tasks based on entities, APIs, and scenarios
 * - Ensuring ID consistency and proper linking
 * - Validating the final specification
 * - Creating the canonical spec.ai.json structure
 */
export class SpecAssembler {
  private config: AssemblyConfig;

  constructor(config: Partial<AssemblyConfig> = {}) {
    this.config = AssemblyConfigSchema.parse(config);
  }

  /**
   * Assemble all agent results into final spec
   */
  async assembleSpec(
    summary: SummaryResult,
    entityApi: EntityApiResult,
    constraints: ConstraintsResult,
    scenarios: ScenariosResult,
    hints: HintsResult,
    sourceFile?: string
  ): Promise<AssemblyResult> {
    console.log("🔧 Assembling specification...");

    const validationIssues: string[] = [];
    const warnings: string[] = [];

    // Step 1: Create personas from summary
    const personas = this.createPersonas(summary, hints);

    // Step 2: Ensure scenario IDs are sequential and unique
    const processedScenarios = this.processScenarios(scenarios.scenarios);

    // Step 3: Generate tasks if enabled
    let tasks: Spec["tasks"] = [];
    if (this.config.generateTasks) {
      tasks = await this.generateTasks(
        entityApi,
        processedScenarios,
        constraints.constraints,
        hints
      );
    }

    // Step 4: Create the final spec
    const spec: Spec = {
      project: summary.project,
      version: summary.version || "1.0.0",
      description: summary.description,
      personas,
      entities: entityApi.entities,
      apis: entityApi.apis,
      constraints: constraints.constraints,
      scenarios: processedScenarios,
      tasks,
      metadata: {
        compiledAt: new Date(),
        compiledBy: "ideaforge",
        sourceFile,
        totalEstimatedHours: this.calculateEstimatedHours(tasks, hints),
      },
    };

    // Step 5: Validate the assembled spec
    try {
      const validatedSpec = SpecSchema.parse(spec);
      console.log("✅ Specification validation passed");

      return {
        spec: validatedSpec,
        metadata: {
          agentResults: {
            summary,
            entityApi,
            constraints,
            scenarios,
            hints,
          },
          assembly: {
            tasksGenerated: tasks.length,
            scenariosLinked: processedScenarios.length,
            constraintsApplied: constraints.constraints.length,
            validationIssues,
            warnings,
          },
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.errors.map(
          (e) => `${e.path.join(".")}: ${e.message}`
        );
        throw new Error(
          `Specification validation failed: ${issues.join(", ")}`
        );
      }
      throw error;
    }
  }

  /**
   * Create personas from summary and hints
   */
  private createPersonas(
    summary: SummaryResult,
    hints: HintsResult
  ): Spec["personas"] {
    const personas: Spec["personas"] = [];

    // Add personas from summary if available
    if (summary.stakeholders && summary.stakeholders.length > 0) {
      summary.stakeholders.forEach((stakeholder) => {
        personas.push({
          name: stakeholder,
          goals: summary.businessGoals.slice(0, 3), // Limit to first 3 goals
        });
      });
    }

    // If no personas from summary, create default ones based on project type
    if (personas.length === 0) {
      const projectType = summary.project.toLowerCase();

      if (projectType.includes("ecommerce") || projectType.includes("shop")) {
        personas.push(
          {
            name: "Customer",
            goals: ["Browse products", "Make purchases", "Track orders"],
          },
          {
            name: "Admin",
            goals: ["Manage inventory", "Process orders", "View analytics"],
          }
        );
      } else if (projectType.includes("todo") || projectType.includes("task")) {
        personas.push({
          name: "User",
          goals: ["Create tasks", "Track progress", "Organize work"],
        });
      } else {
        // Generic personas
        personas.push(
          {
            name: "End User",
            goals: ["Use the application", "Achieve their objectives"],
          },
          {
            name: "Administrator",
            goals: ["Manage the system", "Monitor performance"],
          }
        );
      }
    }

    return personas;
  }

  /**
   * Process scenarios to ensure unique, sequential IDs
   */
  private processScenarios(
    scenarios: ScenariosResult["scenarios"]
  ): Spec["scenarios"] {
    return scenarios.map((scenario, index) => ({
      ...scenario,
      id: `AC-${String(index + 1).padStart(3, "0")}`, // Ensure sequential IDs
    }));
  }

  /**
   * Generate tasks based on entities, scenarios, and constraints
   */
  private async generateTasks(
    entityApi: EntityApiResult,
    scenarios: Spec["scenarios"],
    constraints: Spec["constraints"],
    hints: HintsResult
  ): Promise<Spec["tasks"]> {
    const tasks: Spec["tasks"] = [];
    let taskCounter = 1;

    // Task 1: Project setup and infrastructure
    tasks.push({
      id: `T-${String(taskCounter++).padStart(3, "0")}`,
      title: "Project Setup and Infrastructure",
      description:
        "Initialize project structure, dependencies, and development environment",
      dependsOn: [],
      deliverables: [
        "package.json",
        "tsconfig.json",
        "README.md",
        ".gitignore",
        "src/index.ts",
      ],
      acceptanceCriteria: [],
      estimatedComplexity: "low",
      ownerAgent: "code-ts",
      runtime: {
        language: "typescript",
        framework: this.inferFramework(hints),
        database: this.inferDatabase(hints),
      },
    });

    // Generate entity-based tasks
    entityApi.entities.forEach((entity) => {
      const entityTasks = this.generateEntityTasks(
        entity,
        taskCounter,
        scenarios,
        constraints
      );
      tasks.push(...entityTasks);
      taskCounter += entityTasks.length;
    });

    // Generate API-based tasks
    if (entityApi.apis.length > 0) {
      const apiTask = {
        id: `T-${String(taskCounter++).padStart(3, "0")}`,
        title: "API Implementation",
        description:
          "Implement REST API endpoints with proper validation and error handling",
        dependsOn: tasks.slice(-entityApi.entities.length).map((t) => t.id), // Depend on entity tasks
        deliverables: [
          "src/routes/index.ts",
          "src/middleware/validation.ts",
          "src/middleware/errorHandler.ts",
          "tests/api.spec.ts",
        ],
        acceptanceCriteria: scenarios
          .filter(
            (s) =>
              s.when.toLowerCase().includes("api") ||
              s.when.toLowerCase().includes("endpoint")
          )
          .map((s) => s.id)
          .slice(0, 5), // Limit to first 5 relevant scenarios
        estimatedComplexity: "medium",
        ownerAgent: "code-ts",
      };
      tasks.push(apiTask);
    }

    // Generate security tasks if security constraints exist
    const securityConstraints = constraints.filter(
      (c) => c.type === "security"
    );
    if (securityConstraints.length > 0) {
      const securityTask = {
        id: `T-${String(taskCounter++).padStart(3, "0")}`,
        title: "Security Implementation",
        description:
          "Implement authentication, authorization, and security measures",
        dependsOn: [tasks[0].id], // Depend on project setup
        deliverables: [
          "src/middleware/auth.ts",
          "src/utils/encryption.ts",
          "src/middleware/security.ts",
          "tests/security.spec.ts",
        ],
        acceptanceCriteria: scenarios
          .filter(
            (s) =>
              s.given.toLowerCase().includes("auth") ||
              s.when.toLowerCase().includes("login") ||
              s.when.toLowerCase().includes("permission")
          )
          .map((s) => s.id)
          .slice(0, 3),
        estimatedComplexity: "high",
        ownerAgent: "code-ts",
      };
      tasks.push(securityTask);
    }

    // Generate testing tasks if enabled
    if (this.config.includeTestTasks) {
      const testingTask = {
        id: `T-${String(taskCounter++).padStart(3, "0")}`,
        title: "Test Suite Implementation",
        description:
          "Implement comprehensive test suite with unit, integration, and e2e tests",
        dependsOn: tasks.slice(-3).map((t) => t.id), // Depend on recent tasks
        deliverables: [
          "tests/unit/",
          "tests/integration/",
          "tests/e2e/",
          "jest.config.js",
          "test-setup.ts",
        ],
        acceptanceCriteria: scenarios.map((s) => s.id), // All scenarios should be testable
        estimatedComplexity: "medium",
        ownerAgent: "code-ts",
      };
      tasks.push(testingTask);
    }

    // Generate documentation tasks if enabled
    if (this.config.includeDocumentationTasks) {
      const docsTask = {
        id: `T-${String(taskCounter++).padStart(3, "0")}`,
        title: "Documentation and Deployment",
        description:
          "Create comprehensive documentation and deployment configuration",
        dependsOn: [tasks[tasks.length - 1].id], // Depend on last task
        deliverables: [
          "docs/API.md",
          "docs/DEPLOYMENT.md",
          "docker-compose.yml",
          "Dockerfile",
          ".github/workflows/ci.yml",
        ],
        acceptanceCriteria: [],
        estimatedComplexity: "low",
        ownerAgent: "code-ts",
      };
      tasks.push(docsTask);
    }

    return tasks;
  }

  /**
   * Generate tasks for a specific entity
   */
  private generateEntityTasks(
    entity: any,
    startCounter: number,
    scenarios: Spec["scenarios"],
    constraints: Spec["constraints"]
  ): Spec["tasks"] {
    const tasks: Spec["tasks"] = [];
    const entityName = entity.name;
    const entityLower = entityName.toLowerCase();

    // Entity model task
    tasks.push({
      id: `T-${String(startCounter).padStart(3, "0")}`,
      title: `${entityName} Model Implementation`,
      description: `Implement ${entityName} data model with validation and relationships`,
      dependsOn: ["T-001"], // Depend on project setup
      deliverables: [
        `src/models/${entityLower}.ts`,
        `src/schemas/${entityLower}.ts`,
        `tests/models/${entityLower}.spec.ts`,
      ],
      acceptanceCriteria: scenarios
        .filter(
          (s) =>
            s.given.toLowerCase().includes(entityLower) ||
            s.when.toLowerCase().includes(entityLower) ||
            s.then.toLowerCase().includes(entityLower)
        )
        .map((s) => s.id)
        .slice(0, 3), // Limit to first 3 relevant scenarios
      estimatedComplexity: "medium",
      ownerAgent: "code-ts",
    });

    // Entity service task
    tasks.push({
      id: `T-${String(startCounter + 1).padStart(3, "0")}`,
      title: `${entityName} Service Implementation`,
      description: `Implement ${entityName} business logic and CRUD operations`,
      dependsOn: [tasks[0].id], // Depend on model
      deliverables: [
        `src/services/${entityLower}.ts`,
        `src/repositories/${entityLower}.ts`,
        `tests/services/${entityLower}.spec.ts`,
      ],
      acceptanceCriteria: scenarios
        .filter(
          (s) =>
            (s.when.toLowerCase().includes("create") &&
              s.when.toLowerCase().includes(entityLower)) ||
            (s.when.toLowerCase().includes("update") &&
              s.when.toLowerCase().includes(entityLower)) ||
            (s.when.toLowerCase().includes("delete") &&
              s.when.toLowerCase().includes(entityLower))
        )
        .map((s) => s.id)
        .slice(0, 4),
      estimatedComplexity: "medium",
      ownerAgent: "code-ts",
    });

    return tasks;
  }

  /**
   * Infer framework from hints
   */
  private inferFramework(hints: HintsResult): string {
    const techStack = hints.techStack.recommended;
    const backendTech = techStack.find((t) => t.category === "backend");

    if (backendTech) {
      if (backendTech.technology.toLowerCase().includes("express"))
        return "express";
      if (backendTech.technology.toLowerCase().includes("fastify"))
        return "fastify";
      if (backendTech.technology.toLowerCase().includes("nest"))
        return "nestjs";
    }

    return "express"; // Default
  }

  /**
   * Infer database from hints
   */
  private inferDatabase(hints: HintsResult): string {
    const techStack = hints.techStack.recommended;
    const dbTech = techStack.find((t) => t.category === "database");

    if (dbTech) {
      if (dbTech.technology.toLowerCase().includes("postgres"))
        return "postgresql";
      if (dbTech.technology.toLowerCase().includes("mysql")) return "mysql";
      if (dbTech.technology.toLowerCase().includes("mongo")) return "mongodb";
      if (dbTech.technology.toLowerCase().includes("sqlite")) return "sqlite";
    }

    return "sqlite"; // Default
  }

  /**
   * Calculate estimated hours for the project
   */
  private calculateEstimatedHours(
    tasks: Spec["tasks"],
    hints: HintsResult
  ): number {
    const complexityHours = {
      low: 8,
      medium: 16,
      high: 32,
      critical: 48,
    };

    const totalHours = tasks.reduce((total, task) => {
      const complexity = task.estimatedComplexity || "medium";
      return total + complexityHours[complexity];
    }, 0);

    // Add buffer based on project complexity
    const buffer = Math.ceil(totalHours * 0.2); // 20% buffer
    return totalHours + buffer;
  }

  /**
   * Validate task dependencies for cycles
   */
  private validateTaskDependencies(tasks: Spec["tasks"]): string[] {
    const issues: string[] = [];
    const taskIds = new Set(tasks.map((t) => t.id));

    tasks.forEach((task) => {
      // Check if all dependencies exist
      task.dependsOn.forEach((depId) => {
        if (!taskIds.has(depId)) {
          issues.push(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      });

      // TODO: Add cycle detection algorithm
    });

    return issues;
  }
}

// Factory function for easy instantiation
export function createSpecAssembler(
  config?: Partial<AssemblyConfig>
): SpecAssembler {
  return new SpecAssembler(config);
}
