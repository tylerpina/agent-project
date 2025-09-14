import { getDatabase } from "../core/db.js";
import { projects, specs, tasks } from "../schemas/db.js";
import { eq } from "drizzle-orm";
import { SpecSchema, type Spec } from "../schemas/spec.js";
import {
  ProjectAssemblyOrchestrator,
  type WorkerResult,
  type ReviewResult,
} from "../agents/index.js";
import path from "node:path";

interface AggregateOptions {
  project: string;
  verbose?: boolean;
  model?: string;
  dryRun?: boolean;
}

export async function aggregateCmd(options: AggregateOptions) {
  console.log("🧩 Starting project aggregation...");

  if (options.verbose) {
    console.log("Options:", options);
  }

  try {
    const db = getDatabase();
    const model = options.model || "gpt-4o-mini";

    console.log(`📁 Project: ${options.project}`);

    // Step 1: Load project, spec, and task results from database
    console.log("📋 Loading project data...");

    const [projectRecord] = await db
      .select()
      .from(projects)
      .where(eq(projects.slug, options.project))
      .limit(1);

    if (!projectRecord) {
      throw new Error(
        `Project '${options.project}' not found. Run compile first.`
      );
    }

    const [specRecord] = await db
      .select()
      .from(specs)
      .where(eq(specs.projectId, projectRecord.id))
      .orderBy(specs.version)
      .limit(1);

    if (!specRecord) {
      throw new Error(
        `No specification found for project '${options.project}'. Run compile first.`
      );
    }

    // Load task execution results
    const taskRecords = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectRecord.id));

    if (taskRecords.length === 0) {
      throw new Error(
        `No task execution results found for project '${options.project}'. Run 'ideaforge run' first.`
      );
    }

    // Parse and validate the spec
    const spec: Spec = SpecSchema.parse(JSON.parse(specRecord.json as string));

    console.log(
      `📊 Loaded: ${spec.tasks.length} tasks, ${taskRecords.length} execution results`
    );

    // Step 2: Prepare task results for aggregation
    const taskResults = taskRecords.map((taskRecord) => {
      const task = spec.tasks.find((t) => t.id === taskRecord.taskId);
      if (!task) {
        throw new Error(`Task ${taskRecord.taskId} not found in spec`);
      }

      const workerResult: WorkerResult = JSON.parse(
        taskRecord.workerOutput as string
      );
      const reviewResult: ReviewResult = JSON.parse(
        taskRecord.reviewOutput as string
      );

      return { task, workerResult, reviewResult };
    });

    const approvedTasks = taskResults.filter(
      (tr) => tr.reviewResult.status === "approved"
    );
    const failedTasks = taskResults.filter(
      (tr) => tr.reviewResult.status !== "approved"
    );

    console.log(
      `✅ Approved tasks: ${approvedTasks.length}/${taskResults.length}`
    );

    if (failedTasks.length > 0) {
      console.log(
        `⚠️  ${failedTasks.length} tasks not approved - proceeding with approved tasks only`
      );
      if (options.verbose) {
        failedTasks.forEach((tr) => {
          console.log(
            `   ❌ ${tr.task.id}: ${tr.task.title} (${tr.reviewResult.status})`
          );
        });
      }
    }

    if (options.dryRun) {
      console.log("🏃‍♂️ Dry run mode - no aggregation will be performed.");
      console.log(
        `Would aggregate ${approvedTasks.length} approved tasks into complete project`
      );
      return;
    }

    // Step 3: Initialize aggregation orchestrator
    console.log("🤖 Initializing aggregation agent...");
    const assemblyOrchestrator = new ProjectAssemblyOrchestrator(model);

    // Step 4: Perform project aggregation
    console.log("🏗️  Aggregating project components...");
    const aggregationContext = {
      projectName: spec.project,
      entities: spec.entities,
      apis: spec.apis,
      scenarios: spec.scenarios,
      workspacePath: projectRecord.workspacePath,
      specPath: path.join(projectRecord.workspacePath, "spec.ai.json"),
    };

    const aggregationResult = await assemblyOrchestrator.assembleProject(
      taskResults,
      aggregationContext
    );

    // Step 5: Display aggregation results
    console.log("\n📊 Aggregation Results:");
    console.log(`   Status: ${aggregationResult.status.toUpperCase()}`);
    console.log(
      `   Overall Quality: ${aggregationResult.quality.overallScore}/100`
    );
    console.log(
      `   Task Completion: ${aggregationResult.quality.taskCompletion}%`
    );
    console.log(
      `   Code Quality: ${aggregationResult.quality.codeQuality}/100`
    );
    console.log(`   Test Coverage: ${aggregationResult.quality.testCoverage}%`);

    console.log("\n📁 Generated Output:");
    console.log(
      `   Total Files: ${aggregationResult.outputs.codebase.totalFiles}`
    );
    console.log(
      `   Total Lines: ${aggregationResult.outputs.codebase.totalLines}`
    );
    console.log(
      `   Languages: ${aggregationResult.outputs.codebase.languages.join(", ")}`
    );
    console.log(
      `   Tests: ${aggregationResult.outputs.tests.totalTests} (${aggregationResult.outputs.tests.passRate}% pass rate)`
    );

    if (options.verbose) {
      console.log("\n🏗️  Project Structure:");
      Object.entries(aggregationResult.outputs.codebase.structure).forEach(
        ([dir, files]) => {
          console.log(`   ${dir}/`);
          (files as string[]).forEach((file) => {
            console.log(`      ├── ${file}`);
          });
        }
      );

      if (aggregationResult.issues.length > 0) {
        console.log("\n⚠️  Issues Found:");
        aggregationResult.issues.forEach((issue) => {
          const icon =
            issue.type === "error"
              ? "❌"
              : issue.type === "warning"
              ? "⚠️"
              : "ℹ️";
          console.log(`   ${icon} ${issue.category}: ${issue.description}`);
        });
      }
    }

    // Step 6: Update project status
    await db
      .update(projects)
      .set({
        status: aggregationResult.status === "success" ? "DONE" : "ASSEMBLED",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectRecord.id));

    console.log(
      `\n📂 Output Location: ${aggregationResult.metadata.outputPath}`
    );
    console.log(
      `⏱️  Build Duration: ${Math.round(
        aggregationResult.metadata.buildDuration / 1000
      )}s`
    );

    // Step 7: Show next steps
    console.log("\n🎯 Next Steps:");
    if (aggregationResult.status === "success") {
      console.log(`   🚀 Project ready for deployment!`);
      console.log(`   📁 Check: ${aggregationResult.metadata.outputPath}`);
      console.log(
        `   📖 Read: ${path.join(
          aggregationResult.metadata.outputPath,
          "README.md"
        )}`
      );
    } else {
      console.log(`   🔧 Address issues and re-run aggregation`);
      console.log(`   📋 Review: ideaforge review ${options.project}`);
    }

    if (aggregationResult.outputs.deployment.packageJson) {
      console.log(
        `   📦 Install: cd ${aggregationResult.metadata.outputPath} && npm install`
      );
      console.log(`   🧪 Test: npm test`);
      console.log(`   🚀 Run: npm start`);
    }

    console.log("✅ Project aggregation completed successfully!");
  } catch (error) {
    console.error("❌ Aggregation failed:", error);
    process.exit(4);
  }
}
