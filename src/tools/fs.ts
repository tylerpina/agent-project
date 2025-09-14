import { tool } from "ai";
import { z } from "zod";
import {
  readFile,
  writeFile,
  mkdir,
  access,
  stat,
  readdir,
} from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { constants } from "node:fs";

// Security: Define allowed workspace paths to prevent directory traversal
const WORKSPACE_ROOT = process.cwd();
const ALLOWED_WORKSPACE_PATTERNS = [
  /^workspace\//,
  /^\.\/workspace\//,
  /^spec\//,
  /^tasks\//,
  /^build\//,
  /^reports\//,
];

function validatePath(filePath: string): string {
  const resolvedPath = resolve(filePath);
  const relativePath = relative(WORKSPACE_ROOT, resolvedPath);

  // Prevent directory traversal attacks
  if (relativePath.startsWith("..") || relativePath.includes("..")) {
    throw new Error(`Access denied: Path traversal detected in ${filePath}`);
  }

  // Check if path matches allowed patterns
  const isAllowed = ALLOWED_WORKSPACE_PATTERNS.some(
    (pattern) => pattern.test(relativePath) || pattern.test(filePath)
  );

  if (!isAllowed && !relativePath.startsWith("workspace/")) {
    throw new Error(
      `Access denied: Path ${filePath} is outside allowed workspace areas`
    );
  }

  return resolvedPath;
}

// Read file tool - used by agents to read existing files
export const readFileTool = tool({
  description:
    "Read the contents of a text file. Only works within workspace directories for security.",
  parameters: z.object({
    path: z.string().min(1, "File path is required"),
  }),
  execute: async ({ path }) => {
    try {
      const safePath = validatePath(path);

      // Check if file exists and is readable
      await access(safePath, constants.R_OK);

      // Get file stats
      const stats = await stat(safePath);
      if (stats.isDirectory()) {
        throw new Error(`Path ${path} is a directory, not a file`);
      }

      // Prevent reading extremely large files (>10MB)
      if (stats.size > 10 * 1024 * 1024) {
        throw new Error(
          `File ${path} is too large (${stats.size} bytes). Maximum size is 10MB.`
        );
      }

      const content = await readFile(safePath, "utf-8");

      return {
        success: true,
        path: path,
        content,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        path: path,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// Write file tool - used by agents to create/update files
export const writeFileTool = tool({
  description:
    "Write content to a file, creating directories as needed. Only works within workspace directories.",
  parameters: z.object({
    path: z.string().min(1, "File path is required"),
    content: z.string(),
    createDirs: z.boolean().optional().default(true),
  }),
  execute: async ({ path, content, createDirs }) => {
    try {
      const safePath = validatePath(path);

      // Create parent directories if needed
      if (createDirs) {
        const dir = dirname(safePath);
        await mkdir(dir, { recursive: true });
      }

      // Write the file
      await writeFile(safePath, content, "utf-8");

      // Get file stats for confirmation
      const stats = await stat(safePath);

      return {
        success: true,
        path: path,
        size: stats.size,
        created: true,
      };
    } catch (error) {
      return {
        success: false,
        path: path,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// List directory tool - used by agents to explore directory structure
export const listDirTool = tool({
  description:
    "List files and directories in a given path. Only works within workspace directories.",
  parameters: z.object({
    path: z.string().min(1, "Directory path is required"),
    includeHidden: z.boolean().optional().default(false),
  }),
  execute: async ({ path, includeHidden }) => {
    try {
      const safePath = validatePath(path);

      // Check if directory exists and is readable
      await access(safePath, constants.R_OK);

      const stats = await stat(safePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path ${path} is not a directory`);
      }

      // Read directory contents
      const entries = await readdir(safePath, { withFileTypes: true });

      const files = [];
      const directories = [];

      for (const entry of entries) {
        // Skip hidden files unless requested
        if (!includeHidden && entry.name.startsWith(".")) {
          continue;
        }

        const entryPath = join(path, entry.name);
        const entryStats = await stat(join(safePath, entry.name));

        const item = {
          name: entry.name,
          path: entryPath,
          size: entryStats.size,
          lastModified: entryStats.mtime.toISOString(),
        };

        if (entry.isDirectory()) {
          directories.push(item);
        } else {
          files.push(item);
        }
      }

      return {
        success: true,
        path: path,
        files: files.sort((a, b) => a.name.localeCompare(b.name)),
        directories: directories.sort((a, b) => a.name.localeCompare(b.name)),
        total: files.length + directories.length,
      };
    } catch (error) {
      return {
        success: false,
        path: path,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// Check if file exists tool
export const fileExistsTool = tool({
  description: "Check if a file or directory exists at the given path.",
  parameters: z.object({
    path: z.string().min(1, "Path is required"),
  }),
  execute: async ({ path }) => {
    try {
      const safePath = validatePath(path);
      await access(safePath, constants.F_OK);

      const stats = await stat(safePath);

      return {
        success: true,
        path: path,
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
      };
    } catch (error) {
      // File doesn't exist or access denied
      return {
        success: true,
        path: path,
        exists: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// Create directory tool
export const createDirTool = tool({
  description: "Create a directory and any necessary parent directories.",
  parameters: z.object({
    path: z.string().min(1, "Directory path is required"),
    recursive: z.boolean().optional().default(true),
  }),
  execute: async ({ path, recursive }) => {
    try {
      const safePath = validatePath(path);

      await mkdir(safePath, { recursive });

      return {
        success: true,
        path: path,
        created: true,
      };
    } catch (error) {
      return {
        success: false,
        path: path,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  },
});

// Export all tools as a collection for easy import by agents
export const fsTools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  listDir: listDirTool,
  fileExists: fileExistsTool,
  createDir: createDirTool,
};

// Helper function to validate workspace setup
export async function ensureWorkspaceStructure(
  workspacePath: string
): Promise<void> {
  const dirs = [
    join(workspacePath, "spec"),
    join(workspacePath, "tasks"),
    join(workspacePath, "build"),
    join(workspacePath, "build", "src"),
    join(workspacePath, "build", "tests"),
    join(workspacePath, "reports"),
    join(workspacePath, "reports", "reviews"),
    join(workspacePath, "reports", "e2e"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
}
