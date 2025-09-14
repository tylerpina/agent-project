import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";

// Summary extraction result schema - flexible to match LLM response (both snake_case and camelCase)
const SummaryResultSchema = z
  .object({
    // Support both formats
    project_name: z.string().optional(),
    projectName: z.string().optional(),
    description: z
      .string()
      .min(10, "Project description must be at least 10 characters"),
    version: z.string().default("1.0.0"),
    key_stakeholders: z
      .union([z.record(z.string()), z.array(z.any())])
      .optional(),
    keyStakeholders: z
      .union([z.record(z.string()), z.array(z.any())])
      .optional(),
    business_goals: z.array(z.any()).default([]),
    businessGoals: z.array(z.any()).default([]),
    technical_requirements: z.any().optional(),
    technicalRequirements: z.any().optional(),
    project_scope: z.any().optional(),
    projectScope: z.any().optional(),
    timeline_and_milestones: z.any().optional(),
    timeline: z.any().optional(),
    risk_factors_and_dependencies: z.any().optional(),
    risk_factors: z.any().optional(),
    riskFactors: z.any().optional(),
    success_criteria_and_kpis: z.any().optional(),
    success_criteria: z.any().optional(),
    successCriteria: z.any().optional(),
  })
  .refine((data) => data.project_name || data.projectName, {
    message: "Project name is required",
  })
  .transform((data) => ({
    // Transform to our expected format
    project: data.project_name || data.projectName || "",
    description: data.description,
    version: data.version,
    stakeholders: (() => {
      const stakeholders = data.key_stakeholders || data.keyStakeholders;
      return Array.isArray(stakeholders)
        ? stakeholders.map((s: any) => s.role || s.name || String(s))
        : stakeholders
        ? Object.keys(stakeholders)
        : [];
    })(),
    businessGoals: (() => {
      const goals = data.business_goals || data.businessGoals || [];
      return goals.map((goal: any) =>
        typeof goal === "string" ? goal : goal.goal || JSON.stringify(goal)
      );
    })(),
    technicalRequirements: (() => {
      const tech = data.technical_requirements || data.technicalRequirements;
      return tech ? [JSON.stringify(tech)] : [];
    })(),
    scope: (() => {
      const scope = data.project_scope || data.projectScope;
      return scope
        ? {
            inScope: scope.in_scope || scope.inScope || [],
            outOfScope: scope.out_of_scope || scope.outOfScope || [],
          }
        : undefined;
    })(),
    timeline: (() => {
      const timeline = data.timeline_and_milestones || data.timeline;
      return timeline
        ? {
            estimatedWeeks: 14, // Default based on the phases
            milestones: timeline.phases?.map((p: any) => p.phase) || [],
            dependencies: [],
          }
        : undefined;
    })(),
    riskFactors: (() => {
      const risks =
        data.risk_factors_and_dependencies?.high_risk_items ||
        data.risk_factors?.high_risk_items ||
        data.riskFactors;
      return Array.isArray(risks) ? risks.map((r: any) => r.risk || r) : [];
    })(),
    successCriteria: (() => {
      const criteria =
        data.success_criteria_and_kpis?.primary_kpis ||
        data.success_criteria?.primary_kpis ||
        data.successCriteria?.primaryKPIs;
      return Array.isArray(criteria)
        ? criteria.map((kpi: any) => `${kpi.metric}: ${kpi.target}`)
        : [];
    })(),
  }));

export type SummaryResult = z.infer<typeof SummaryResultSchema>;

/**
 * Summary Agent - Extracts high-level project information from PRD
 *
 * This agent is responsible for:
 * - Identifying project name and description
 * - Extracting business goals and stakeholders
 * - Understanding scope and timeline
 * - Identifying risks and success criteria
 */
export class SummaryAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  async extractSummary(
    prdContent: string,
    sourceFile?: string
  ): Promise<SummaryResult> {
    const systemPrompt = `You are the Summary Agent in the IdeaForge system. Your job is to extract high-level project information from a Product Requirements Document (PRD).

Extract and structure the following information:
1. Project name and description
2. Key stakeholders and their roles
3. Business goals and objectives
4. Technical requirements at a high level
5. Project scope (what's in/out of scope)
6. Timeline and milestones if mentioned
7. Risk factors and dependencies
8. Success criteria and KPIs

Be thorough but concise. Focus on the strategic overview rather than detailed technical specifications.
If information is not explicitly stated, make reasonable inferences based on context.

Return your analysis in a structured JSON format that matches the expected schema.`;

    const userPrompt = `Analyze this PRD and extract the high-level project summary:

${prdContent}

${sourceFile ? `\nSource file: ${sourceFile}` : ""}

Please provide a comprehensive project summary in JSON format.`;

    try {
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.1, // Low temperature for consistent extraction
        maxTokens: 2000,
      });

      // Parse and validate the result
      let summaryData: any;
      try {
        summaryData = parseJsonResponse(result.text);
        console.log("✅ Summary data parsed successfully");
      } catch (parseError) {
        console.error(
          "❌ JSON parsing failed. Raw response:",
          result.text.substring(0, 500) + "..."
        );
        throw new Error(
          `Failed to parse summary result as JSON: ${parseError}`
        );
      }

      // Validate against schema
      try {
        const validatedSummary = SummaryResultSchema.parse(summaryData);
        console.log("✅ Summary validation passed");
        return validatedSummary;
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          console.error(
            "❌ Summary validation failed:",
            validationError.errors
          );
          console.error(
            "Raw data structure:",
            JSON.stringify(summaryData, null, 2)
          );
          throw new Error(
            `Summary validation failed: ${validationError.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")}`
          );
        }
        throw validationError;
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate a concise executive summary from the extracted data
   */
  generateExecutiveSummary(summary: SummaryResult): string {
    const sections = [];

    sections.push(`# ${summary.project}`);
    sections.push(`\n${summary.description}`);

    if (summary.businessGoals.length > 0) {
      sections.push(`\n## Business Goals`);
      sections.push(
        summary.businessGoals.map((goal) => `- ${goal}`).join("\n")
      );
    }

    if (summary.technicalRequirements.length > 0) {
      sections.push(`\n## Technical Requirements`);
      sections.push(
        summary.technicalRequirements.map((req) => `- ${req}`).join("\n")
      );
    }

    if (summary.scope) {
      sections.push(`\n## Scope`);
      if (summary.scope.inScope.length > 0) {
        sections.push(`**In Scope:**`);
        sections.push(
          summary.scope.inScope.map((item) => `- ${item}`).join("\n")
        );
      }
      if (summary.scope.outOfScope.length > 0) {
        sections.push(`**Out of Scope:**`);
        sections.push(
          summary.scope.outOfScope.map((item) => `- ${item}`).join("\n")
        );
      }
    }

    if (summary.successCriteria.length > 0) {
      sections.push(`\n## Success Criteria`);
      sections.push(
        summary.successCriteria.map((criteria) => `- ${criteria}`).join("\n")
      );
    }

    if (summary.riskFactors.length > 0) {
      sections.push(`\n## Risk Factors`);
      sections.push(summary.riskFactors.map((risk) => `- ${risk}`).join("\n"));
    }

    return sections.join("\n");
  }

  /**
   * Validate that the PRD contains sufficient information for processing
   */
  async validatePRDCompleteness(prdContent: string): Promise<{
    isComplete: boolean;
    missingElements: string[];
    recommendations: string[];
  }> {
    const systemPrompt = `You are a PRD quality analyzer. Evaluate if this PRD contains sufficient information for automated code generation.

Check for these essential elements:
1. Clear project description and goals
2. User stories or use cases
3. Functional requirements
4. Technical requirements or constraints
5. API endpoints or data models (if applicable)
6. Success criteria or acceptance criteria

Identify what's missing and provide recommendations for improvement.`;

    const userPrompt = `Analyze this PRD for completeness:

${prdContent}

Return a JSON object with:
- isComplete: boolean
- missingElements: array of missing critical elements
- recommendations: array of suggestions to improve the PRD`;

    try {
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.1,
        maxTokens: 1000,
      });

      const analysis = JSON.parse(result.text);
      return {
        isComplete: analysis.isComplete || false,
        missingElements: analysis.missingElements || [],
        recommendations: analysis.recommendations || [],
      };
    } catch (error) {
      return {
        isComplete: false,
        missingElements: ["Failed to analyze PRD completeness"],
        recommendations: [
          "Please ensure the PRD is well-formatted and contains clear requirements",
        ],
      };
    }
  }
}

// Factory function for easy instantiation
export function createSummaryAgent(model?: string): SummaryAgent {
  return new SummaryAgent(model);
}
