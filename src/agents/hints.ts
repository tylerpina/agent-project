import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";

// Implementation hint schema
const ImplementationHintSchema = z.object({
  category: z.enum([
    "architecture",
    "technology",
    "security",
    "performance",
    "testing",
    "deployment",
    "best_practices",
  ]),
  title: z.string().min(1, "Hint title is required"),
  description: z.string().min(10, "Hint description is required"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  effort: z.enum(["low", "medium", "high"]).default("medium"),
  impact: z.enum(["low", "medium", "high"]).default("medium"),
  technologies: z.array(z.string()).default([]),
  codeExample: z.string().optional(),
  resources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        type: z.enum([
          "documentation",
          "tutorial",
          "library",
          "tool",
          "article",
        ]),
      })
    )
    .default([]),
});

// Hints extraction result schema - simplified
const HintsResultSchema = z.object({
  hints: z.any().default([]),
  techStack: z.any().optional(),
  architecture: z.any().optional(),
  implementation: z.any().optional(),
});

export type ImplementationHint = z.infer<typeof ImplementationHintSchema>;
export type HintsResult = z.infer<typeof HintsResultSchema>;

/**
 * Hints Agent - Provides implementation guidance and technical recommendations
 *
 * This agent is responsible for:
 * - Recommending appropriate technology stacks
 * - Suggesting architectural patterns and best practices
 * - Providing implementation guidance and code examples
 * - Identifying potential risks and mitigation strategies
 * - Recommending development phases and approaches
 * - Suggesting tools and resources for implementation
 */
export class HintsAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  async generateHints(
    prdContent: string,
    summary?: any,
    entities?: any[],
    apis?: any[],
    constraints?: any[]
  ): Promise<HintsResult> {
    const systemPrompt = `You are the Hints Agent in the IdeaForge system. Your job is to provide comprehensive implementation guidance and technical recommendations based on the project requirements.

Your responsibilities:
1. TECHNOLOGY RECOMMENDATIONS: Suggest appropriate tech stack based on requirements
2. ARCHITECTURE GUIDANCE: Recommend patterns, structures, and design approaches
3. IMPLEMENTATION HINTS: Provide specific guidance for complex features
4. BEST PRACTICES: Suggest industry standards and proven approaches
5. RISK MITIGATION: Identify potential issues and suggest solutions
6. RESOURCE RECOMMENDATIONS: Suggest tools, libraries, and learning resources

Guidelines:
- Consider project scale, complexity, and constraints
- Recommend proven, stable technologies over cutting-edge ones
- Provide specific, actionable advice with rationale
- Include code examples where helpful
- Consider team skill level and project timeline
- Balance innovation with pragmatism
- Address security, performance, and maintainability

Focus on:
- Technology stack recommendations with alternatives
- Architectural patterns suitable for the project
- Implementation phases and development approach
- Potential risks and mitigation strategies
- Specific hints for complex features or integrations
- Testing strategies and deployment considerations

Return structured JSON that matches the expected schema.`;

    const contextInfo = [];
    if (summary) {
      contextInfo.push(`Project: ${summary.project || "Unknown"}`);
      contextInfo.push(
        `Description: ${summary.description || "No description"}`
      );
    }
    if (entities?.length) {
      contextInfo.push(
        `Entities: ${entities.map((e: any) => e.name).join(", ")}`
      );
    }
    if (apis?.length) {
      contextInfo.push(`APIs: ${apis.length} endpoints`);
    }
    if (constraints?.length) {
      contextInfo.push(
        `Key Constraints: ${constraints
          .map((c: any) => c.rule)
          .slice(0, 3)
          .join(", ")}`
      );
    }

    const userPrompt = `Analyze this project and provide comprehensive implementation guidance:

${prdContent}

${contextInfo.length > 0 ? `\nProject Context:\n${contextInfo.join("\n")}` : ""}

Provide guidance on:
1. Technology stack recommendations (frontend, backend, database, infrastructure)
2. Architectural patterns and design approaches
3. Implementation phases and development strategy
4. Specific hints for complex features or requirements
5. Security, performance, and scalability considerations
6. Testing strategies and quality assurance
7. Deployment and DevOps recommendations
8. Potential risks and mitigation strategies
9. Useful tools, libraries, and resources

For each recommendation:
- Explain the rationale and benefits
- Consider alternatives and trade-offs
- Provide specific implementation guidance
- Include code examples where helpful
- Suggest relevant resources and documentation

Provide comprehensive implementation guidance in JSON format.`;

    try {
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.4, // Moderate creativity for balanced recommendations
        maxTokens: 4000,
      });

      // Parse and validate the result
      let hintsData: any;
      try {
        hintsData = parseJsonResponse(result.text);
      } catch (parseError) {
        throw new Error(`Failed to parse hints result as JSON: ${parseError}`);
      }

      // Validate against schema
      const validatedResult = HintsResultSchema.parse(hintsData);
      console.log("✅ Hints validation passed");

      // Transform the data to our expected format
      const transformedResult = this.transformHintsData(validatedResult);
      console.log("💡 Hints found:", transformedResult.hints.length);

      return transformedResult;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Hints validation failed: ${error.errors
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
  private transformHintsData(data: any): HintsResult {
    // Handle different hint formats
    let hints = [];
    if (Array.isArray(data.hints)) {
      hints = data.hints;
    } else if (data.hints && typeof data.hints === "object") {
      hints = Object.values(data.hints).flat();
    }

    // Ensure each hint has the required fields
    const formattedHints = hints.map((hint: any) => ({
      category: hint.category || "best_practices",
      title: hint.title || hint.name || "Implementation Hint",
      description: hint.description || hint.recommendation || String(hint),
      priority: hint.priority || "medium",
      effort: hint.effort || "medium",
      impact: hint.impact || "medium",
      technologies: hint.technologies || [],
      codeExample: hint.codeExample || hint.example,
      resources: hint.resources || [],
    }));

    return {
      hints: formattedHints,
      techStack: data.techStack || {
        recommended: [],
        considerations: [],
      },
      architecture: data.architecture || {
        pattern: undefined,
        components: [],
        dataFlow: undefined,
      },
      implementation: data.implementation || {
        phases: [],
        risks: [],
      },
    };
  }

  /**
   * Generate implementation roadmap
   */
  generateImplementationRoadmap(hints: HintsResult): string {
    const sections = ["# Implementation Roadmap\n"];

    // Technology Stack
    if (hints.techStack.recommended.length > 0) {
      sections.push("## Recommended Technology Stack\n");

      const categories = hints.techStack.recommended.reduce((acc, tech) => {
        if (!acc[tech.category]) acc[tech.category] = [];
        acc[tech.category].push(tech);
        return acc;
      }, {} as Record<string, any[]>);

      Object.entries(categories).forEach(([category, techs]) => {
        sections.push(
          `### ${category.charAt(0).toUpperCase() + category.slice(1)}`
        );
        techs.forEach((tech) => {
          sections.push(`- **${tech.technology}**: ${tech.rationale}`);
          if (tech.alternatives.length > 0) {
            sections.push(`  - Alternatives: ${tech.alternatives.join(", ")}`);
          }
        });
        sections.push("");
      });
    }

    // Architecture
    if (hints.architecture.pattern) {
      sections.push("## Architecture\n");
      sections.push(`**Pattern**: ${hints.architecture.pattern}\n`);

      if (hints.architecture.components.length > 0) {
        sections.push("### Components\n");
        hints.architecture.components.forEach((component) => {
          sections.push(`- **${component.name}**: ${component.responsibility}`);
          if (component.interactions.length > 0) {
            sections.push(
              `  - Interacts with: ${component.interactions.join(", ")}`
            );
          }
        });
        sections.push("");
      }

      if (hints.architecture.dataFlow) {
        sections.push(`### Data Flow\n${hints.architecture.dataFlow}\n`);
      }
    }

    // Implementation Phases
    if (hints.implementation.phases.length > 0) {
      sections.push("## Implementation Phases\n");
      hints.implementation.phases.forEach((phase, index) => {
        sections.push(`### Phase ${index + 1}: ${phase.name}`);
        sections.push(`${phase.description}\n`);

        if (phase.deliverables.length > 0) {
          sections.push("**Deliverables:**");
          phase.deliverables.forEach((deliverable) => {
            sections.push(`- ${deliverable}`);
          });
        }

        if (phase.estimatedWeeks) {
          sections.push(
            `\n**Estimated Duration:** ${phase.estimatedWeeks} weeks\n`
          );
        }
        sections.push("");
      });
    }

    // Risks and Mitigation
    if (hints.implementation.risks.length > 0) {
      sections.push("## Risk Assessment\n");
      hints.implementation.risks.forEach((risk) => {
        const riskEmoji = { low: "🟢", medium: "🟡", high: "🔴" }[risk.impact];
        sections.push(`### ${riskEmoji} ${risk.risk}`);
        sections.push(`**Impact**: ${risk.impact}`);
        sections.push(`**Mitigation**: ${risk.mitigation}\n`);
      });
    }

    return sections.join("\n");
  }

  /**
   * Generate development guidelines document
   */
  generateDevelopmentGuidelines(hints: ImplementationHint[]): string {
    const sections = ["# Development Guidelines\n"];

    const categories = hints.reduce((acc, hint) => {
      if (!acc[hint.category]) acc[hint.category] = [];
      acc[hint.category].push(hint);
      return acc;
    }, {} as Record<string, ImplementationHint[]>);

    Object.entries(categories).forEach(([category, categoryHints]) => {
      sections.push(
        `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n`
      );

      categoryHints.forEach((hint) => {
        const priorityEmoji = {
          low: "🟢",
          medium: "🟡",
          high: "🟠",
          critical: "🔴",
        }[hint.priority];

        sections.push(`### ${priorityEmoji} ${hint.title}`);
        sections.push(`${hint.description}\n`);

        if (hint.technologies.length > 0) {
          sections.push(`**Technologies**: ${hint.technologies.join(", ")}\n`);
        }

        if (hint.codeExample) {
          sections.push("**Example:**");
          sections.push("```");
          sections.push(hint.codeExample);
          sections.push("```\n");
        }

        if (hint.resources.length > 0) {
          sections.push("**Resources:**");
          hint.resources.forEach((resource) => {
            sections.push(
              `- [${resource.title}](${resource.url}) (${resource.type})`
            );
          });
          sections.push("");
        }
      });
    });

    return sections.join("\n");
  }

  /**
   * Generate technology comparison matrix
   */
  generateTechnologyComparison(techStack: HintsResult["techStack"]): string {
    const sections = ["# Technology Comparison\n"];

    if (techStack.recommended.length > 0) {
      sections.push("| Category | Recommended | Rationale | Alternatives |");
      sections.push("|----------|-------------|-----------|--------------|");

      techStack.recommended.forEach((tech) => {
        const alternatives =
          tech.alternatives.length > 0
            ? tech.alternatives.join(", ")
            : "None specified";
        sections.push(
          `| ${tech.category} | ${tech.technology} | ${tech.rationale} | ${alternatives} |`
        );
      });
      sections.push("");
    }

    if (techStack.considerations.length > 0) {
      sections.push("## Additional Considerations\n");
      techStack.considerations.forEach((consideration) => {
        sections.push(`- ${consideration}`);
      });
    }

    return sections.join("\n");
  }

  /**
   * Generate code templates and boilerplate
   */
  generateCodeTemplates(
    hints: ImplementationHint[],
    projectType: string
  ): Record<string, string> {
    const templates: Record<string, string> = {};

    // Generate basic project structure template
    templates["project-structure"] =
      this.generateProjectStructureTemplate(projectType);

    // Generate configuration templates based on hints
    const techHints = hints.filter((h) => h.category === "technology");
    if (techHints.some((h) => h.technologies.includes("Express"))) {
      templates["express-server"] = this.generateExpressTemplate();
    }

    if (techHints.some((h) => h.technologies.includes("React"))) {
      templates["react-component"] = this.generateReactTemplate();
    }

    // Generate security templates
    const securityHints = hints.filter((h) => h.category === "security");
    if (securityHints.length > 0) {
      templates["security-middleware"] = this.generateSecurityTemplate();
    }

    return templates;
  }

  private generateProjectStructureTemplate(projectType: string): string {
    const baseStructure = `
project/
├── src/
│   ├── components/
│   ├── services/
│   ├── utils/
│   └── types/
├── tests/
├── docs/
├── package.json
├── README.md
└── .gitignore`;

    return baseStructure;
  }

  private generateExpressTemplate(): string {
    return `
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`;
  }

  private generateReactTemplate(): string {
    return `
import React, { useState, useEffect } from 'react';

interface ComponentProps {
  // Define your props here
}

export const Component: React.FC<ComponentProps> = (props) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Component initialization logic
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {/* Component content */}
    </div>
  );
};`;
  }

  private generateSecurityTemplate(): string {
    return `
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

// Rate limiting
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});

// JWT authentication middleware
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};`;
  }

  /**
   * Validate implementation hints for consistency
   */
  validateHints(hints: ImplementationHint[]): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Check for conflicting technology recommendations
    const techHints = hints.filter((h) => h.category === "technology");
    const technologies = techHints.flatMap((h) => h.technologies);

    // Check for conflicting database recommendations
    const databases = technologies.filter((tech) =>
      ["MySQL", "PostgreSQL", "MongoDB", "SQLite"].includes(tech)
    );
    if (databases.length > 1) {
      issues.push(
        `Multiple database technologies recommended: ${databases.join(", ")}`
      );
    }

    // Check for missing critical categories
    const categories = hints.map((h) => h.category);
    const criticalCategories = ["security", "testing"];

    criticalCategories.forEach((category) => {
      if (!categories.includes(category as any)) {
        suggestions.push(`Consider adding ${category} implementation hints`);
      }
    });

    // Check for high-effort, low-impact hints
    const inefficientHints = hints.filter(
      (h) => h.effort === "high" && h.impact === "low"
    );
    if (inefficientHints.length > 0) {
      suggestions.push(
        `Review high-effort, low-impact recommendations: ${inefficientHints
          .map((h) => h.title)
          .join(", ")}`
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }
}

// Factory function for easy instantiation
export function createHintsAgent(model?: string): HintsAgent {
  return new HintsAgent(model);
}
