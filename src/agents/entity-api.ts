import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { parseJsonResponse } from "../utils/json-parser.js";
import {
  EntitySchema,
  ApiSchema,
  type Entity,
  type Api,
} from "../schemas/spec.js";

// Entity/API extraction result schema - simplified to avoid Zod issues
const EntityApiResultSchema = z.object({
  entities: z.any().optional(),
  apis: z.any().default([]),
  apiEndpoints: z.any().default([]),
  dataFlow: z.any().default([]),
  integrations: z.any().default([]),
  externalIntegrations: z.any().default([]),
});

export type EntityApiResult = z.infer<typeof EntityApiResultSchema>;

/**
 * Entity/API Agent - Extracts data models and API endpoints from PRD
 *
 * This agent is responsible for:
 * - Identifying core entities and their attributes
 * - Mapping entity relationships (one-to-one, one-to-many, many-to-many)
 * - Extracting API endpoints with methods, routes, inputs, and outputs
 * - Understanding data flow between entities
 * - Identifying external integrations needed
 */
export class EntityApiAgent {
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    this.model = model;
  }

  async extractEntitiesAndApis(
    prdContent: string,
    projectContext?: any
  ): Promise<EntityApiResult> {
    const systemPrompt = `You are the Entity/API Agent in the IdeaForge system. Your job is to extract data models (entities) and API endpoints from a Product Requirements Document.

Your responsibilities:
1. ENTITIES: Identify core business entities with their attributes and relationships
2. APIs: Extract RESTful endpoints with proper HTTP methods, routes, inputs, and outputs
3. DATA FLOW: Map how data moves between entities through operations
4. INTEGRATIONS: Identify external systems, databases, or services needed

Guidelines for entities:
- Focus on business domain objects (User, Product, Order, etc.)
- Include all relevant attributes for each entity
- Map relationships clearly (one-to-one, one-to-many, many-to-many)
- Avoid technical implementation details

Guidelines for APIs:
- Use RESTful conventions (GET /users, POST /users, PUT /users/:id, etc.)
- Routes must start with forward slash
- Specify clear input/output parameters with types
- Include authentication requirements where applicable

Return structured JSON that matches the expected schema.`;

    const userPrompt = `Analyze this PRD and extract all entities and API endpoints:

${prdContent}

${
  projectContext
    ? `\nProject Context: ${JSON.stringify(projectContext, null, 2)}`
    : ""
}

Focus on:
1. What are the core business entities and their attributes?
2. How do these entities relate to each other?
3. What API endpoints are needed for CRUD operations?
4. What external integrations are required?
5. How does data flow through the system?

Provide a comprehensive analysis in JSON format.`;

    try {
      const result = await generateText({
        model: openai(this.model),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.2, // Slightly higher for creative entity modeling
        maxTokens: 3000,
      });

      // Parse and validate the result
      let entityApiData: any;
      try {
        entityApiData = parseJsonResponse(result.text);
        console.log("✅ Entity/API data parsed successfully");
      } catch (parseError) {
        console.error(
          "❌ JSON parsing failed. Raw response:",
          result.text.substring(0, 500) + "..."
        );
        throw new Error(
          `Failed to parse entity/API result as JSON: ${parseError}`
        );
      }

      // Validate against schema
      try {
        console.log("🔍 Starting Entity/API validation...");
        const validatedResult = EntityApiResultSchema.parse(entityApiData);
        console.log("✅ Entity/API validation passed");

        // Transform the data to our expected format
        const transformedResult = this.transformEntityApiData(validatedResult);
        console.log("📊 Entities found:", transformedResult.entities.length);
        console.log("🔌 APIs found:", transformedResult.apis.length);

        return transformedResult;
      } catch (validationError) {
        console.error("❌ Entity/API validation error:", validationError);
        if (validationError instanceof z.ZodError) {
          console.error(
            "❌ Entity/API validation failed:",
            validationError.errors
          );
          console.error(
            "Raw data structure:",
            JSON.stringify(entityApiData, null, 2)
          );
          throw new Error(
            `Entity/API validation failed: ${validationError.errors
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
   * Transform raw LLM data to our expected format
   */
  private transformEntityApiData(data: any): EntityApiResult {
    // Transform entities (handle both array and object formats)
    const entitiesData = data.entities;
    const entities = Array.isArray(entitiesData)
      ? entitiesData
      : entitiesData
      ? Object.entries(entitiesData).map(([name, entity]: [string, any]) => ({
          name,
          ...entity,
        }))
      : [];

    // Transform APIs (handle both array and object formats)
    const apisData = Array.isArray(data.apiEndpoints)
      ? data.apiEndpoints
      : data.apiEndpoints;
    const apis = Array.isArray(apisData)
      ? apisData
      : apisData && typeof apisData === "object"
      ? Object.entries(apisData).flatMap(
          ([entityName, entityApis]: [string, any]) =>
            Object.entries(entityApis).map(
              ([operation, apiDef]: [string, any]) => ({
                ...apiDef,
                summary: apiDef.description || `${operation} ${entityName}`,
              })
            )
        )
      : [];

    // Transform integrations
    const integrationsData = data.integrations;
    const integrations = Array.isArray(integrationsData)
      ? integrationsData
      : integrationsData && typeof integrationsData === "object"
      ? Object.entries(integrationsData).map(
          ([name, value]: [string, any]) => ({
            name,
            description: Array.isArray(value)
              ? value.join(", ")
              : String(value),
          })
        )
      : [];

    return {
      entities: entities.map((entity: any) => ({
        name: entity.name,
        attributes: Array.isArray(entity.attributes)
          ? entity.attributes
          : entity.attributes
          ? Object.keys(entity.attributes)
          : [],
        relations: entity.relationships
          ? Object.entries(entity.relationships).map(([key, value]) => ({
              to: key,
              type: value as string,
            }))
          : [],
      })),
      apis: apis.map((api: any) => ({
        method: api.method,
        route: api.route,
        summary: api.description || api.summary || "API endpoint",
        authenticated: false, // Default
        inputs: api.input
          ? Object.entries(api.input).map(([name, type]) => ({
              name,
              type: String(type),
              required: true,
            }))
          : [],
        outputs: api.output
          ? Object.entries(api.output).map(([name, type]) => ({
              name,
              type: String(type),
            }))
          : [],
      })),
      dataFlow: Array.isArray(data.dataFlow) ? data.dataFlow : [],
      integrations: integrations.map((integration: any) => ({
        name: integration.name,
        type: "external_api" as const,
        description: integration.description || "",
        required: true,
      })),
    };
  }

  /**
   * Generate entity relationship diagram in Mermaid format
   */
  generateEntityDiagram(entities: Entity[]): string {
    const lines = ["erDiagram"];

    // Add entities with attributes
    entities.forEach((entity) => {
      lines.push(`  ${entity.name.toUpperCase()} {`);
      entity.attributes.forEach((attr) => {
        lines.push(`    string ${attr}`);
      });
      lines.push("  }");
    });

    // Add relationships
    entities.forEach((entity) => {
      if (entity.relations) {
        entity.relations.forEach((relation) => {
          const relationSymbol = {
            "one-to-one": "||--||",
            "one-to-many": "||--o{",
            "many-to-many": "}o--o{",
          }[relation.type];

          lines.push(
            `  ${entity.name.toUpperCase()} ${relationSymbol} ${relation.to.toUpperCase()} : ${
              relation.type
            }`
          );
        });
      }
    });

    return lines.join("\n");
  }

  /**
   * Generate API documentation in markdown format
   */
  generateApiDocumentation(apis: Api[]): string {
    const sections = ["# API Documentation\n"];

    // Group APIs by resource
    const groupedApis = apis.reduce((groups, api) => {
      const resource = api.route.split("/")[1] || "root";
      if (!groups[resource]) groups[resource] = [];
      groups[resource].push(api);
      return groups;
    }, {} as Record<string, Api[]>);

    Object.entries(groupedApis).forEach(([resource, resourceApis]) => {
      sections.push(
        `## ${resource.charAt(0).toUpperCase() + resource.slice(1)}`
      );

      resourceApis.forEach((api) => {
        sections.push(`\n### ${api.method} ${api.route}`);

        if (api.summary) {
          sections.push(`${api.summary}`);
        }

        if (api.authenticated) {
          sections.push("🔒 **Authentication required**");
        }

        if (api.inputs.length > 0) {
          sections.push("\n**Request Parameters:**");
          api.inputs.forEach((input) => {
            const required =
              input.required !== false ? " (required)" : " (optional)";
            sections.push(
              `- \`${input.name}\` (${input.type})${required}${
                input.description ? `: ${input.description}` : ""
              }`
            );
          });
        }

        if (api.outputs.length > 0) {
          sections.push("\n**Response:**");
          api.outputs.forEach((output) => {
            sections.push(
              `- \`${output.name}\` (${output.type})${
                output.description ? `: ${output.description}` : ""
              }`
            );
          });
        }

        sections.push("");
      });
    });

    return sections.join("\n");
  }

  /**
   * Validate entity relationships for consistency
   */
  validateEntityRelationships(entities: Entity[]): {
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    const entityNames = entities.map((e) => e.name);

    entities.forEach((entity) => {
      if (entity.relations) {
        entity.relations.forEach((relation) => {
          // Check if target entity exists
          if (!entityNames.includes(relation.to)) {
            issues.push(
              `Entity "${entity.name}" has relation to non-existent entity "${relation.to}"`
            );
          }

          // Check for bidirectional relationships
          const targetEntity = entities.find((e) => e.name === relation.to);
          if (targetEntity?.relations) {
            const backRelation = targetEntity.relations.find(
              (r) => r.to === entity.name
            );
            if (!backRelation && relation.type !== "one-to-many") {
              suggestions.push(
                `Consider adding bidirectional relationship between "${entity.name}" and "${relation.to}"`
              );
            }
          }
        });
      }

      // Check for missing common attributes
      const commonAttributes = ["id", "createdAt", "updatedAt"];
      const missingCommon = commonAttributes.filter(
        (attr) =>
          !entity.attributes.some((a) =>
            a.toLowerCase().includes(attr.toLowerCase())
          )
      );

      if (missingCommon.length > 0) {
        suggestions.push(
          `Entity "${
            entity.name
          }" might benefit from common attributes: ${missingCommon.join(", ")}`
        );
      }
    });

    return {
      isValid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * Generate database schema suggestions based on entities
   */
  generateDatabaseSchema(entities: Entity[]): string {
    const tables: string[] = [];

    entities.forEach((entity) => {
      const tableName = entity.name.toLowerCase() + "s";
      const columns = ["  id SERIAL PRIMARY KEY"];

      entity.attributes.forEach((attr) => {
        if (attr.toLowerCase() !== "id") {
          // Simple type mapping - could be enhanced
          const sqlType = this.mapAttributeToSqlType(attr);
          columns.push(`  ${attr.toLowerCase()} ${sqlType}`);
        }
      });

      // Add common timestamp columns
      columns.push("  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
      columns.push("  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

      tables.push(`CREATE TABLE ${tableName} (\n${columns.join(",\n")}\n);`);
    });

    return tables.join("\n\n");
  }

  private mapAttributeToSqlType(attribute: string): string {
    const attr = attribute.toLowerCase();

    if (attr.includes("email")) return "VARCHAR(255) UNIQUE";
    if (attr.includes("password")) return "VARCHAR(255)";
    if (attr.includes("phone")) return "VARCHAR(20)";
    if (attr.includes("url") || attr.includes("link")) return "TEXT";
    if (attr.includes("description") || attr.includes("content")) return "TEXT";
    if (attr.includes("price") || attr.includes("amount"))
      return "DECIMAL(10,2)";
    if (attr.includes("count") || attr.includes("quantity")) return "INTEGER";
    if (attr.includes("date") || attr.includes("time")) return "TIMESTAMP";
    if (attr.includes("active") || attr.includes("enabled"))
      return "BOOLEAN DEFAULT TRUE";

    return "VARCHAR(255)"; // Default
  }

  /**
   * Suggest additional APIs based on entities
   */
  suggestAdditionalApis(entities: Entity[], existingApis: Api[]): Api[] {
    const suggestions: Api[] = [];
    const existingRoutes = existingApis.map(
      (api) => `${api.method} ${api.route}`
    );

    entities.forEach((entity) => {
      const resource = entity.name.toLowerCase();
      const resourcePlural = resource + "s";

      // Standard CRUD operations
      const crudApis = [
        {
          method: "GET" as const,
          route: `/${resourcePlural}`,
          summary: `List all ${resourcePlural}`,
          inputs: [
            {
              name: "page",
              type: "number",
              required: false,
              description: "Page number for pagination",
            },
            {
              name: "limit",
              type: "number",
              required: false,
              description: "Number of items per page",
            },
          ],
          outputs: [
            {
              name: resourcePlural,
              type: "array",
              description: `Array of ${resource} objects`,
            },
            {
              name: "total",
              type: "number",
              description: "Total number of items",
            },
          ],
        },
        {
          method: "GET" as const,
          route: `/${resourcePlural}/:id`,
          summary: `Get a specific ${resource}`,
          inputs: [
            {
              name: "id",
              type: "string",
              required: true,
              description: `${resource} ID`,
            },
          ],
          outputs: entity.attributes.map((attr) => ({
            name: attr,
            type: "string",
          })),
        },
        {
          method: "POST" as const,
          route: `/${resourcePlural}`,
          summary: `Create a new ${resource}`,
          inputs: entity.attributes
            .filter((attr) => attr.toLowerCase() !== "id")
            .map((attr) => ({ name: attr, type: "string", required: true })),
          outputs: entity.attributes.map((attr) => ({
            name: attr,
            type: "string",
          })),
        },
        {
          method: "PUT" as const,
          route: `/${resourcePlural}/:id`,
          summary: `Update a ${resource}`,
          inputs: [
            {
              name: "id",
              type: "string",
              required: true,
              description: `${resource} ID`,
            },
            ...entity.attributes
              .filter((attr) => attr.toLowerCase() !== "id")
              .map((attr) => ({ name: attr, type: "string", required: false })),
          ],
          outputs: entity.attributes.map((attr) => ({
            name: attr,
            type: "string",
          })),
        },
        {
          method: "DELETE" as const,
          route: `/${resourcePlural}/:id`,
          summary: `Delete a ${resource}`,
          inputs: [
            {
              name: "id",
              type: "string",
              required: true,
              description: `${resource} ID`,
            },
          ],
          outputs: [
            {
              name: "success",
              type: "boolean",
              description: "Deletion success status",
            },
          ],
        },
      ];

      // Add only missing APIs
      crudApis.forEach((api) => {
        const routeKey = `${api.method} ${api.route}`;
        if (!existingRoutes.includes(routeKey)) {
          suggestions.push(api);
        }
      });
    });

    return suggestions;
  }
}

// Factory function for easy instantiation
export function createEntityApiAgent(model?: string): EntityApiAgent {
  return new EntityApiAgent(model);
}
