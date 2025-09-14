import { z } from "zod";

// Persona schema
export const PersonaSchema = z.object({
  name: z.string().min(1, "Persona name is required"),
  goals: z
    .array(z.string().min(1, "Goal cannot be empty"))
    .min(1, "At least one goal is required"),
});

// Entity relation schema
export const EntityRelationSchema = z.object({
  to: z.string().min(1, "Relation target is required"),
  type: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
});

// Entity schema
export const EntitySchema = z.object({
  name: z.string().min(1, "Entity name is required"),
  attributes: z
    .array(z.string().min(1, "Attribute cannot be empty"))
    .min(1, "At least one attribute is required"),
  relations: z.array(EntityRelationSchema).optional().default([]),
});

// API input/output parameter schema
export const ApiParameterSchema = z.object({
  name: z.string().min(1, "Parameter name is required"),
  type: z.string().min(1, "Parameter type is required"),
  required: z.boolean().optional().default(true),
  description: z.string().optional(),
});

// API endpoint schema
export const ApiSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  route: z
    .string()
    .min(1, "API route is required")
    .regex(/^\//, "Route must start with /"),
  summary: z.string().optional(),
  inputs: z.array(ApiParameterSchema).default([]),
  outputs: z.array(ApiParameterSchema).default([]),
  authenticated: z.boolean().optional().default(false),
});

// Constraint schema
export const ConstraintSchema = z.object({
  rule: z.string().min(1, "Constraint rule is required"),
  type: z.enum(["perf", "security", "compliance", "ux", "business"]),
  value: z.string().optional(),
  priority: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .default("medium"),
});

// Acceptance criteria / scenario schema
export const ScenarioSchema = z.object({
  id: z
    .string()
    .min(1, "Scenario ID is required")
    .regex(/^AC-\d{3}$/, "ID must be in format AC-XXX"),
  given: z.string().min(1, "Given condition is required"),
  when: z.string().min(1, "When action is required"),
  then: z.string().min(1, "Then outcome is required"),
  priority: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .default("medium"),
});

// Task schema
export const TaskSchema = z.object({
  id: z
    .string()
    .min(1, "Task ID is required")
    .regex(/^T-\d{3}$/, "ID must be in format T-XXX"),
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  dependsOn: z.array(z.string().regex(/^T-\d{3}$/)).default([]),
  deliverables: z
    .array(z.string().min(1, "Deliverable cannot be empty"))
    .default([]),
  acceptanceCriteria: z.array(z.string().regex(/^AC-\d{3}$/)).default([]),
  estimatedComplexity: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .default("medium"),
  ownerAgent: z.string().optional().default("code-ts"),
  runtime: z
    .object({
      language: z.string().optional(),
      framework: z.string().optional(),
      database: z.string().optional(),
    })
    .optional(),
});

// Main spec schema - the single source of truth
export const SpecSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  version: z.string().optional().default("1.0.0"),
  description: z.string().optional(),
  personas: z.array(PersonaSchema).min(1, "At least one persona is required"),
  entities: z.array(EntitySchema).min(1, "At least one entity is required"),
  apis: z.array(ApiSchema).default([]),
  constraints: z.array(ConstraintSchema).default([]),
  scenarios: z
    .array(ScenarioSchema)
    .min(1, "At least one acceptance criteria is required"),
  tasks: z.array(TaskSchema).min(1, "At least one task is required"),
  metadata: z
    .object({
      compiledAt: z.date().optional(),
      compiledBy: z.string().optional().default("ideaforge"),
      sourceFile: z.string().optional(),
      totalEstimatedHours: z.number().optional(),
    })
    .optional(),
});

// Type exports for use throughout the application
export type Persona = z.infer<typeof PersonaSchema>;
export type EntityRelation = z.infer<typeof EntityRelationSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type ApiParameter = z.infer<typeof ApiParameterSchema>;
export type Api = z.infer<typeof ApiSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Spec = z.infer<typeof SpecSchema>;

// Validation helpers
export function validateSpec(data: unknown): Spec {
  return SpecSchema.parse(data);
}

export function isValidTaskId(id: string): boolean {
  return /^T-\d{3}$/.test(id);
}

export function isValidScenarioId(id: string): boolean {
  return /^AC-\d{3}$/.test(id);
}

// Generate next available ID helpers
export function generateNextTaskId(existingTasks: Task[]): string {
  const maxId = existingTasks
    .map((t) => parseInt(t.id.replace("T-", ""), 10))
    .reduce((max, current) => Math.max(max, current), 0);
  return `T-${String(maxId + 1).padStart(3, "0")}`;
}

export function generateNextScenarioId(existingScenarios: Scenario[]): string {
  const maxId = existingScenarios
    .map((s) => parseInt(s.id.replace("AC-", ""), 10))
    .reduce((max, current) => Math.max(max, current), 0);
  return `AC-${String(maxId + 1).padStart(3, "0")}`;
}
