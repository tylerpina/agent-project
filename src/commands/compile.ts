import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../core/db.js";
import {
  createCompilationOrchestrator,
  CompilationOrchestrator,
} from "../agents/index.js";
import { createSpecAssembler } from "../core/spec-assembler.js";
import { projects, specs } from "../schemas/db.js";
import { ensureWorkspaceStructure } from "../tools/fs.js";

interface CompileOptions {
  project?: string;
  workspace?: string;
  model: string;
  dryRun?: boolean;
  verbose?: boolean;
  output?: string;
}

export async function compileCmd(prdPath: string, options: CompileOptions) {
  console.log("🔨 Starting compilation...");

  if (options.verbose) {
    console.log("Options:", options);
    console.log("PRD Path:", prdPath);
  }

  try {
    // Derive project slug from filename if not provided
    const project =
      options.project ??
      path.parse(prdPath).name.replace(/\W+/g, "-").toLowerCase();
    const workspace = options.workspace ?? path.join("projects", project);
    const workspacePath = path.resolve(workspace);

    console.log(`📁 Project: ${project}`);
    if (options.verbose) {
      console.log(`📂 Workspace: ${workspacePath}`);
    }

    // Read PRD file
    const prdContent = await readFile(prdPath, "utf-8");
    console.log(`📄 PRD loaded (${prdContent.length} chars)`);

    if (options.dryRun) {
      console.log("🔍 DRY RUN MODE - No files will be created\n");
    }

    // Step 1: Initialize compilation orchestrator
    const model = options.model || "gpt-4o-mini";
    const orchestrator = createCompilationOrchestrator(model);

    console.log("🤖 Initializing AI agents...");
    if (options.verbose) {
      console.log(`   Model: ${model}`);
    }

    // Step 2: Run all compilation agents
    console.log("\n🔄 Running compilation pipeline...");
    const startTime = Date.now();

    const compilationResults = await orchestrator.compileAll(
      prdContent,
      prdPath
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Compilation completed in ${duration}s`);

    // Step 3: Assemble final specification
    console.log("\n🔧 Assembling specification...");
    const assembler = createSpecAssembler({
      generateTasks: true,
      includeTestTasks: true,
      includeDocumentationTasks: true,
    });

    const assemblyResult = await assembler.assembleSpec(
      compilationResults.summary,
      compilationResults.entityApi,
      compilationResults.constraints,
      compilationResults.scenarios,
      compilationResults.hints,
      prdPath
    );

    // Step 4: Display results summary
    console.log("\n📊 Compilation Results:");
    console.log(`   📋 Project: ${assemblyResult.spec.project}`);
    console.log(`   👥 Personas: ${assemblyResult.spec.personas.length}`);
    console.log(`   🏗️  Entities: ${assemblyResult.spec.entities.length}`);
    console.log(`   🔌 APIs: ${assemblyResult.spec.apis.length}`);
    console.log(
      `   ⚖️  Constraints: ${assemblyResult.spec.constraints.length}`
    );
    console.log(`   🎯 Scenarios: ${assemblyResult.spec.scenarios.length}`);
    console.log(`   📋 Tasks: ${assemblyResult.spec.tasks.length}`);
    console.log(
      `   ⏱️  Estimated: ${
        assemblyResult.spec.metadata?.totalEstimatedHours || 0
      }h`
    );

    if (options.verbose) {
      console.log("\n🔍 Detailed Breakdown:");

      // Show entities
      if (assemblyResult.spec.entities.length > 0) {
        console.log("   Entities:");
        assemblyResult.spec.entities.forEach((entity) => {
          console.log(
            `     • ${entity.name} (${entity.attributes.length} attributes)`
          );
        });
      }

      // Show constraints by type
      const constraintsByType = assemblyResult.spec.constraints.reduce(
        (acc, c) => {
          acc[c.type] = (acc[c.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      if (Object.keys(constraintsByType).length > 0) {
        console.log("   Constraints:");
        Object.entries(constraintsByType).forEach(([type, count]) => {
          console.log(`     • ${type}: ${count}`);
        });
      }

      // Show task breakdown
      const tasksByComplexity = assemblyResult.spec.tasks.reduce((acc, t) => {
        const complexity = t.estimatedComplexity || "medium";
        acc[complexity] = (acc[complexity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      if (Object.keys(tasksByComplexity).length > 0) {
        console.log("   Tasks by complexity:");
        Object.entries(tasksByComplexity).forEach(([complexity, count]) => {
          console.log(`     • ${complexity}: ${count}`);
        });
      }
    }

    // Step 5: Save to database and files (unless dry run)
    if (!options.dryRun) {
      console.log("\n💾 Saving results...");

      // Create workspace structure
      await ensureWorkspaceStructure(workspacePath);

      // Save to database
      const db = getDatabase();

      // Insert or update project
      const [projectRecord] = await db
        .insert(projects)
        .values({
          name: assemblyResult.spec.project,
          slug: project,
          status: "COMPILED",
          workspacePath,
        })
        .onConflictDoUpdate({
          target: projects.slug,
          set: {
            name: assemblyResult.spec.project,
            status: "COMPILED",
            workspacePath,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Insert spec
      await db.insert(specs).values({
        projectId: projectRecord.id,
        version: 1,
        json: JSON.stringify(assemblyResult.spec),
      });

      // Save spec.ai.json
      const specPath = path.join(workspacePath, "spec.ai.json");
      await writeFile(specPath, JSON.stringify(assemblyResult.spec, null, 2));

      // Save compilation metadata
      const metadataPath = path.join(
        workspacePath,
        "compilation-metadata.json"
      );
      await writeFile(
        metadataPath,
        JSON.stringify(assemblyResult.metadata, null, 2)
      );

      console.log(`   💾 Database: Project #${projectRecord.id} saved`);
      console.log(`   📄 Spec: ${specPath}`);
      console.log(`   📊 Metadata: ${metadataPath}`);

      // Set output path for other commands
      if (options.output) {
        const outputPath = path.resolve(options.output);
        await writeFile(
          outputPath,
          JSON.stringify(assemblyResult.spec, null, 2)
        );
        console.log(`   📤 Output: ${outputPath}`);
      }
    }

    // Step 6: Show validation results
    const validation = orchestrator.validateCompilationResults({
      summary: compilationResults.summary,
      entityApi: compilationResults.entityApi,
      constraints: compilationResults.constraints,
      scenarios: compilationResults.scenarios,
      hints: compilationResults.hints,
    });

    if (validation.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      validation.warnings.forEach((warning) => {
        console.log(`   • ${warning}`);
      });
    }

    if (validation.issues.length > 0) {
      console.log("\n❌ Issues:");
      validation.issues.forEach((issue) => {
        console.log(`   • ${issue}`);
      });
    }

    console.log("\n✅ Compile command completed successfully!");
    console.log(`\nNext steps:`);
    console.log(`   ideaforge run ${project}         # Execute tasks`);
    console.log(`   ideaforge review ${project}      # Review outputs`);
    console.log(`   ideaforge all ${prdPath}         # Run full pipeline`);
  } catch (error) {
    console.error("\n❌ Compilation failed:");
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (options.verbose && error.stack) {
        console.error(`\nStack trace:\n${error.stack}`);
      }
    } else {
      console.error(`   ${error}`);
    }
    process.exit(1);
  }
}
