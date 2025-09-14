import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";
import { ScenarioSchema, type Scenario } from "../schemas/spec.js";

// Scenarios extraction result schema - simplified
const ScenariosResultSchema = z.object({
  scenarios: z.any().default([]),
  categories: z.any().optional(),
  coverage: z.any().optional(),
  testSuggestions: z.any().default([]),
});

export type ScenariosResult = z.infer<typeof ScenariosResultSchema>;

/**
 * Scenarios Agent - Generates Given/When/Then acceptance criteria
 *
 * This agent is responsible for:
 * - Converting user stories into testable acceptance criteria
 * - Creating comprehensive scenario coverage (happy path, edge cases, errors)
 * - Generating Given/When/Then format scenarios
 * - Identifying test automation opportunities
 * - Ensuring business rule coverage through scenarios
 */
export class ScenariosAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  async extractScenarios(
    prdContent: string,
    entities?: any[],
    apis?: any[],
    constraints?: any[]
  ): Promise<ScenariosResult> {
    const systemPrompt = `You are the Scenarios Agent in the IdeaForge system. Your job is to generate comprehensive acceptance criteria in Given/When/Then format from a Product Requirements Document.

Your responsibilities:
1. HAPPY PATH: Normal user flows and successful operations
2. EDGE CASES: Boundary conditions, unusual but valid scenarios
3. ERROR HANDLING: Invalid inputs, system failures, network issues
4. SECURITY: Authentication, authorization, data protection scenarios
5. PERFORMANCE: Load, stress, and timing-related scenarios

Guidelines for scenarios:
- Use clear Given/When/Then format
- Each scenario should be testable and specific
- Include both positive and negative test cases
- Cover all user roles and permissions
- Consider integration points and external dependencies
- Ensure scenarios are independent and can run in any order

Format requirements:
- ID: AC-001, AC-002, etc. (sequential numbering)
- Given: Initial state/context (what exists before the action)
- When: The action being performed (what the user does)
- Then: Expected outcome (what should happen)
- Priority: low/medium/high/critical based on business impact

Focus on creating scenarios that:
- Validate business rules and constraints
- Cover all user journeys end-to-end
- Test error conditions and recovery
- Verify security and access controls
- Validate performance requirements

IMPORTANT: Return ONLY valid JSON that matches the expected schema. Do not include any explanatory text, markdown formatting, or code blocks. Your response must be parseable JSON.`;

    const contextInfo = [];
    if (entities?.length) {
      contextInfo.push(
        `Entities: ${entities.map((e: any) => e.name).join(", ")}`
      );
    }
    if (apis?.length) {
      contextInfo.push(
        `APIs: ${apis.map((a: any) => `${a.method} ${a.route}`).join(", ")}`
      );
    }
    if (constraints?.length) {
      contextInfo.push(
        `Constraints: ${constraints.map((c: any) => c.rule).join(", ")}`
      );
    }

    const userPrompt = `Analyze this PRD and generate comprehensive acceptance criteria scenarios:

${prdContent}

${
  contextInfo.length > 0
    ? `\nContext Information:\n${contextInfo.join("\n")}`
    : ""
}

Generate scenarios that cover:
1. All user stories and use cases mentioned
2. CRUD operations for each entity
3. API endpoint behaviors (success and failure cases)
4. Business rule validation
5. Security and access control
6. Error handling and edge cases
7. Performance and scalability requirements
8. Integration with external systems

Ensure each scenario:
- Has a unique ID (AC-001, AC-002, etc.)
- Follows Given/When/Then format precisely
- Is specific and testable
- Covers both positive and negative cases
- Includes appropriate priority level

Provide comprehensive scenario coverage in JSON format. Return ONLY valid JSON without any additional text or formatting.`;

    try {
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.3, // Moderate creativity for comprehensive scenario generation
        maxTokens: 4000,
      });

      // Parse and validate the result
      let scenariosData: any;
      try {
        scenariosData = parseJsonResponse(result.text);
        console.log("✅ Scenarios data parsed successfully");
      } catch (parseError) {
        console.error(
          "❌ Scenarios JSON parsing failed. Raw response:",
          result.text.substring(0, 500) + "..."
        );
        throw new Error(
          `Failed to parse scenarios result as JSON: ${parseError}`
        );
      }

      // Validate against schema
      const validatedResult = ScenariosResultSchema.parse(scenariosData);
      console.log("✅ Scenarios validation passed");

      // Transform and categorize scenarios
      const transformedResult = this.transformScenariosData(validatedResult);
      console.log("🎯 Scenarios found:", transformedResult.scenarios.length);

      return transformedResult;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Scenarios validation failed: ${error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", ")}`
        );
      }
      throw error;
    }
  }

  /**
   * Transform raw LLM data to our expected format
   */
  private transformScenariosData(data: any): ScenariosResult {
    // Handle different scenario formats
    let scenarios = [];
    if (Array.isArray(data.scenarios)) {
      scenarios = data.scenarios;
    } else if (data.scenarios && typeof data.scenarios === "object") {
      scenarios = Object.values(data.scenarios).flat();
    }

    // Ensure each scenario has the required fields and sequential IDs
    const formattedScenarios = scenarios.map(
      (scenario: any, index: number) => ({
        id: scenario.id || `AC-${String(index + 1).padStart(3, "0")}`,
        given: scenario.given || scenario.Given || "",
        when: scenario.when || scenario.When || "",
        then: scenario.then || scenario.Then || "",
        priority: scenario.priority || "medium",
      })
    );

    const categorized = this.categorizeScenarios(formattedScenarios);
    const testSuggestions = this.generateTestSuggestions(formattedScenarios);

    return {
      scenarios: formattedScenarios,
      categories: categorized,
      coverage: data.coverage || {
        userStories: [],
        businessRules: [],
        integrationPoints: [],
      },
      testSuggestions,
    };
  }

  /**
   * Categorize scenarios by type
   */
  private categorizeScenarios(
    scenarios: Scenario[]
  ): ScenariosResult["categories"] {
    const categories = {
      happy_path: [] as Scenario[],
      edge_cases: [] as Scenario[],
      error_handling: [] as Scenario[],
      security: [] as Scenario[],
      performance: [] as Scenario[],
    };

    scenarios.forEach((scenario) => {
      const content =
        `${scenario.given} ${scenario.when} ${scenario.then}`.toLowerCase();

      if (
        content.includes("invalid") ||
        content.includes("error") ||
        content.includes("fail")
      ) {
        categories.error_handling.push(scenario);
      } else if (
        content.includes("auth") ||
        content.includes("permission") ||
        content.includes("unauthorized")
      ) {
        categories.security.push(scenario);
      } else if (
        content.includes("performance") ||
        content.includes("load") ||
        content.includes("concurrent")
      ) {
        categories.performance.push(scenario);
      } else if (
        content.includes("empty") ||
        content.includes("maximum") ||
        content.includes("minimum") ||
        content.includes("boundary")
      ) {
        categories.edge_cases.push(scenario);
      } else {
        categories.happy_path.push(scenario);
      }
    });

    return categories;
  }

  /**
   * Generate test automation suggestions
   */
  private generateTestSuggestions(
    scenarios: Scenario[]
  ): ScenariosResult["testSuggestions"] {
    const suggestions: ScenariosResult["testSuggestions"] = [];

    scenarios.forEach((scenario) => {
      const content =
        `${scenario.given} ${scenario.when} ${scenario.then}`.toLowerCase();

      // Determine test type based on scenario content
      let testType:
        | "unit"
        | "integration"
        | "e2e"
        | "performance"
        | "security" = "e2e";

      if (content.includes("api") || content.includes("endpoint")) {
        testType = "integration";
      } else if (
        content.includes("performance") ||
        content.includes("load") ||
        content.includes("concurrent")
      ) {
        testType = "performance";
      } else if (
        content.includes("auth") ||
        content.includes("security") ||
        content.includes("permission")
      ) {
        testType = "security";
      } else if (
        content.includes("validation") ||
        content.includes("calculate") ||
        content.includes("format")
      ) {
        testType = "unit";
      }

      suggestions.push({
        scenarioId: scenario.id,
        testType,
        description: `Automated test for: ${scenario.when}`,
        priority: scenario.priority || "medium",
      });
    });

    return suggestions;
  }

  /**
   * Generate test cases in Gherkin format
   */
  generateGherkinFeatures(scenarios: Scenario[]): string {
    const features = ["Feature: Application Scenarios\n"];

    const categories = this.categorizeScenarios(scenarios);

    Object.entries(categories).forEach(([category, categoryScenarios]) => {
      if (categoryScenarios.length > 0) {
        features.push(
          `  # ${category.replace("_", " ").toUpperCase()} SCENARIOS\n`
        );

        categoryScenarios.forEach((scenario) => {
          features.push(
            `  Scenario: ${scenario.id} - ${this.generateScenarioTitle(
              scenario
            )}`
          );
          features.push(`    Given ${scenario.given}`);
          features.push(`    When ${scenario.when}`);
          features.push(`    Then ${scenario.then}`);
          features.push("");
        });
      }
    });

    return features.join("\n");
  }

  private generateScenarioTitle(scenario: Scenario): string {
    // Extract a concise title from the When clause
    const when = scenario.when.toLowerCase();
    if (when.includes("user")) {
      return when
        .replace("user", "User")
        .replace(/^./, (str) => str.toUpperCase());
    }
    return scenario.when.charAt(0).toUpperCase() + scenario.when.slice(1);
  }

  /**
   * Generate test automation code templates
   */
  generateTestTemplates(
    scenarios: Scenario[],
    framework: "jest" | "cypress" | "playwright" = "jest"
  ): string {
    const templates = [];

    if (framework === "jest") {
      templates.push(
        "import { describe, it, expect, beforeEach } from '@jest/globals';\n"
      );
      templates.push("describe('Application Scenarios', () => {");
      templates.push("  beforeEach(() => {");
      templates.push("    // Setup test environment");
      templates.push("  });\n");

      scenarios.forEach((scenario) => {
        templates.push(
          `  it('${scenario.id}: ${this.generateScenarioTitle(
            scenario
          )}', async () => {`
        );
        templates.push(`    // Given: ${scenario.given}`);
        templates.push(`    // TODO: Setup initial state`);
        templates.push("");
        templates.push(`    // When: ${scenario.when}`);
        templates.push(`    // TODO: Perform action`);
        templates.push("");
        templates.push(`    // Then: ${scenario.then}`);
        templates.push(`    // TODO: Assert expected outcome`);
        templates.push(
          `    expect(true).toBe(true); // Replace with actual assertion`
        );
        templates.push("  });\n");
      });

      templates.push("});");
    }

    return templates.join("\n");
  }

  /**
   * Validate scenario coverage
   */
  validateScenarioCoverage(
    scenarios: Scenario[],
    entities?: any[],
    apis?: any[]
  ): {
    coverage: number;
    missing: string[];
    suggestions: string[];
  } {
    const missing: string[] = [];
    const suggestions: string[] = [];
    let totalExpected = 0;
    let covered = 0;

    // Check entity coverage
    if (entities?.length) {
      entities.forEach((entity: any) => {
        const entityName = entity.name.toLowerCase();
        totalExpected += 4; // CRUD operations

        const createScenario = scenarios.find(
          (s) =>
            s.when.toLowerCase().includes("create") &&
            s.when.toLowerCase().includes(entityName)
        );
        const readScenario = scenarios.find(
          (s) =>
            (s.when.toLowerCase().includes("view") ||
              s.when.toLowerCase().includes("get")) &&
            s.when.toLowerCase().includes(entityName)
        );
        const updateScenario = scenarios.find(
          (s) =>
            s.when.toLowerCase().includes("update") &&
            s.when.toLowerCase().includes(entityName)
        );
        const deleteScenario = scenarios.find(
          (s) =>
            s.when.toLowerCase().includes("delete") &&
            s.when.toLowerCase().includes(entityName)
        );

        if (createScenario) covered++;
        else missing.push(`Create ${entity.name} scenario`);

        if (readScenario) covered++;
        else missing.push(`Read/View ${entity.name} scenario`);

        if (updateScenario) covered++;
        else missing.push(`Update ${entity.name} scenario`);

        if (deleteScenario) covered++;
        else missing.push(`Delete ${entity.name} scenario`);
      });
    }

    // Check API coverage
    if (apis?.length) {
      apis.forEach((api: any) => {
        totalExpected += 2; // Success and error cases

        const successScenario = scenarios.find(
          (s) =>
            s.when.toLowerCase().includes(api.method.toLowerCase()) &&
            s.when.toLowerCase().includes(api.route.split("/")[1])
        );
        const errorScenario = scenarios.find(
          (s) =>
            s.when.toLowerCase().includes(api.method.toLowerCase()) &&
            s.when.toLowerCase().includes(api.route.split("/")[1]) &&
            (s.then.toLowerCase().includes("error") ||
              s.then.toLowerCase().includes("fail"))
        );

        if (successScenario) covered++;
        else missing.push(`Success case for ${api.method} ${api.route}`);

        if (errorScenario) covered++;
        else missing.push(`Error case for ${api.method} ${api.route}`);
      });
    }

    // General coverage suggestions
    const hasAuthScenarios = scenarios.some(
      (s) =>
        s.given.toLowerCase().includes("auth") ||
        s.when.toLowerCase().includes("login")
    );
    if (!hasAuthScenarios) {
      suggestions.push("Add authentication and authorization scenarios");
    }

    const hasErrorScenarios = scenarios.some(
      (s) =>
        s.then.toLowerCase().includes("error") ||
        s.then.toLowerCase().includes("fail")
    );
    if (!hasErrorScenarios) {
      suggestions.push("Add error handling scenarios");
    }

    const coverage =
      totalExpected > 0 ? Math.round((covered / totalExpected) * 100) : 100;

    return {
      coverage,
      missing,
      suggestions,
    };
  }

  /**
   * Generate scenario traceability matrix
   */
  generateTraceabilityMatrix(
    scenarios: Scenario[],
    userStories: string[]
  ): string {
    const matrix = ["# Traceability Matrix\n"];
    matrix.push("| User Story | Scenarios | Coverage |");
    matrix.push("|------------|-----------|----------|");

    userStories.forEach((story) => {
      const relatedScenarios = scenarios.filter((scenario) =>
        this.isScenarioRelatedToStory(scenario, story)
      );

      const scenarioIds = relatedScenarios.map((s) => s.id).join(", ");
      const coverage = relatedScenarios.length > 0 ? "✅" : "❌";

      matrix.push(`| ${story} | ${scenarioIds || "None"} | ${coverage} |`);
    });

    return matrix.join("\n");
  }

  private isScenarioRelatedToStory(scenario: Scenario, story: string): boolean {
    const scenarioText =
      `${scenario.given} ${scenario.when} ${scenario.then}`.toLowerCase();
    const storyWords = story
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 3);

    return storyWords.some((word) => scenarioText.includes(word));
  }
}

// Factory function for easy instantiation
export function createScenariosAgent(model?: string): ScenariosAgent {
  return new ScenariosAgent(model);
}
