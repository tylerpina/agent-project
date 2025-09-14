// Central export file for all agents

export {
  SummaryAgent,
  createSummaryAgent,
  type SummaryResult,
} from "./summary.js";
export {
  EntityApiAgent,
  createEntityApiAgent,
  type EntityApiResult,
} from "./entity-api.js";
export {
  ConstraintsAgent,
  createConstraintsAgent,
  type ConstraintsResult,
} from "./constraints.js";
export {
  ScenariosAgent,
  createScenariosAgent,
  type ScenariosResult,
} from "./scenarios.js";
export {
  HintsAgent,
  createHintsAgent,
  type HintsResult,
  type ImplementationHint,
} from "./hints.js";

// Import for internal use
import { SummaryAgent, createSummaryAgent } from "./summary.js";
import { EntityApiAgent, createEntityApiAgent } from "./entity-api.js";
import { ConstraintsAgent, createConstraintsAgent } from "./constraints.js";
import { ScenariosAgent, createScenariosAgent } from "./scenarios.js";
import { HintsAgent, createHintsAgent } from "./hints.js";

// Compilation orchestrator that coordinates all agents
export class CompilationOrchestrator {
  private summaryAgent: SummaryAgent;
  private entityApiAgent: EntityApiAgent;
  private constraintsAgent: ConstraintsAgent;
  private scenariosAgent: ScenariosAgent;
  private hintsAgent: HintsAgent;

  constructor(model: string = "gpt-4o-mini") {
    this.summaryAgent = createSummaryAgent(model);
    this.entityApiAgent = createEntityApiAgent(model);
    this.constraintsAgent = createConstraintsAgent(model);
    this.scenariosAgent = createScenariosAgent(model);
    this.hintsAgent = createHintsAgent(model);
  }

  /**
   * Run all compilation agents in sequence and return combined results
   */
  async compileAll(prdContent: string, sourceFile?: string) {
    console.log("🔄 Running compilation agents...");

    // Step 1: Extract project summary
    console.log("📋 Extracting project summary...");
    const summary = await this.summaryAgent.extractSummary(
      prdContent,
      sourceFile
    );

    // Step 2: Extract entities and APIs
    console.log("🏗️  Extracting entities and APIs...");
    const entityApi = await this.entityApiAgent.extractEntitiesAndApis(
      prdContent,
      summary
    );

    // Step 3: Extract constraints
    console.log("⚖️  Extracting constraints...");
    const constraints = await this.constraintsAgent.extractConstraints(
      prdContent,
      summary
    );

    // Step 4: Generate scenarios
    console.log("🎯 Generating acceptance criteria scenarios...");
    const scenarios = await this.scenariosAgent.extractScenarios(
      prdContent,
      entityApi.entities,
      entityApi.apis,
      constraints.constraints
    );

    // Step 5: Generate implementation hints
    console.log("💡 Generating implementation hints...");
    const hints = await this.hintsAgent.generateHints(
      prdContent,
      summary,
      entityApi.entities,
      entityApi.apis,
      constraints.constraints
    );

    console.log("✅ All compilation agents completed");

    return {
      summary,
      entityApi,
      constraints,
      scenarios,
      hints,
    };
  }

  /**
   * Validate compilation results for consistency
   */
  validateCompilationResults(results: any): {
    isValid: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check entity-API consistency
    if (
      results.entityApi.entities.length > 0 &&
      results.entityApi.apis.length === 0
    ) {
      warnings.push(
        "Entities defined but no APIs found - consider adding CRUD endpoints"
      );
    }

    // Check scenario coverage
    const entityNames = results.entityApi.entities.map((e: any) =>
      e.name.toLowerCase()
    );
    const scenarioContent = results.scenarios.scenarios
      .map((s: any) => `${s.given} ${s.when} ${s.then}`.toLowerCase())
      .join(" ");

    entityNames.forEach((entityName: string) => {
      if (!scenarioContent.includes(entityName)) {
        warnings.push(`No scenarios found for entity: ${entityName}`);
      }
    });

    // Check constraint-scenario alignment
    const performanceConstraints = results.constraints.constraints.filter(
      (c: any) => c.type === "perf"
    );
    const performanceScenarios = results.scenarios.scenarios.filter(
      (s: any) =>
        s.given.toLowerCase().includes("performance") ||
        s.when.toLowerCase().includes("performance") ||
        s.then.toLowerCase().includes("performance")
    );

    if (
      performanceConstraints.length > 0 &&
      performanceScenarios.length === 0
    ) {
      warnings.push(
        "Performance constraints defined but no performance scenarios found"
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
      warnings,
    };
  }
}

// Factory function for easy instantiation
export function createCompilationOrchestrator(
  model?: string
): CompilationOrchestrator {
  return new CompilationOrchestrator(model);
}

// Export execution agents
export {
  WorkerAgent,
  createWorkerAgent,
  TaskExecutionOrchestrator,
  type WorkerResult,
} from "./worker.js";
export {
  ReviewerAgent,
  createReviewerAgent,
  ReviewLoopOrchestrator,
  type ReviewResult,
} from "./reviewer.js";
export {
  AggregatorAgent,
  createAggregatorAgent,
  ProjectAssemblyOrchestrator,
  type AggregationResult,
} from "./aggregator.js";
