import {
  sqliteTable,
  text,
  integer,
  blob,
  real,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status", {
    enum: ["NEW", "COMPILED", "RUNNING", "ASSEMBLED", "DONE", "ERROR"],
  })
    .default("NEW")
    .notNull(),
  workspacePath: text("workspace_path").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const specs = sqliteTable("specs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  version: integer("version").default(1).notNull(),
  json: text("json", { mode: "json" }).notNull(), // spec.ai.json content
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id").notNull(), // e.g., "T-001"
  title: text("title").notNull(),
  status: text("status", {
    enum: [
      "PENDING",
      "RUNNING",
      "NEEDS_CHANGES",
      "APPROVED",
      "MERGED",
      "DONE",
      "ERROR",
    ],
  })
    .default("PENDING")
    .notNull(),
  attempt: integer("attempt").default(0).notNull(),
  score: integer("score"), // optional voting score
  filePath: text("file_path"), // path to /tasks/T-001.task.md
  dependsOn: text("depends_on", { mode: "json" }).$type<string[]>().default([]), // array of task IDs
  deliverables: text("deliverables", { mode: "json" })
    .$type<string[]>()
    .default([]),
  acceptanceCriteria: text("acceptance_criteria", { mode: "json" })
    .$type<string[]>()
    .default([]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  payload: text("payload", { mode: "json" }).notNull(), // ReviewReport JSON
  pass: integer("pass", { mode: "boolean" }).default(false).notNull(),
  attempt: integer("attempt").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const artifacts = sqliteTable("artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  sha: text("sha"), // file hash for integrity
  kind: text("kind", {
    enum: ["code", "test", "doc", "patch", "config"],
  }).notNull(),
  content: blob("content"), // optional: store small files directly
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const traces = sqliteTable("traces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: integer("task_id").references(() => tasks.id, {
    onDelete: "cascade",
  }), // optional
  event: text("event").notNull(), // e.g., 'agent_call', 'tool_call', 'compile_start'
  agent: text("agent"), // e.g., 'summary', 'worker', 'reviewer'
  tool: text("tool"), // e.g., 'readFile', 'writeFile', 'runTests'
  payload: text("payload", { mode: "json" }), // event-specific data
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  cost: real("cost"), // in USD
  latencyMs: integer("latency_ms"),
  status: text("status", { enum: ["success", "error", "timeout"] }).notNull(),
  errorMessage: text("error_message"),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Type exports for use in application code
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Spec = typeof specs.$inferSelect;
export type NewSpec = typeof specs.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
