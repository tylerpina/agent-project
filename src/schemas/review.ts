import { z } from "zod";

// Individual review issue schema
export const ReviewIssueSchema = z.object({
  file: z.string().min(1, "File path is required"),
  line: z.number().positive().optional(),
  column: z.number().positive().optional(),
  rule: z.string().min(1, "Rule identifier is required"),
  severity: z.enum(["low", "medium", "high", "critical"]),
  message: z.string().min(1, "Issue message is required"),
  category: z
    .enum([
      "syntax",
      "logic",
      "security",
      "performance",
      "style",
      "testing",
      "documentation",
    ])
    .optional(),
  acceptanceCriteria: z
    .string()
    .regex(/^AC-\d{3}$/)
    .optional(), // Which AC this relates to
  fixHint: z.string().optional(),
  codeSnippet: z.string().optional(),
});

// Review report schema - output from Reviewer Agent
export const ReviewReportSchema = z.object({
  taskId: z.string().regex(/^T-\d{3}$/, "Task ID must be in format T-XXX"),
  attempt: z.number().positive(),
  timestamp: z.date().default(() => new Date()),
  pass: z.boolean(),
  score: z.number().min(0).max(100).optional(), // Overall quality score

  // Detailed results
  issues: z.array(ReviewIssueSchema).default([]),
  coverage: z.object({
    acceptanceCriteria: z.array(z.string().regex(/^AC-\d{3}$/)).default([]), // ACs satisfied
    testCoverage: z.number().min(0).max(100).optional(),
    lintScore: z.number().min(0).max(100).optional(),
  }),

  // Tool execution results
  toolResults: z
    .object({
      linting: z
        .object({
          passed: z.boolean(),
          issues: z.number().default(0),
          details: z.any().optional(),
        })
        .optional(),
      testing: z
        .object({
          passed: z.boolean(),
          totalTests: z.number().default(0),
          passedTests: z.number().default(0),
          coverage: z.number().min(0).max(100).optional(),
          details: z.any().optional(),
        })
        .optional(),
      typeCheck: z
        .object({
          passed: z.boolean(),
          errors: z.number().default(0),
          details: z.any().optional(),
        })
        .optional(),
      security: z
        .object({
          passed: z.boolean(),
          vulnerabilities: z.number().default(0),
          details: z.any().optional(),
        })
        .optional(),
    })
    .optional(),

  // Summary and next steps
  summary: z.string().optional(),
  recommendations: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]), // Critical issues that must be fixed
});

// Review configuration schema
export const ReviewConfigSchema = z.object({
  maxIterations: z.number().positive().default(3),
  strictMode: z.boolean().default(false), // Fail on any issues vs. allow minor issues
  requiredTools: z
    .array(z.enum(["lint", "test", "typecheck", "security"]))
    .default(["lint", "test"]),
  minimumScore: z.number().min(0).max(100).default(70),
  enableAutoFix: z.boolean().default(false),
});

// Review loop state schema
export const ReviewLoopStateSchema = z.object({
  taskId: z.string().regex(/^T-\d{3}$/),
  currentAttempt: z.number().positive().default(1),
  maxAttempts: z.number().positive().default(3),
  status: z.enum(["running", "passed", "failed", "max_attempts_reached"]),
  reports: z.array(ReviewReportSchema).default([]),
  startedAt: z.date().default(() => new Date()),
  completedAt: z.date().optional(),
});

// Type exports
export type ReviewIssue = z.infer<typeof ReviewIssueSchema>;
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ReviewLoopState = z.infer<typeof ReviewLoopStateSchema>;

// Validation helpers
export function validateReviewReport(data: unknown): ReviewReport {
  return ReviewReportSchema.parse(data);
}

export function validateReviewConfig(data: unknown): ReviewConfig {
  return ReviewConfigSchema.parse(data);
}

// Review result helpers
export function isReviewPassing(
  report: ReviewReport,
  config: ReviewConfig
): boolean {
  if (!report.pass) return false;

  // Check minimum score if provided
  if (report.score !== undefined && report.score < config.minimumScore) {
    return false;
  }

  // Check for blockers
  if (report.blockers.length > 0) {
    return false;
  }

  // In strict mode, no issues allowed
  if (config.strictMode && report.issues.length > 0) {
    return false;
  }

  // Check for critical issues
  const criticalIssues = report.issues.filter(
    (issue) => issue.severity === "critical"
  );
  if (criticalIssues.length > 0) {
    return false;
  }

  return true;
}

export function getReviewSummary(report: ReviewReport): string {
  if (report.summary) return report.summary;

  const issueCount = report.issues.length;
  const criticalCount = report.issues.filter(
    (i) => i.severity === "critical"
  ).length;
  const highCount = report.issues.filter((i) => i.severity === "high").length;

  if (report.pass && issueCount === 0) {
    return "✅ All checks passed successfully";
  }

  if (criticalCount > 0) {
    return `❌ ${criticalCount} critical issue(s) found - must fix before approval`;
  }

  if (highCount > 0) {
    return `⚠️ ${highCount} high-priority issue(s) found - review recommended`;
  }

  if (issueCount > 0) {
    return `ℹ️ ${issueCount} minor issue(s) found - consider addressing`;
  }

  return "Review completed";
}

// Generate review report for failed attempt
export function createFailedReviewReport(
  taskId: string,
  attempt: number,
  error: Error
): ReviewReport {
  return {
    taskId,
    attempt,
    timestamp: new Date(),
    pass: false,
    issues: [
      {
        file: "unknown",
        rule: "execution_error",
        severity: "critical",
        message: error.message,
        category: "logic",
        fixHint: "Check task implementation and dependencies",
      },
    ],
    coverage: {
      acceptanceCriteria: [],
    },
    summary: `Task execution failed: ${error.message}`,
    blockers: [error.message],
  };
}
