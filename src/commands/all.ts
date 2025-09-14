import { compileCmd } from "./compile.js";
import { runCmd } from "./run.js";
import { reviewCmd } from "./review.js";
import { aggregateCmd } from "./aggregate.js";

interface AllOptions {
  project?: string;
  workspace?: string;
  model: string;
  parallel: string;
  voting?: string;
  maxIter: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function allCmd(prdPath: string, options: AllOptions) {
  console.log("🌟 Starting complete pipeline...");

  if (options.verbose) {
    console.log("Options:", options);
    console.log("PRD Path:", prdPath);
  }

  try {
    // Step 1: Compile
    console.log("\n📝 Step 1: Compile");
    await compileCmd(prdPath, {
      project: options.project,
      workspace: options.workspace,
      model: options.model,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });

    if (options.dryRun) {
      console.log("🏃‍♂️ Dry run completed - skipping execution steps");
      return;
    }

    // Derive project name for subsequent steps
    const project =
      options.project ??
      prdPath
        .split("/")
        .pop()
        ?.replace(/\.[^/.]+$/, "")
        .replace(/\W+/g, "-")
        .toLowerCase();

    if (!project) {
      throw new Error("Could not derive project name");
    }

    // Step 2: Run
    console.log("\n🚀 Step 2: Run Tasks");
    await runCmd({
      project,
      parallel: options.parallel,
      voting: options.voting,
      model: options.model,
      verbose: options.verbose,
    });

    // Step 3: Review
    console.log("\n🔍 Step 3: Review");
    await reviewCmd({
      project,
      maxIter: options.maxIter,
      verbose: options.verbose,
    });

    // Step 4: Aggregate
    console.log("\n🔗 Step 4: Aggregate");
    await aggregateCmd({
      project,
      verbose: options.verbose,
    });

    console.log("\n🎉 Complete pipeline finished successfully!");
  } catch (error) {
    console.error("❌ Pipeline failed:", error);
    process.exit(1);
  }
}
