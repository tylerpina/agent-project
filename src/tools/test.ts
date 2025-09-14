import { tool } from "ai";
import { z } from "zod";
import { spawn } from "node:child_process";
import { join } from "node:path";

// Test result schema
const TestResultSchema = z.object({
  passed: z.boolean(),
  totalTests: z.number().default(0),
  passedTests: z.number().default(0),
  failedTests: z.number().default(0),
  skippedTests: z.number().default(0),
  duration: z.number().optional(), // in milliseconds
  coverage: z
    .object({
      statements: z.number().min(0).max(100).optional(),
      branches: z.number().min(0).max(100).optional(),
      functions: z.number().min(0).max(100).optional(),
      lines: z.number().min(0).max(100).optional(),
    })
    .optional(),
  details: z.any().optional(), // Raw test output
});

// Run tests tool - initially as stub, will integrate with Vitest later
export const runTestsTool = tool({
  description:
    "Run unit tests in the specified directory and return results summary",
  parameters: z.object({
    cwd: z.string().default("."),
    pattern: z.string().optional(), // Test file pattern
    coverage: z.boolean().default(false),
    timeout: z.number().default(30000), // 30 second timeout
  }),
  execute: async ({ cwd, pattern, coverage, timeout }) => {
    try {
      // For now, return a stub response
      // TODO: Implement actual test execution with Vitest

      const stubResult = {
        success: true,
        passed: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration: 0,
        summary: "No tests found (stub implementation)",
        details: {
          message: "Test runner not yet implemented - this is a placeholder",
          cwd,
          pattern,
          coverage,
        },
      };

      return stubResult;
    } catch (error) {
      return {
        success: false,
        passed: false,
        error: error instanceof Error ? error.message : "Test execution failed",
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
      };
    }
  },
});

// Run specific test file tool
export const runTestFileTool = tool({
  description: "Run tests for a specific file",
  parameters: z.object({
    testFile: z.string().min(1, "Test file path is required"),
    cwd: z.string().default("."),
    timeout: z.number().default(30000),
  }),
  execute: async ({ testFile, cwd, timeout }) => {
    try {
      // Stub implementation
      return {
        success: true,
        passed: true,
        file: testFile,
        tests: 0,
        passed_tests: 0,
        duration: 0,
        summary: `No tests executed for ${testFile} (stub implementation)`,
      };
    } catch (error) {
      return {
        success: false,
        passed: false,
        file: testFile,
        error: error instanceof Error ? error.message : "Test execution failed",
      };
    }
  },
});

// Validate test file tool
export const validateTestFileTool = tool({
  description:
    "Check if a test file is properly structured and can be executed",
  parameters: z.object({
    testFile: z.string().min(1, "Test file path is required"),
    cwd: z.string().default("."),
  }),
  execute: async ({ testFile, cwd }) => {
    try {
      // Basic validation - check if file exists and has test patterns
      const fs = await import("node:fs/promises");
      const path = join(cwd, testFile);

      try {
        const content = await fs.readFile(path, "utf-8");

        // Check for common test patterns
        const hasDescribe =
          content.includes("describe(") ||
          content.includes("test(") ||
          content.includes("it(");
        const hasExpect = content.includes("expect(");
        const hasImports =
          content.includes("import") || content.includes("require");

        return {
          success: true,
          file: testFile,
          valid: hasDescribe && (hasExpect || content.includes("assert")),
          checks: {
            hasTestStructure: hasDescribe,
            hasAssertions: hasExpect,
            hasImports,
            fileExists: true,
          },
          suggestions: !hasDescribe
            ? ["Add test cases with describe() or test()"]
            : [],
        };
      } catch (fileError) {
        return {
          success: true,
          file: testFile,
          valid: false,
          checks: {
            hasTestStructure: false,
            hasAssertions: false,
            hasImports: false,
            fileExists: false,
          },
          error: "Test file does not exist",
        };
      }
    } catch (error) {
      return {
        success: false,
        file: testFile,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },
});

// Helper function to execute shell command with timeout
async function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// Export all test tools
export const testTools = {
  runTests: runTestsTool,
  runTestFile: runTestFileTool,
  validateTestFile: validateTestFileTool,
};

// Type exports
export type TestResult = z.infer<typeof TestResultSchema>;
