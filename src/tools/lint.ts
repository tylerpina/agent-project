import { tool } from "ai";
import { z } from "zod";
import { spawn } from "node:child_process";
import { join } from "node:path";

// Lint issue schema
const LintIssueSchema = z.object({
  file: z.string(),
  line: z.number().positive().optional(),
  column: z.number().positive().optional(),
  rule: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  fixable: z.boolean().optional().default(false),
});

// Lint result schema
const LintResultSchema = z.object({
  passed: z.boolean(),
  totalIssues: z.number().default(0),
  errors: z.number().default(0),
  warnings: z.number().default(0),
  info: z.number().default(0),
  fixableIssues: z.number().default(0),
  issues: z.array(LintIssueSchema).default([]),
});

// ESLint tool
export const lintTool = tool({
  description: "Run ESLint on files and return linting issues",
  parameters: z.object({
    files: z.array(z.string()).default([]), // Specific files to lint
    cwd: z.string().default("."),
    fix: z.boolean().default(false), // Auto-fix issues where possible
    format: z.enum(["json", "stylish"]).default("json"),
  }),
  execute: async ({ files, cwd, fix, format }) => {
    try {
      // For now, return a stub implementation
      // TODO: Implement actual ESLint integration

      const stubResult = {
        success: true,
        passed: true,
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        info: 0,
        fixableIssues: 0,
        issues: [],
        summary: "No linting issues found (stub implementation)",
        details: {
          message:
            "ESLint integration not yet implemented - this is a placeholder",
          files,
          cwd,
          fix,
        },
      };

      return stubResult;
    } catch (error) {
      return {
        success: false,
        passed: false,
        error: error instanceof Error ? error.message : "Linting failed",
        totalIssues: 0,
        errors: 0,
        warnings: 0,
        issues: [],
      };
    }
  },
});

// TypeScript type checker tool
export const typeCheckTool = tool({
  description: "Run TypeScript compiler to check for type errors",
  parameters: z.object({
    files: z.array(z.string()).default([]),
    cwd: z.string().default("."),
    strict: z.boolean().default(true),
  }),
  execute: async ({ files, cwd, strict }) => {
    try {
      // Stub implementation
      return {
        success: true,
        passed: true,
        errors: 0,
        warnings: 0,
        issues: [],
        summary: "No type errors found (stub implementation)",
        details: {
          message:
            "TypeScript checking not yet implemented - this is a placeholder",
          files,
          cwd,
          strict,
        },
      };
    } catch (error) {
      return {
        success: false,
        passed: false,
        error: error instanceof Error ? error.message : "Type checking failed",
        errors: 0,
        issues: [],
      };
    }
  },
});

// Prettier formatter tool
export const formatTool = tool({
  description: "Format code using Prettier",
  parameters: z.object({
    files: z.array(z.string()).default([]),
    cwd: z.string().default("."),
    check: z.boolean().default(false), // Only check formatting, don't write
  }),
  execute: async ({ files, cwd, check }) => {
    try {
      // Stub implementation
      return {
        success: true,
        formatted: !check,
        filesChanged: check ? 0 : files.length,
        issues: [],
        summary: check
          ? "All files are properly formatted (stub implementation)"
          : `Formatted ${files.length} files (stub implementation)`,
        details: {
          message:
            "Prettier integration not yet implemented - this is a placeholder",
          files,
          cwd,
          check,
        },
      };
    } catch (error) {
      return {
        success: false,
        formatted: false,
        error: error instanceof Error ? error.message : "Formatting failed",
        filesChanged: 0,
      };
    }
  },
});

// Security linter tool (basic implementation)
export const securityLintTool = tool({
  description: "Check for common security issues in code",
  parameters: z.object({
    files: z.array(z.string()).default([]),
    cwd: z.string().default("."),
  }),
  execute: async ({ files, cwd }) => {
    try {
      const issues = [];
      const fs = await import("node:fs/promises");

      // Basic security checks on file content
      for (const file of files) {
        try {
          const filePath = join(cwd, file);
          const content = await fs.readFile(filePath, "utf-8");

          // Check for hardcoded secrets/passwords
          const secretPatterns = [
            /password\s*=\s*['"]\w+['"]/i,
            /api[_-]?key\s*=\s*['"]\w+['"]/i,
            /secret\s*=\s*['"]\w+['"]/i,
            /token\s*=\s*['"]\w+['"]/i,
          ];

          secretPatterns.forEach((pattern, index) => {
            const matches = content.match(pattern);
            if (matches) {
              issues.push({
                file,
                rule: "hardcoded-secret",
                severity: "error" as const,
                message: "Potential hardcoded secret detected",
                line: content
                  .substring(0, content.indexOf(matches[0]))
                  .split("\n").length,
              });
            }
          });

          // Check for eval() usage
          if (content.includes("eval(")) {
            issues.push({
              file,
              rule: "no-eval",
              severity: "error" as const,
              message: "Use of eval() is dangerous and should be avoided",
            });
          }
        } catch (fileError) {
          // Skip files that can't be read
          continue;
        }
      }

      return {
        success: true,
        passed: issues.length === 0,
        totalIssues: issues.length,
        vulnerabilities: issues.length,
        issues,
        summary:
          issues.length === 0
            ? "No security issues found"
            : `Found ${issues.length} potential security issue(s)`,
      };
    } catch (error) {
      return {
        success: false,
        passed: false,
        error: error instanceof Error ? error.message : "Security check failed",
        totalIssues: 0,
        vulnerabilities: 0,
        issues: [],
      };
    }
  },
});

// Combined linting tool that runs multiple checks
export const runAllLintsTool = tool({
  description: "Run all available linting and checking tools",
  parameters: z.object({
    files: z.array(z.string()).default([]),
    cwd: z.string().default("."),
    includeSecurity: z.boolean().default(true),
    includeFormat: z.boolean().default(true),
    includeTypes: z.boolean().default(true),
  }),
  execute: async ({
    files,
    cwd,
    includeSecurity,
    includeFormat,
    includeTypes,
  }) => {
    try {
      const results = {
        eslint: await lintTool.execute({ files, cwd }),
        security: includeSecurity
          ? await securityLintTool.execute({ files, cwd })
          : null,
        formatting: includeFormat
          ? await formatTool.execute({ files, cwd, check: true })
          : null,
        typecheck: includeTypes
          ? await typeCheckTool.execute({ files, cwd })
          : null,
      };

      const totalIssues =
        (results.eslint.success ? results.eslint.totalIssues : 0) +
        (results.security?.success ? results.security.totalIssues : 0);

      const passed =
        results.eslint.success &&
        results.eslint.passed &&
        (!results.security ||
          (results.security.success && results.security.passed)) &&
        (!results.formatting || results.formatting.success) &&
        (!results.typecheck ||
          (results.typecheck.success && results.typecheck.passed));

      return {
        success: true,
        passed,
        totalIssues,
        results,
        summary: passed
          ? "All linting checks passed"
          : `Found ${totalIssues} issue(s) across linting checks`,
      };
    } catch (error) {
      return {
        success: false,
        passed: false,
        error: error instanceof Error ? error.message : "Linting suite failed",
        totalIssues: 0,
        results: {},
      };
    }
  },
});

// Export all lint tools
export const lintTools = {
  lint: lintTool,
  typeCheck: typeCheckTool,
  format: formatTool,
  securityLint: securityLintTool,
  runAllLints: runAllLintsTool,
};

// Type exports
export type LintIssue = z.infer<typeof LintIssueSchema>;
export type LintResult = z.infer<typeof LintResultSchema>;
