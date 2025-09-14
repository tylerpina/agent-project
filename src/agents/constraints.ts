import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";
import { ConstraintSchema, type Constraint } from "../schemas/spec.js";

// Constraints extraction result schema - simplified
const ConstraintsResultSchema = z.object({
  constraints: z.any().default([]),
  categories: z.any().optional(),
  recommendations: z.any().default([]),
});

export type ConstraintsResult = z.infer<typeof ConstraintsResultSchema>;

/**
 * Constraints Agent - Extracts performance, security, compliance, and UX constraints
 *
 * This agent is responsible for:
 * - Identifying performance requirements (response times, throughput, scalability)
 * - Extracting security constraints (authentication, authorization, data protection)
 * - Finding compliance requirements (GDPR, HIPAA, SOX, etc.)
 * - Understanding UX constraints (accessibility, browser support, mobile requirements)
 * - Capturing business constraints (budget, timeline, resource limitations)
 */
export class ConstraintsAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  async extractConstraints(
    prdContent: string,
    projectContext?: any
  ): Promise<ConstraintsResult> {
    const systemPrompt = `You are the Constraints Agent in the IdeaForge system. Your job is to extract all technical and business constraints from a Product Requirements Document.

Your responsibilities:
1. PERFORMANCE: Response times, throughput, scalability, load requirements
2. SECURITY: Authentication, authorization, data protection, encryption, compliance
3. COMPLIANCE: Regulatory requirements (GDPR, HIPAA, SOX, PCI-DSS, etc.)
4. UX: Accessibility (WCAG), browser support, mobile requirements, usability standards
5. BUSINESS: Budget, timeline, resource limitations, operational constraints

Guidelines:
- Be specific with measurable constraints (e.g., "response time < 200ms" not "fast response")
- Identify implicit constraints that may not be explicitly stated
- Categorize constraints by type and priority
- Consider industry standards and best practices
- Flag potential conflicts between constraints

For each constraint, provide:
- Clear, actionable rule statement
- Appropriate category (perf/security/compliance/ux/business)
- Specific value or threshold where applicable
- Priority level (low/medium/high/critical)

Return structured JSON that matches the expected schema.`;

    const userPrompt = `Analyze this PRD and extract all constraints and requirements:

${prdContent}

${
  projectContext
    ? `\nProject Context: ${JSON.stringify(projectContext, null, 2)}`
    : ""
}

Focus on identifying:
1. Performance requirements (response times, concurrent users, data volumes)
2. Security requirements (authentication, encryption, access control)
3. Compliance requirements (regulations, standards, certifications)
4. UX requirements (accessibility, browser support, mobile compatibility)
5. Business constraints (budget, timeline, resource limitations)
6. Technical constraints (platform requirements, integration limitations)

Also provide recommendations for additional constraints that should be considered based on the project type and industry.

Provide a comprehensive analysis in JSON format.`;

    try {
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.1, // Low temperature for consistent constraint extraction
        maxTokens: 2500,
      });

      // Parse and validate the result
      let constraintsData: any;
      try {
        constraintsData = parseJsonResponse(result.text);
      } catch (parseError) {
        throw new Error(
          `Failed to parse constraints result as JSON: ${parseError}`
        );
      }

      // Validate against schema
      const validatedResult = ConstraintsResultSchema.parse(constraintsData);
      console.log("✅ Constraints validation passed");

      // Transform and categorize constraints
      const transformedResult = this.transformConstraintsData(validatedResult);
      console.log(
        "📊 Constraints found:",
        transformedResult.constraints.length
      );

      return transformedResult;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Constraints validation failed: ${error.errors
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
  private transformConstraintsData(data: any): ConstraintsResult {
    // Handle different constraint formats
    let constraints = [];
    if (Array.isArray(data.constraints)) {
      constraints = data.constraints;
    } else if (data.constraints && typeof data.constraints === "object") {
      // If constraints is an object, flatten it
      constraints = Object.values(data.constraints).flat();
    }

    // Ensure each constraint has the required fields
    const formattedConstraints = constraints.map((constraint: any) => ({
      rule: constraint.rule || constraint.constraint || String(constraint),
      type: constraint.type || "business",
      value: constraint.value,
      priority: constraint.priority || "medium",
    }));

    const categorized = this.categorizeConstraints(formattedConstraints);

    return {
      constraints: formattedConstraints,
      categories: categorized,
      recommendations: data.recommendations || [],
    };
  }

  /**
   * Categorize constraints by type
   */
  private categorizeConstraints(
    constraints: Constraint[]
  ): ConstraintsResult["categories"] {
    const categories = {
      performance: [] as Constraint[],
      security: [] as Constraint[],
      compliance: [] as Constraint[],
      ux: [] as Constraint[],
      business: [] as Constraint[],
    };

    constraints.forEach((constraint) => {
      categories[constraint.type].push(constraint);
    });

    return categories;
  }

  /**
   * Generate constraints checklist for development teams
   */
  generateConstraintsChecklist(constraints: Constraint[]): string {
    const sections = ["# Constraints Checklist\n"];

    const categories = this.categorizeConstraints(constraints);

    Object.entries(categories).forEach(([category, categoryConstraints]) => {
      if (categoryConstraints.length > 0) {
        sections.push(
          `## ${
            category.charAt(0).toUpperCase() + category.slice(1)
          } Constraints\n`
        );

        categoryConstraints.forEach((constraint) => {
          const priority = constraint.priority || "medium";
          const priorityEmoji = {
            low: "🟢",
            medium: "🟡",
            high: "🟠",
            critical: "🔴",
          }[priority];

          sections.push(`- [ ] ${priorityEmoji} **${constraint.rule}**`);
          if (constraint.value) {
            sections.push(`  - Target: ${constraint.value}`);
          }
          sections.push("");
        });
      }
    });

    return sections.join("\n");
  }

  /**
   * Validate constraints for conflicts and feasibility
   */
  validateConstraints(constraints: Constraint[]): {
    isValid: boolean;
    conflicts: string[];
    warnings: string[];
    suggestions: string[];
  } {
    const conflicts: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check for conflicting performance constraints
    const perfConstraints = constraints.filter((c) => c.type === "perf");
    const responseTimeConstraints = perfConstraints.filter(
      (c) =>
        c.rule.toLowerCase().includes("response") &&
        c.rule.toLowerCase().includes("time")
    );

    if (responseTimeConstraints.length > 1) {
      const values = responseTimeConstraints
        .map((c) => c.value)
        .filter(Boolean);
      if (values.length > 1 && new Set(values).size > 1) {
        conflicts.push("Multiple conflicting response time requirements found");
      }
    }

    // Check for security vs performance conflicts
    const securityConstraints = constraints.filter(
      (c) => c.type === "security"
    );
    const hasEncryption = securityConstraints.some((c) =>
      c.rule.toLowerCase().includes("encrypt")
    );
    const hasStrictPerf = perfConstraints.some(
      (c) => c.value && parseFloat(c.value.replace(/[^\d.]/g, "")) < 100 // < 100ms
    );

    if (hasEncryption && hasStrictPerf) {
      warnings.push(
        "Encryption requirements may impact strict performance targets"
      );
    }

    // Check for missing common constraints
    const hasAuth = securityConstraints.some((c) =>
      c.rule.toLowerCase().includes("auth")
    );
    const hasHttps = securityConstraints.some(
      (c) =>
        c.rule.toLowerCase().includes("https") ||
        c.rule.toLowerCase().includes("ssl")
    );
    const hasAccessibility = constraints.some(
      (c) => c.type === "ux" && c.rule.toLowerCase().includes("accessibility")
    );

    if (!hasAuth) {
      suggestions.push("Consider adding authentication requirements");
    }
    if (!hasHttps) {
      suggestions.push("Consider requiring HTTPS/SSL encryption");
    }
    if (!hasAccessibility) {
      suggestions.push(
        "Consider adding accessibility requirements (WCAG compliance)"
      );
    }

    // Check for unrealistic constraints
    perfConstraints.forEach((constraint) => {
      if (constraint.value) {
        const numValue = parseFloat(constraint.value.replace(/[^\d.]/g, ""));
        if (
          constraint.rule.toLowerCase().includes("response") &&
          numValue < 10
        ) {
          warnings.push(
            `Response time requirement of ${constraint.value} may be unrealistic for complex operations`
          );
        }
      }
    });

    return {
      isValid: conflicts.length === 0,
      conflicts,
      warnings,
      suggestions,
    };
  }

  /**
   * Generate implementation guidelines for constraints
   */
  generateImplementationGuidelines(constraints: Constraint[]): string {
    const sections = ["# Implementation Guidelines\n"];

    const categories = this.categorizeConstraints(constraints);

    // Performance guidelines
    if (categories.performance.length > 0) {
      sections.push("## Performance Implementation\n");
      categories.performance.forEach((constraint) => {
        sections.push(`### ${constraint.rule}`);
        sections.push(this.getPerformanceGuideline(constraint));
        sections.push("");
      });
    }

    // Security guidelines
    if (categories.security.length > 0) {
      sections.push("## Security Implementation\n");
      categories.security.forEach((constraint) => {
        sections.push(`### ${constraint.rule}`);
        sections.push(this.getSecurityGuideline(constraint));
        sections.push("");
      });
    }

    // UX guidelines
    if (categories.ux.length > 0) {
      sections.push("## UX Implementation\n");
      categories.ux.forEach((constraint) => {
        sections.push(`### ${constraint.rule}`);
        sections.push(this.getUxGuideline(constraint));
        sections.push("");
      });
    }

    return sections.join("\n");
  }

  private getPerformanceGuideline(constraint: Constraint): string {
    const rule = constraint.rule.toLowerCase();

    if (rule.includes("response time")) {
      return `- Implement caching strategies (Redis, CDN)
- Optimize database queries with proper indexing
- Use connection pooling
- Consider async processing for heavy operations
- Monitor with APM tools`;
    }

    if (rule.includes("concurrent") || rule.includes("load")) {
      return `- Implement horizontal scaling
- Use load balancers
- Optimize resource usage
- Implement circuit breakers
- Load test regularly`;
    }

    if (rule.includes("availability") || rule.includes("uptime")) {
      return `- Implement health checks
- Use multiple availability zones
- Set up monitoring and alerting
- Plan for graceful degradation
- Implement backup systems`;
    }

    return "- Review performance best practices for your technology stack";
  }

  private getSecurityGuideline(constraint: Constraint): string {
    const rule = constraint.rule.toLowerCase();

    if (rule.includes("authentication")) {
      return `- Implement OAuth 2.0 or JWT tokens
- Use secure session management
- Implement multi-factor authentication
- Follow OWASP authentication guidelines`;
    }

    if (rule.includes("encryption")) {
      return `- Use TLS 1.3 for data in transit
- Implement AES-256 for data at rest
- Use proper key management
- Hash passwords with bcrypt or Argon2`;
    }

    if (rule.includes("authorization")) {
      return `- Implement role-based access control (RBAC)
- Use principle of least privilege
- Validate permissions on every request
- Implement proper session management`;
    }

    return "- Follow OWASP security guidelines";
  }

  private getUxGuideline(constraint: Constraint): string {
    const rule = constraint.rule.toLowerCase();

    if (rule.includes("accessibility")) {
      return `- Follow WCAG 2.1 AA guidelines
- Implement proper ARIA labels
- Ensure keyboard navigation
- Test with screen readers
- Maintain color contrast ratios`;
    }

    if (rule.includes("mobile") || rule.includes("responsive")) {
      return `- Use responsive design principles
- Test on multiple device sizes
- Optimize touch interactions
- Consider mobile-first approach
- Test performance on mobile networks`;
    }

    if (rule.includes("browser")) {
      return `- Test on target browsers
- Use progressive enhancement
- Implement proper polyfills
- Consider graceful degradation`;
    }

    return "- Follow UX best practices and usability guidelines";
  }

  /**
   * Suggest additional constraints based on project type
   */
  suggestAdditionalConstraints(
    projectType: string,
    existingConstraints: Constraint[]
  ): Constraint[] {
    const suggestions: Constraint[] = [];
    const existingRules = existingConstraints.map((c) => c.rule.toLowerCase());

    // Common constraints for all projects
    const commonConstraints = [
      {
        rule: "HTTPS required for all communications",
        type: "security" as const,
        priority: "high" as const,
      },
      {
        rule: "Input validation on all user inputs",
        type: "security" as const,
        priority: "high" as const,
      },
      {
        rule: "Error handling must not expose sensitive information",
        type: "security" as const,
        priority: "medium" as const,
      },
      {
        rule: "Logging must not include sensitive data",
        type: "security" as const,
        priority: "medium" as const,
      },
    ];

    // Project-specific constraints
    if (
      projectType.toLowerCase().includes("ecommerce") ||
      projectType.toLowerCase().includes("payment")
    ) {
      const ecommerceConstraints = [
        {
          rule: "PCI DSS compliance required",
          type: "compliance" as const,
          priority: "critical" as const,
        },
        {
          rule: "Payment data must be encrypted",
          type: "security" as const,
          priority: "critical" as const,
        },
        {
          rule: "Cart abandonment recovery within 24 hours",
          type: "business" as const,
          priority: "medium" as const,
        },
      ];
      suggestions.push(...ecommerceConstraints);
    }

    if (
      projectType.toLowerCase().includes("healthcare") ||
      projectType.toLowerCase().includes("medical")
    ) {
      const healthcareConstraints = [
        {
          rule: "HIPAA compliance required",
          type: "compliance" as const,
          priority: "critical" as const,
        },
        {
          rule: "Data encryption at rest and in transit",
          type: "security" as const,
          priority: "critical" as const,
        },
        {
          rule: "Audit trail for all data access",
          type: "security" as const,
          priority: "high" as const,
        },
      ];
      suggestions.push(...healthcareConstraints);
    }

    // Filter out constraints that already exist
    return [...commonConstraints, ...suggestions].filter(
      (constraint) =>
        !existingRules.some((existing) =>
          existing.includes(constraint.rule.toLowerCase().substring(0, 10))
        )
    );
  }
}

// Factory function for easy instantiation
export function createConstraintsAgent(model?: string): ConstraintsAgent {
  return new ConstraintsAgent(model);
}
