import { z } from "zod";

// Runtime configuration for task execution
export const TaskRuntimeSchema = z.object({
  language: z.string().optional(),
  framework: z.string().optional(),
  database: z.string().optional(),
  environment: z.string().optional().default("node"),
});

// Task frontmatter schema (YAML at top of .task.md files)
export const TaskFrontmatterSchema = z.object({
  id: z.string().regex(/^T-\d{3}$/, "Task ID must be in format T-XXX"),
  title: z.string().min(1, "Task title is required"),
  dependsOn: z.array(z.string().regex(/^T-\d{3}$/)).default([]),
  ownerAgent: z.string().optional().default("code-ts"),
  artifacts: z.object({
    expected: z
      .array(z.string().min(1, "Artifact path cannot be empty"))
      .default([]),
  }),
  acceptanceCriteria: z.array(z.string().regex(/^AC-\d{3}$/)).default([]),
  runtime: TaskRuntimeSchema.optional(),
  constraints: z.array(z.string()).default([]),
  priority: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .default("medium"),
  estimatedHours: z.number().positive().optional(),
});

// Full task file content (frontmatter + markdown body)
export const TaskFileSchema = z.object({
  frontmatter: TaskFrontmatterSchema,
  description: z.string().min(1, "Task description is required"),
  interface: z.string().optional(), // API interface definition
  notes: z.string().optional(),
  examples: z.string().optional(),
});

// Task execution context passed to agents
export const TaskExecutionContextSchema = z.object({
  task: TaskFrontmatterSchema,
  projectSpec: z.any(), // Will be validated against SpecSchema
  workspacePath: z.string(),
  previousAttempts: z.number().default(0),
  reviewFeedback: z.array(z.any()).default([]), // ReviewReport[]
});

// Task status for database tracking
export const TaskStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "NEEDS_CHANGES",
  "APPROVED",
  "MERGED",
  "DONE",
  "ERROR",
]);

// Type exports
export type TaskRuntime = z.infer<typeof TaskRuntimeSchema>;
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
export type TaskFile = z.infer<typeof TaskFileSchema>;
export type TaskExecutionContext = z.infer<typeof TaskExecutionContextSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// Validation helpers
export function validateTaskFrontmatter(data: unknown): TaskFrontmatter {
  return TaskFrontmatterSchema.parse(data);
}

export function validateTaskFile(data: unknown): TaskFile {
  return TaskFileSchema.parse(data);
}

// Task file parsing helper
export function parseTaskFile(content: string): TaskFile {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error("Invalid task file format - missing frontmatter");
  }

  const [, frontmatterYaml, body] = match;

  // Parse YAML frontmatter (we'll need to import yaml parser)
  let frontmatter: any;
  try {
    const yaml = await import("yaml");
    frontmatter = yaml.parse(frontmatterYaml);
  } catch (error) {
    throw new Error(`Failed to parse task frontmatter: ${error}`);
  }

  // Extract sections from markdown body
  const sections = parseMarkdownSections(body);

  return validateTaskFile({
    frontmatter,
    description: sections.description || body.trim(),
    interface: sections.interface,
    notes: sections.notes,
    examples: sections.examples,
  });
}

// Helper to parse markdown sections
function parseMarkdownSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = markdown.split("\n");
  let currentSection = "description";
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // Save previous section
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join("\n").trim();
      }

      // Start new section
      currentSection = line
        .replace("## ", "")
        .toLowerCase()
        .replace(/\s+/g, "");
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save final section
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

// Generate task file content
export function generateTaskFileContent(task: TaskFile): string {
  const yaml = require("yaml");
  const frontmatterYaml = yaml.stringify(task.frontmatter);

  let content = `---\n${frontmatterYaml}---\n\n`;
  content += `## Description\n${task.description}\n\n`;

  if (task.interface) {
    content += `## Interface\n${task.interface}\n\n`;
  }

  if (task.notes) {
    content += `## Notes\n${task.notes}\n\n`;
  }

  if (task.examples) {
    content += `## Examples\n${task.examples}\n\n`;
  }

  return content;
}
