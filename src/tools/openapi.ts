import { tool } from "ai";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// OpenAPI validation result schema
const OpenAPIValidationResultSchema = z.object({
  valid: z.boolean(),
  version: z.string().optional(), // OpenAPI version (3.0.0, 3.1.0, etc.)
  errors: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
        severity: z.enum(["error", "warning"]),
      })
    )
    .default([]),
  warnings: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      })
    )
    .default([]),
  info: z
    .object({
      title: z.string().optional(),
      version: z.string().optional(),
      pathCount: z.number().default(0),
      operationCount: z.number().default(0),
      schemaCount: z.number().default(0),
    })
    .optional(),
});

// Validate OpenAPI specification tool
export const validateOpenAPITool = tool({
  description:
    "Validate an OpenAPI specification file for correctness and completeness",
  parameters: z.object({
    specPath: z.string().min(1, "OpenAPI spec file path is required"),
    cwd: z.string().default("."),
    strict: z.boolean().default(false), // Strict validation mode
  }),
  execute: async ({ specPath, cwd, strict }) => {
    try {
      const filePath = join(cwd, specPath);
      const content = await readFile(filePath, "utf-8");

      let spec: any;
      try {
        // Try to parse as JSON first
        spec = JSON.parse(content);
      } catch {
        // If JSON parsing fails, try YAML
        try {
          const yaml = await import("yaml");
          spec = yaml.parse(content);
        } catch (yamlError) {
          return {
            success: false,
            valid: false,
            error: "Failed to parse OpenAPI spec as JSON or YAML",
            errors: [
              {
                path: "/",
                message: "Invalid JSON/YAML format",
                severity: "error" as const,
              },
            ],
          };
        }
      }

      const errors = [];
      const warnings = [];

      // Basic OpenAPI structure validation
      if (!spec.openapi && !spec.swagger) {
        errors.push({
          path: "/",
          message: "Missing required 'openapi' or 'swagger' field",
          severity: "error" as const,
        });
      }

      if (!spec.info) {
        errors.push({
          path: "/info",
          message: "Missing required 'info' object",
          severity: "error" as const,
        });
      } else {
        if (!spec.info.title) {
          errors.push({
            path: "/info/title",
            message: "Missing required 'title' field in info object",
            severity: "error" as const,
          });
        }
        if (!spec.info.version) {
          errors.push({
            path: "/info/version",
            message: "Missing required 'version' field in info object",
            severity: "error" as const,
          });
        }
      }

      if (!spec.paths || Object.keys(spec.paths).length === 0) {
        warnings.push({
          path: "/paths",
          message: "No paths defined in the specification",
        });
      }

      // Count various elements
      const pathCount = spec.paths ? Object.keys(spec.paths).length : 0;
      let operationCount = 0;
      const schemaCount = spec.components?.schemas
        ? Object.keys(spec.components.schemas).length
        : 0;

      if (spec.paths) {
        for (const path of Object.values(spec.paths)) {
          if (typeof path === "object" && path !== null) {
            const httpMethods = [
              "get",
              "post",
              "put",
              "delete",
              "patch",
              "head",
              "options",
              "trace",
            ];
            operationCount += httpMethods.filter(
              (method) => method in path
            ).length;
          }
        }
      }

      // Additional validation in strict mode
      if (strict) {
        // Check for missing descriptions
        if (spec.paths) {
          Object.entries(spec.paths).forEach(
            ([pathName, pathItem]: [string, any]) => {
              if (typeof pathItem === "object" && pathItem !== null) {
                Object.entries(pathItem).forEach(
                  ([method, operation]: [string, any]) => {
                    if (
                      typeof operation === "object" &&
                      operation !== null &&
                      !operation.description
                    ) {
                      warnings.push({
                        path: `/paths${pathName}/${method}/description`,
                        message: `Missing description for ${method.toUpperCase()} ${pathName}`,
                      });
                    }
                  }
                );
              }
            }
          );
        }

        // Check for missing response schemas
        if (spec.paths) {
          Object.entries(spec.paths).forEach(
            ([pathName, pathItem]: [string, any]) => {
              if (typeof pathItem === "object" && pathItem !== null) {
                Object.entries(pathItem).forEach(
                  ([method, operation]: [string, any]) => {
                    if (typeof operation === "object" && operation?.responses) {
                      Object.entries(operation.responses).forEach(
                        ([statusCode, response]: [string, any]) => {
                          if (statusCode.startsWith("2") && !response.content) {
                            warnings.push({
                              path: `/paths${pathName}/${method}/responses/${statusCode}`,
                              message: `Success response ${statusCode} missing content schema`,
                            });
                          }
                        }
                      );
                    }
                  }
                );
              }
            }
          );
        }
      }

      const isValid = errors.length === 0;

      return {
        success: true,
        valid: isValid,
        version: spec.openapi || spec.swagger,
        errors,
        warnings,
        info: {
          title: spec.info?.title,
          version: spec.info?.version,
          pathCount,
          operationCount,
          schemaCount,
        },
        summary: isValid
          ? `Valid OpenAPI spec with ${pathCount} paths and ${operationCount} operations`
          : `Invalid OpenAPI spec with ${errors.length} errors`,
      };
    } catch (error) {
      return {
        success: false,
        valid: false,
        error:
          error instanceof Error ? error.message : "OpenAPI validation failed",
        errors: [
          {
            path: "/",
            message:
              error instanceof Error
                ? error.message
                : "Unknown validation error",
            severity: "error" as const,
          },
        ],
      };
    }
  },
});

// Generate OpenAPI spec from API definitions
export const generateOpenAPITool = tool({
  description: "Generate OpenAPI specification from API endpoint definitions",
  parameters: z.object({
    apis: z.array(
      z.object({
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
        route: z.string(),
        summary: z.string().optional(),
        inputs: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              required: z.boolean().optional().default(true),
              description: z.string().optional(),
            })
          )
          .default([]),
        outputs: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              description: z.string().optional(),
            })
          )
          .default([]),
        authenticated: z.boolean().optional().default(false),
      })
    ),
    info: z
      .object({
        title: z.string().default("Generated API"),
        version: z.string().default("1.0.0"),
        description: z.string().optional(),
      })
      .optional(),
    outputPath: z.string().default("openapi.yaml"),
    cwd: z.string().default("."),
  }),
  execute: async ({ apis, info, outputPath, cwd }) => {
    try {
      const openApiSpec = {
        openapi: "3.0.3",
        info: {
          title: info?.title || "Generated API",
          version: info?.version || "1.0.0",
          description:
            info?.description || "API specification generated by IdeaForge",
        },
        paths: {} as Record<string, any>,
        components: {
          schemas: {} as Record<string, any>,
        },
      };

      // Generate paths from API definitions
      for (const api of apis) {
        if (!openApiSpec.paths[api.route]) {
          openApiSpec.paths[api.route] = {};
        }

        const operation = {
          summary: api.summary || `${api.method} ${api.route}`,
          operationId: `${api.method.toLowerCase()}${api.route.replace(
            /[^a-zA-Z0-9]/g,
            ""
          )}`,
          parameters: [] as any[],
          responses: {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {} as Record<string, any>,
                  },
                },
              },
            },
          },
        } as any;

        // Add input parameters
        for (const input of api.inputs) {
          const parameter = {
            name: input.name,
            in: api.method === "GET" ? "query" : "body",
            required: input.required,
            description: input.description,
            schema: {
              type: mapTypeToOpenAPI(input.type),
            },
          };

          if (api.method === "GET" || api.method === "DELETE") {
            operation.parameters.push(parameter);
          } else {
            // For POST/PUT, add to request body
            if (!operation.requestBody) {
              operation.requestBody = {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {},
                      required: [],
                    },
                  },
                },
              };
            }

            operation.requestBody.content["application/json"].schema.properties[
              input.name
            ] = {
              type: mapTypeToOpenAPI(input.type),
              description: input.description,
            };

            if (input.required) {
              operation.requestBody.content[
                "application/json"
              ].schema.required.push(input.name);
            }
          }
        }

        // Add output properties to response schema
        for (const output of api.outputs) {
          operation.responses["200"].content[
            "application/json"
          ].schema.properties[output.name] = {
            type: mapTypeToOpenAPI(output.type),
            description: output.description,
          };
        }

        openApiSpec.paths[api.route][api.method.toLowerCase()] = operation;
      }

      // Write the spec to file
      const yaml = await import("yaml");
      const specContent = yaml.stringify(openApiSpec, { indent: 2 });

      const fs = await import("node:fs/promises");
      const fullPath = join(cwd, outputPath);
      await fs.writeFile(fullPath, specContent, "utf-8");

      return {
        success: true,
        generated: true,
        outputPath: fullPath,
        pathCount: Object.keys(openApiSpec.paths).length,
        operationCount: apis.length,
        summary: `Generated OpenAPI spec with ${apis.length} operations`,
        spec: openApiSpec,
      };
    } catch (error) {
      return {
        success: false,
        generated: false,
        error:
          error instanceof Error ? error.message : "OpenAPI generation failed",
      };
    }
  },
});

// Helper function to map TypeScript types to OpenAPI types
function mapTypeToOpenAPI(type: string): string {
  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    Date: "string",
    object: "object",
    array: "array",
    any: "object",
  };

  return typeMap[type] || "string";
}

// Export all OpenAPI tools
export const openApiTools = {
  validateOpenAPI: validateOpenAPITool,
  generateOpenAPI: generateOpenAPITool,
};

// Type exports
export type OpenAPIValidationResult = z.infer<
  typeof OpenAPIValidationResultSchema
>;
