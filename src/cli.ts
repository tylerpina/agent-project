#!/usr/bin/env node

import { Command } from "commander";
import { compileCmd } from "./commands/compile.js";
import { runCmd } from "./commands/run.js";
import { reviewCmd } from "./commands/review.js";
import { aggregateCmd } from "./commands/aggregate.js";
import { allCmd } from "./commands/all.js";
import { bundleCmd } from "./commands/bundle.js";
import { initializeDatabase, closeDatabaseConnection } from "./core/db.js";
import { runMigrations } from "./core/migrate.js";

const program = new Command();

program
  .name("ideaforge")
  .description(
    "CLI tool to convert PRDs into AI-ready specs and executable task DAGs"
  )
  .version("1.0.0")
  .hook("preAction", async (thisCommand) => {
    // Initialize database before any command runs
    try {
      await runMigrations();
    } catch (error) {
      console.error("Failed to initialize database:", error);
      process.exit(5);
    }
  });

// Compile command
program
  .command("compile")
  .argument("<prdPath>", "Path to PRD file (.md, .pdf, .docx)")
  .option(
    "-p, --project <slug>",
    "Project slug (default: derived from filename)"
  )
  .option(
    "-w, --workspace <dir>",
    "Base workspace directory (default: ./workspace/<slug>)"
  )
  .option("--model <id>", "LLM model to use", "gpt-4o-mini")
  .option("--dry-run", "Show compilation plan without writing files")
  .option("--verbose", "Enable verbose logging")
  .description("Convert PRD into spec.ai.json, spec.ai.md, and task files")
  .action(compileCmd);

// Run command
program
  .command("run")
  .requiredOption("-p, --project <slug>", "Project slug")
  .option("--parallel <n>", "Max concurrent tasks", "2")
  .option(
    "--voting <strategy>",
    "Voting strategy (e.g., self-consistency:3, pair-debate, committee:5)"
  )
  .option("--model <id>", "LLM model to use", "gpt-4o-mini")
  .option("--verbose", "Enable verbose logging")
  .description("Execute tasks in parallel with optional voting")
  .action(runCmd);

// Review command
program
  .command("review")
  .requiredOption("-p, --project <slug>", "Project slug")
  .option(
    "--task <id>",
    "Specific task ID to review (default: all non-approved tasks)"
  )
  .option("--max-iter <n>", "Maximum review iterations", "3")
  .option("--verbose", "Enable verbose logging")
  .description("Run review loop for tasks until they pass or max iterations")
  .action(reviewCmd);

// Aggregate command
program
  .command("aggregate")
  .requiredOption("-p, --project <slug>", "Project slug")
  .option("--verbose", "Enable verbose logging")
  .description("Merge task outputs into /build with OpenAPI and README")
  .action(aggregateCmd);

// All command (convenience)
program
  .command("all")
  .argument("<prdPath>", "Path to PRD file (.md, .pdf, .docx)")
  .option(
    "-p, --project <slug>",
    "Project slug (default: derived from filename)"
  )
  .option(
    "-w, --workspace <dir>",
    "Base workspace directory (default: ./workspace/<slug>)"
  )
  .option("--model <id>", "LLM model to use", "gpt-4o-mini")
  .option("--parallel <n>", "Max concurrent tasks", "2")
  .option("--voting <strategy>", "Voting strategy (optional)")
  .option("--max-iter <n>", "Maximum review iterations", "3")
  .option("--dry-run", "Show plan without execution")
  .option("--verbose", "Enable verbose logging")
  .description("Run complete pipeline: compile → run → review → aggregate")
  .action(allCmd);

// Bundle command
program
  .command("bundle")
  .requiredOption("-p, --project <slug>", "Project slug")
  .option("--out <path>", "Output zip file path", "./bundle.zip")
  .description("Create zip bundle with all project artifacts")
  .action(bundleCmd);

// Global error handling
program.exitOverride((err) => {
  if (err.code === "commander.missingArgument") {
    console.error("Error: Missing required argument");
    process.exit(5);
  }
  if (err.code === "commander.unknownOption") {
    console.error("Error: Unknown option");
    process.exit(5);
  }
  process.exit(err.exitCode || 1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Interrupted by user");
  closeDatabaseConnection();
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Terminated");
  closeDatabaseConnection();
  process.exit(143);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  closeDatabaseConnection();
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  closeDatabaseConnection();
  process.exit(1);
});

// Parse command line arguments
async function main() {
  try {
    await program.parseAsync();
  } catch (error) {
    console.error("CLI Error:", error);
    closeDatabaseConnection();
    process.exit(1);
  }
}

main();
