# IdeaForge (working name) — CLI SPEC (No UI)

**Version:** 1.0
**Owner:** Tyler Pina
**Goal:** Convert a human PRD into an **AI-ready spec** and a **task DAG**, execute tasks with optional **voting**, enforce a **review loop**, and **aggregate** outputs into a build — **entirely via a command-line executable**, no UI.

---

## 1) Product Requirements

### 1.1 Problem

Human PRDs are ambiguous; coding agents need machine-readable structure. We want a single CLI to go from PRD → spec → tasks → code → review → assembled repo.

### 1.2 Objectives

* Accept a PRD path as CLI input; no web UI.
* Produce **spec.ai.json** (canonical machine spec) and **spec.ai.md** (human view) plus **/tasks/\*.task.md**.
* Execute tasks in parallel, with **toggleable voting** strategies (off by default).
* Enforce a **reviewer loop** (tools-first, deterministic) until acceptance or max iterations.
* Aggregate deliverables into `/build` with `openapi.yaml`, `README.generated.md`, and reports.

### 1.3 Non-Goals (MVP)

* No web server, dashboard, or auth.
* No multi-repo orchestration (single assembled repo in `/build`).
* No long-lived DB requirements (default: local SQLite). Optional Postgres later.

### 1.4 Success Metrics

* Ambiguity reduction ≥80% of PRD statements mapped to schema/AC.
* Spec coverage ≥90% ACs linked to tests.
* Iteration efficiency median ≤2 review loops per task.
* Assembly integrity ≥95% tasks merge on first aggregation.

---

## 2) CLI UX

### 2.1 Installation

* Node 20+
* `npm i -g ideaforge` (working name). Binary: `ideaforge` via `bin` entry.

### 2.2 Usage

```
ideaforge compile <prdPath> [options]
ideaforge run --project <slug> [options]
ideaforge review --project <slug> --task <T-ID> [--max-iter 3]
ideaforge aggregate --project <slug>
ideaforge all <prdPath> [options]
ideaforge bundle --project <slug> --out ./bundle.zip
```

### 2.3 Common Options

* `--project, -p <slug>`: Project id/slug (default derived from PRD filename).
* `--workspace, -w <dir>`: Base directory (default `./workspace/<slug>`).
* `--model <id>`: LLM id (default `gpt-4o-mini`).
* `--parallel <n>`: Max concurrent tasks.
* `--voting <strategy[:n]>`: `self-consistency[:3]`, `pair-debate[:2]`, `committee[:5]`.
* `--dry-run`: Show plan, don’t write files.
* `--verbose`: Extra logs.

### 2.4 Commands

* **compile**: Ingest PRD → emit `spec.ai.json`, `spec.ai.md`, `/tasks/*.task.md` and `questions.md` if ambiguities.
* **run**: Execute all ready tasks per DAG; honors `--parallel` and `--voting`.
* **review**: Force review for a specific task or all approved-pending ones.
* **aggregate**: Merge artifacts to `/build`, generate `openapi.yaml`, `README.generated.md`.
* **all**: `compile` → `run` → `aggregate` (with auto-review between runs).
* **bundle**: Zip `/build`, `/spec`, `/tasks`, `/reports` for handoff.

### 2.5 Exit Codes

* `0` success
* `1` compile/spec error
* `2` task execution failure
* `3` review failure (max iterations exceeded)
* `4` aggregation conflict
* `5` invalid CLI usage/config

---

## 3) Directory Layout (per project in workspace)

```
/workspace/<slug>/
  /inputs/raw.md
  /spec/spec.ai.json
  /spec/spec.ai.md
  /tasks/T-001.task.md ...
  /build/src/...          # assembled code
  /build/tests/...
  /build/openapi.yaml
  /reports/trace.jsonl
  /reports/reviews/*.json
  /reports/e2e/*.json
  questions.md
  ideaforge.config.json   # optional overrides per project
```

---

## 4) Storage & Config

* **Default storage:** SQLite (`.ideaforge.db` in project root) using Drizzle (SQLite flavor).
* **Config resolution order:** CLI flags > `ideaforge.config.json` > env vars > defaults.
* **Important env vars:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (optional), `IDEAFORGE_MODEL`.

### 4.1 `ideaforge.config.json` (example)

```json
{
  "model": "gpt-4o-mini",
  "parallel": 3,
  "voting": { "enabled": false, "strategy": "committee", "n": 3 },
  "review": { "maxIterations": 3 },
  "tooling": { "testCmd": "vitest --reporter=json", "lintCmd": "eslint -f json ." }
}
```

---

## 5) Architecture

### 5.1 High-Level Flow (no UI)

1. **Compile** (Semantic Compiler): Summary, Entity/API, Constraints, Scenarios, Hints agents → `spec.ai.json` (canonical) + `spec.ai.md` + `/tasks`.
2. **Run**: Task Runner topologically schedules tasks; Worker Agents execute (tools: fs, openapi, tests, lint).
3. **Review**: Reviewer Agent validates per AC and constraints, loops with Worker until pass or cap.
4. **Aggregate**: Aggregator applies patches, generates OpenAPI + README, and runs e2e.

### 5.2 Modules

* `/src/cli.ts` – command parser (commander/yargs)
* `/src/commands/compile.ts` – orchestrates compiler agents
* `/src/commands/run.ts` – task runner + voting
* `/src/commands/review.ts` – reviewer loop
* `/src/commands/aggregate.ts` – merge/build/export
* `/src/agents/*` – LLM agent wrappers (using Vercel AI SDK)
* `/src/tools/*` – fs, tests, lint, openapi
* `/src/core/*` – DAG, storage (drizzle), logging/traces
* `/src/schemas/*` – Zod schemas (Spec, Tasks, Review)

### 5.3 Models & SDK

* **Vercel AI SDK (`ai`)** for `generateText/streamText`, `tool()` calls, `responseSchema`.
* Default model: `@ai-sdk/openai` provider, swappable via config.

---

## 6) Schemas (Zod)

### 6.1 SpecSchema (`spec.ai.json`)

```ts
import { z } from 'zod';

export const SpecSchema = z.object({
  project: z.string(),
  personas: z.array(z.object({ name: z.string(), goals: z.array(z.string()) })),
  entities: z.array(z.object({
    name: z.string(),
    attributes: z.array(z.string()),
    relations: z.array(z.object({ to: z.string(), type: z.enum(['one-to-one','one-to-many','many-to-many']) })).optional()
  })),
  apis: z.array(z.object({
    method: z.enum(['GET','POST','PUT','DELETE']),
    route: z.string(),
    inputs: z.array(z.object({ name: z.string(), type: z.string() })).default([]),
    outputs: z.array(z.object({ name: z.string(), type: z.string() })).default([])
  })),
  constraints: z.array(z.object({ rule: z.string(), type: z.enum(['perf','security','compliance','ux']), value: z.string().optional() })),
  scenarios: z.array(z.object({ id: z.string(), given: z.string(), when: z.string(), then: z.string() })),
  tasks: z.array(z.object({ id: z.string(), title: z.string(), dependsOn: z.array(z.string()).default([]), deliverables: z.array(z.string()).default([]), acceptanceCriteria: z.array(z.string()).default([]) }))
});
export type Spec = z.infer<typeof SpecSchema>;
```

### 6.2 Task frontmatter (YAML keys)

```
id: T-001
title: Implement Cart Service
dependsOn: [T-000]
ownerAgent: code-ts
artifacts.expected:
  - src/services/cart.ts
  - tests/cart.spec.ts
acceptanceCriteria: [AC-012, AC-018]
runtime.language: ts
runtime.framework: express
runtime.db: sqlite
constraints:
  - response_time < 200ms
  - must_encrypt=true
```

### 6.3 ReviewReport

```ts
import { z } from 'zod';
export const ReviewIssue = z.object({ file: z.string(), line: z.number().optional(), rule: z.string(), severity: z.enum(['low','med','high']), message: z.string(), ac: z.string().optional(), fix_hint: z.string().optional() });
export const ReviewReport = z.object({ taskId: z.string(), pass: z.boolean(), issues: z.array(ReviewIssue), coverage: z.array(z.string()) });
```

---

## 7) Commands in Detail

### 7.1 `compile <prdPath>`

* Reads PRD (.md/.pdf/.docx); OCR if needed; sanitize.
* Runs sub-agents to emit `spec.ai.json` (via `responseSchema`) and renders `spec.ai.md` + `/tasks` from JSON (avoid drift).
* Emits `questions.md` for ambiguities; blocks tasks that reference unresolved questions.
* Writes trace events to `/reports/trace.jsonl`.

**Flags**: `--model`, `--project`, `--workspace`, `--dry-run`, `--verbose`.

### 7.2 `run --project <slug>`

* Builds DAG from `spec.ai.json.tasks`, topologically sorts; schedules tasks with `--parallel`.
* Per-task worker uses tools: `readFile`, `writeFile`, `openapiGen`, `lint`, `runTests`.
* **Voting (optional):**

  * `self-consistency:n`: generate n variants; score by reviewer tools; auto-pick best.
  * `pair-debate`: 2 workers critique; arbiter scores.
  * `committee:n`: n patches ranked by Critic Agent; choose highest.

**Flags**: `--parallel`, `--voting`, `--model`.

### 7.3 `review --project <slug> [--task T-ID] [--max-iter 3]`

* Runs Reviewer Agent with tools (`lint`, `typeCheck`, `runTests`, `openapiValidate`).
* If `--task` omitted: review all tasks not `APPROVED`.
* Loops Worker ↔ Reviewer until pass or `--max-iter`.

### 7.4 `aggregate --project <slug>`

* Aggregator applies patches in dependency order; spec precedence resolves conflicts.
* Generates `openapi.yaml` from `apis`, `README.generated.md`, and runs e2e smokes for top `scenarios`.

### 7.5 `all <prdPath>`

* Convenience: `compile` → `run` → `review` (auto) → `aggregate`.

### 7.6 `bundle --project <slug>`

* Zips `/build`, `/spec`, `/tasks`, `/reports` for handoff.

---

## 8) Tooling Interfaces (SDK `tool()`)

```ts
// fs tools
readFile(path: string) -> { path, content }
writeFile(path: string, content: string) -> { ok, path }

// tests
runTests(cwd: string='.') -> { passed: boolean, summary: string, coverage?: any }

// lint
lintCheck(cwd: string='.') -> { issues: Array<{file,line,rule,severity,message}> }

// openapi
openapiValidate(path: string) -> { ok: boolean, errors?: any[] }
```

> All tools are wrapped with Zod parameter schemas; agents can only interact via tools.

---

## 9) Voting System

**Config:** `--voting strategy[:n]` or in config file. Default **disabled**.
**Scoring signals:** tests pass (+3), AC coverage (+2), lint score (+1), smaller diff (+1). Ties → shortest diff.

---

## 10) Logging & Observability

* **Console:** human-readable progress with spinners for phases.
* **File:** `/reports/trace.jsonl` for every agent/tool call (ts, cost, latency, input\_size, output\_size, status).
* Optional: Langfuse/Helicone keys read from env; logs include trace IDs.

---

## 11) Security & Guardrails

* Restrict fs writes under project workspace only.
* Redact secrets in logs; block `.env` writes.
* Reviewer enforces security constraints from `spec.ai.json`.

---

## 12) Package Setup

`package.json` highlights:

```json
{
  "name": "ideaforge",
  "bin": { "ideaforge": "dist/cli.js" },
  "type": "module",
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js --format=esm",
    "test": "vitest"
  },
  "dependencies": {
    "ai": "^3",
    "@ai-sdk/openai": "^1",
    "zod": "^3",
    "commander": "^12",
    "yaml": "^2",
    "drizzle-orm": "^0.31",
    "better-sqlite3": "^9"
  },
  "devDependencies": {
    "esbuild": "^0.21",
    "tsx": "^4",
    "vitest": "^2",
    "eslint": "^9",
    "@types/node": "^20"
  }
}
```

---

## 13) Minimal Code Stubs (for Cursor)

### 13.1 `src/cli.ts`

```ts
#!/usr/bin/env node
import { Command } from 'commander';
import { compileCmd } from './commands/compile';
import { runCmd } from './commands/run';
import { reviewCmd } from './commands/review';
import { aggregateCmd } from './commands/aggregate';

const program = new Command();
program
  .name('ideaforge')
  .description('Idea → Tasks → Code → Review → Build (CLI)')
  .version('1.0.0');

program.command('compile')
  .argument('<prdPath>','Path to PRD file')
  .option('-p, --project <slug>')
  .option('-w, --workspace <dir>')
  .option('--model <id>','LLM model','gpt-4o-mini')
  .option('--dry-run')
  .option('--verbose')
  .action(compileCmd);

program.command('run')
  .requiredOption('-p, --project <slug>')
  .option('--parallel <n>','parallelism','2')
  .option('--voting <strategy>','e.g. committee:3')
  .option('--model <id>','LLM model','gpt-4o-mini')
  .action(runCmd);

program.command('review')
  .requiredOption('-p, --project <slug>')
  .option('--task <id>')
  .option('--max-iter <n>','3')
  .action(reviewCmd);

program.command('aggregate')
  .requiredOption('-p, --project <slug>')
  .action(aggregateCmd);

program.parseAsync();
```

### 13.2 `src/commands/compile.ts` (skeleton)

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SpecSchema } from '../schemas/spec';

export async function compileCmd(prdPath: string, opts: any){
  const project = opts.project ?? path.parse(prdPath).name.replace(/\W+/g,'-');
  const ws = opts.workspace ?? path.join('workspace', project);
  await fs.mkdir(path.join(ws,'spec'),{recursive:true});
  const prd = await fs.readFile(prdPath,'utf8');

  const result = await streamText({
    model: openai(opts.model ?? 'gpt-4o-mini'),
    system: 'You are the compiler front-end. Output STRICT JSON conforming to SpecSchema.',
    messages: [{ role:'user', content: prd }],
    responseSchema: SpecSchema
  });

  const spec = await result.toJSON();
  await fs.writeFile(path.join(ws,'spec','spec.ai.json'), JSON.stringify(spec,null,2));
  // render spec.ai.md and /tasks/*.task.md from JSON here...
  console.log(`✔ Compiled → ${path.join(ws,'spec','spec.ai.json')}`);
}
```

> Additional command skeletons mirror this style and call shared helpers in `/src/core` and tools in `/src/tools`.

---

## 14) Evaluation (Local)

* **Golden PRDs** in `/examples` with expected entities/APIs/ACs: run `ideaforge compile examples/*.md` and compute precision/recall.
* **Task eval:** AC satisfaction %, loops to pass, time/cost per task.
* **Assembly eval:** e2e smokes pass rate.

---

## 15) Definition of Done (CLI MVP)

* `ideaforge compile <prd>` outputs consistent `spec.ai.json`, `spec.ai.md`, `/tasks`.
* `ideaforge run -p <slug>` executes tasks with optional voting; artifacts saved.
* `ideaforge review -p <slug>` enforces ACs; loops ≤3 iterations.
* `ideaforge aggregate -p <slug>` produces `/build` with `openapi.yaml`, `README.generated.md`; e2e smokes run.
* `ideaforge all <prd>` completes the full pipeline in one command.
