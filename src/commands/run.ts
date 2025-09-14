import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../core/db.js";
import { projects, specs, tasks } from "../schemas/db.js";
import { eq } from "drizzle-orm";
import { SpecSchema, type Spec } from "../schemas/spec.js";
import {
  TaskExecutionOrchestrator,
  ReviewLoopOrchestrator,
  type WorkerResult,
  type ReviewResult,
} from "../agents/index.js";

interface RunOptions {
  project: string;
  parallel: string;
  voting?: string;
  model: string;
  verbose?: boolean;
  dryRun?: boolean;
}

export async function runCmd(options: RunOptions) {
  console.log("🚀 Starting task execution...");

  if (options.verbose) {
    console.log("Options:", options);
  }

  try {
    const db = getDatabase();
    const parallelCount = parseInt(options.parallel, 10);

    console.log(`📁 Project: ${options.project}`);
    console.log(`⚡ Parallel tasks: ${parallelCount}`);

    if (options.voting) {
      console.log(`🗳️  Voting strategy: ${options.voting}`);
    }

    // Step 1: Load project and spec from database
    console.log("📋 Loading project specification...");

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

    // Parse and validate the spec
    const spec: Spec = SpecSchema.parse(JSON.parse(specRecord.json as string));

    console.log(
      `📊 Loaded spec: ${spec.tasks.length} tasks, ${spec.scenarios.length} scenarios`
    );

    if (options.verbose) {
      console.log("--- Project Details ---");
      console.log(`   Project: ${spec.project}`);
      console.log(`   Version: ${spec.version}`);
      console.log(`   Tasks: ${spec.tasks.length}`);
      console.log(`   Entities: ${spec.entities.length}`);
      console.log(`   APIs: ${spec.apis.length}`);
      console.log(`   Scenarios: ${spec.scenarios.length}`);
      console.log("----------------------");
    }

    if (options.dryRun) {
      console.log("🏃‍♂️ Dry run mode - no tasks will be executed.");
      console.log(`Would execute ${spec.tasks.length} tasks:`);
      spec.tasks.forEach((task) => {
        console.log(
          `   - ${task.id}: ${task.title} (${task.estimatedComplexity})`
        );
      });
      return;
    }

    // Step 2: Initialize execution orchestrators
    console.log("🤖 Initializing execution agents...");
    const taskOrchestrator = new TaskExecutionOrchestrator(options.model);
    const reviewOrchestrator = new ReviewLoopOrchestrator(options.model, 3); // Max 3 review iterations

    // Step 3: Execute tasks in dependency order
    console.log("⚙️  Executing tasks...");
    const executionContext = {
      entities: spec.entities,
      apis: spec.apis,
      constraints: spec.constraints,
      scenarios: spec.scenarios,
      workspacePath: projectRecord.workspacePath,
      projectName: spec.project,
    };

    const workerResults = await taskOrchestrator.executeTasks(
      spec.tasks,
      executionContext
    );

    console.log(
      `✅ Task execution completed: ${workerResults.length} tasks processed`
    );

    // Step 4: Run review loops for each task
    console.log("🔍 Starting review process...");
    const reviewContext = {
      scenarios: spec.scenarios,
      constraints: spec.constraints,
      workspacePath: projectRecord.workspacePath,
      projectName: spec.project,
    };

    const reviewResults: Array<{
      task: any;
      workerResult: WorkerResult;
      reviewResult: ReviewResult;
    }> = [];

    for (let i = 0; i < spec.tasks.length; i++) {
      const task = spec.tasks[i];
      const workerResult = workerResults[i];

      if (workerResult.status === "failed") {
        console.log(`⚠️  Skipping review for failed task ${task.id}`);
        reviewResults.push({
          task,
          workerResult,
          reviewResult: {
            taskId: task.id,
            status: "rejected",
            score: 0,
            feedback: {
              strengths: [],
              issues: [
                {
                  type: "critical",
                  category: "functionality",
                  description: "Task execution failed",
                },
              ],
              summary: "Task failed during execution",
            },
            checklist: {
              functionality: false,
              testing: false,
              codeQuality: false,
              security: false,
              performance: false,
              documentation: false,
            },
            recommendations: ["Fix execution errors and retry"],
            metadata: {
              reviewedAt: new Date(),
              reviewDuration: 0,
              filesReviewed: 0,
              linesReviewed: 0,
            },
          },
        });
        continue;
      }

      console.log(`🔍 Reviewing task ${task.id}...`);
      const reviewLoop = await reviewOrchestrator.runReviewLoop(
        workerResult,
        task,
        reviewContext
      );

      reviewResults.push({
        task,
        workerResult,
        reviewResult: reviewLoop.finalReview,
      });

      if (reviewLoop.approved) {
        console.log(
          `✅ Task ${task.id} approved after ${reviewLoop.iterations.length} iteration(s)`
        );
      } else {
        console.log(
          `⚠️  Task ${task.id} not approved after ${reviewLoop.iterations.length} iterations`
        );
      }
    }

    // Step 5: Save results to database
    console.log("💾 Saving execution results...");

    for (const result of reviewResults) {
      await db.insert(tasks).values({
        projectId: projectRecord.id,
        taskId: result.task.id,
        title: result.task.title,
        status:
          result.reviewResult.status === "approved"
            ? "APPROVED"
            : result.reviewResult.status === "rejected"
            ? "FAILED"
            : "NEEDS_CHANGES",
        workerOutput: JSON.stringify(result.workerResult),
        reviewOutput: JSON.stringify(result.reviewResult),
      });
    }

    // Step 6: Generate execution summary
    const approvedTasks = reviewResults.filter(
      (r) => r.reviewResult.status === "approved"
    );
    const failedTasks = reviewResults.filter(
      (r) => r.reviewResult.status === "rejected"
    );
    const pendingTasks = reviewResults.filter(
      (r) => r.reviewResult.status === "needs_changes"
    );

    console.log("\n📊 Execution Summary:");
    console.log(
      `   ✅ Approved: ${approvedTasks.length}/${reviewResults.length} tasks`
    );
    console.log(
      `   ❌ Failed: ${failedTasks.length}/${reviewResults.length} tasks`
    );
    console.log(
      `   ⚠️  Needs Changes: ${pendingTasks.length}/${reviewResults.length} tasks`
    );

    const avgScore =
      reviewResults.reduce((sum, r) => sum + r.reviewResult.score, 0) /
      reviewResults.length;
    console.log(`   📈 Average Quality Score: ${Math.round(avgScore)}/100`);

    if (options.verbose) {
      console.log("\n🔍 Detailed Results:");
      reviewResults.forEach((result) => {
        const status =
          result.reviewResult.status === "approved"
            ? "✅"
            : result.reviewResult.status === "rejected"
            ? "❌"
            : "⚠️";
        console.log(
          `   ${status} ${result.task.id}: ${result.task.title} (${result.reviewResult.score}/100)`
        );

        if (result.reviewResult.feedback.issues.length > 0) {
          result.reviewResult.feedback.issues.slice(0, 2).forEach((issue) => {
            console.log(`      - ${issue.type}: ${issue.description}`);
          });
        }
      });
    }

    // Step 7: Update project status
    await db
      .update(projects)
      .set({
        status:
          approvedTasks.length === reviewResults.length
            ? "ASSEMBLED"
            : "RUNNING",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectRecord.id));

    console.log("\n🎯 Next Steps:");
    if (approvedTasks.length === reviewResults.length) {
      console.log(
        `   Run: ideaforge aggregate ${options.project}     # Combine all outputs`
      );
    } else {
      console.log(
        `   Fix issues in ${
          failedTasks.length + pendingTasks.length
        } tasks and re-run`
      );
    }
    console.log(
      `   Run: ideaforge review ${options.project}       # Review detailed results`
    );

    console.log("✅ Task execution completed successfully!");
  } catch (error) {
    console.error("❌ Task execution failed:", error);
    process.exit(2);
  }
}
