SpecSmith v1.1 Workflow (refined)
Phase 0 — Ingest

Input: PRD/brief (PDF/MD/DOC/Notion export).

Preprocess: OCR → sanitize → chunk → dedupe → extract metadata (title, stakeholders, deadlines).

Artifacts: /inputs/<project>/raw.md

Phase 1 — Semantic Compilation (Summary Agent)

Goal: Produce an AI-ready spec + task graph.

Outputs (generated together to ensure consistency):

spec.ai.md (human-readable)

spec.ai.json (single source of truth) following a strict schema (below)

/tasks/*.task.md (one per granular task with structured frontmatter)

Key tricks: Use responseSchema (Zod) to force spec.ai.json; render spec.ai.md from JSON so the MD can’t drift.

spec.ai.json (minimal schema you can extend)
{
  "project": "string",
  "personas": [{"name":"string","goals":["string"]}],
  "entities": [{"name":"string","attributes":["string"],"relations":[{"to":"string","type":"one-to-many"}]}],
  "apis": [{"method":"GET|POST|PUT|DELETE","route":"string","inputs":[{"name":"string","type":"string"}],"outputs":[{"name":"string","type":"string"}]}],
  "constraints": [{"rule":"string","type":"perf|security|compliance|ux","value":"string"}],
  "scenarios": [{"given":"string","when":"string","then":"string","id":"AC-001"}],
  "tasks": [{"id":"T-001","title":"string","dependsOn":["T-000"],"deliverables":["file paths or artifacts"],"acceptanceCriteria":["AC-001"]}]
}

Task file template (/tasks/T-001.task.md)
---
id: T-001
title: Implement Cart Service
dependsOn: [T-000]
ownerAgent: "code-js"
artifacts:
  expected:
    - "src/services/cart.ts"
    - "tests/cart.spec.ts"
acceptanceCriteria:
  - "AC-012"
  - "AC-018"
runtime:
  language: "ts"
  framework: "express"
  db: "postgres"
constraints:
  - "response_time < 200ms"
  - "must_encrypt=true"
---

## Description
Implement CRUD operations for the cart service with validation.

## Interface (canonical)
- Input: `{ userId: string, itemId: string, qty: number }`
- Output: `{ cartId: string, items: CartItem[] }`

## Notes
- Use Zod for DTO validation.


Store both the JSON and MD; downstream agents consume JSON, humans read MD.

Phase 2 — Parallel Task Execution (Worker Agents)

Orchestration: A task runner reads the DAG from spec.ai.json.tasks, topologically sorts, and assigns each ready task to an agent.

Agent contracts: Each worker gets:

Its .task.md + spec.ai.json

A toolbox (file read/write; unit test runner; code formatter; OpenAPI generator).

Concurrency: Cap parallelism; prioritize by dependsOn and task criticality.

Voting options (choose per task size):

Self-consistency: N=3 drafts → choose via scoring function.

Pairwise debate: Two agents critique each other → arbiter selects.

Committee: N workers produce patches; a small “Critic Agent” ranks by: passes tests, satisfies acceptanceCriteria, code quality (lint score), diff size.

Keep voting off by default; enable for “complex” tasks (heuristic: LOC>150 or cross-entity API).

Phase 3 — Review Loop (Reviewer Agent)

Checklist-driven review (pre-compiled from constraints + acceptanceCriteria):

Lint/format pass

Unit tests for referenced AC IDs

Security rules (no secrets, PII handling)

Performance proxies (no N+1, pagination on list endpoints)

Protocol:

If fail → reviewer attaches machine-readable review JSON with precise items {file, line, rule, message, fix_hint}.

Worker applies patch → loop until pass or max N iterations (e.g., 3).

Tools: runTests, lintCheck, typeCheck, openapiValidate exposed as tool() calls in the AI SDK route.

Phase 4 — Aggregation & Assembly (Aggregator Agent)

Strategy: Map-reduce assembly.

Map: Convert each task’s deliverables into a unified patch.

Reduce: Apply patches in dependency order; resolve conflicts via “spec precedence” (the API in spec.ai.json is canonical).

Outputs:

/build/ fully assembled repo

openapi.yaml synthesized from apis

README.generated.md referencing personas, AC coverage, and how to run

trace.jsonl (provenance of who/what produced each artifact)

Phase 5 — Final Validation & Packaging

End-to-end test script (happy path for each top-level scenario).

Coverage report linked back to AC IDs.

Export a spec bundle (zip): spec.ai.json, spec.ai.md, /tasks, /build, openapi.yaml, reports.

Orchestration Mechanics
State machine (per task)

PENDING → RUNNING → NEEDS_CHANGES → RUNNING (retry) → APPROVED → MERGED → DONE
Persist in Postgres with these tables:

projects(id, name, status, created_at)

specs(project_id, json, version, created_at)

tasks(id, project_id, spec_path, status, attempt, owner, score)

reviews(task_id, payload_json, pass, created_at)

artifacts(task_id, path, sha, kind)

traces(project_id, event, payload_json, ts)

Directory layout (generated)
/spec/
  spec.ai.json
  spec.ai.md
/tasks/
  T-001.task.md
  T-002.task.md
/build/
  src/...           # assembled code
  tests/...
  openapi.yaml
/reports/
  coverage/
  e2e/
  review/

Where the Vercel AI SDK fits perfectly

Edge streaming: Show live “compilation” progress (Summary Agent emitting sections as they firm up) via streamText/streamUI.

Tool calling: Wrap standardized ops (readFile, writeFile, runTests) with tool() and strict Zod schemas so agents behave.

Structured outputs: Use responseSchema for spec.ai.json and Reviewer reports (prevents drift).

Multi-turn loops: Keep the Reviewer↔Worker loop inside your /api/ai/task route with an iteration cap and trace logs.

Guardrails & Quality

Single source of truth: Only mutate code that aligns with spec.ai.json; if a task wants to change the contract, it must propose a Spec Delta first (small RFC that triggers recompile of affected tasks).

Ambiguity tracker: During Phase 1, generate a questions.md list; block tasks touching ambiguous parts until resolved by a quick human-in-the-loop or a Clarifier Agent.

Cost control: Prefer self-consistency (N=3) only for “large” tasks; use cheap model for lint/explain, stronger model for code synthesis.

Timeouts & retries: Backoff and snapshot after each phase to resume safely.

Minimal agent roster (v1)

Summary Agent (compiler front-end)

Task Worker (Code Agent) — language-specific variants: code-ts, code-py

Reviewer Agent — deterministic, checklist-driven, heavy on tools

Critic Agent (optional, for voting)

Aggregator Agent — deterministic merge + validation

Clarifier Agent — generates clarification questions (only if needed)

Success metrics (to show on résumé/README)

Ambiguity reduction: % of PRD statements mapped to concrete schema/AC.

Spec coverage: # of ACs with tests generated & passing.

Iteration efficiency: avg review loops per task (<2.0 target).

Assembly integrity: % tasks merged without conflicts.

Latency/cost: median times & token spend per phase.

Next steps I can draft for you

The Zod schemas for spec.ai.json, task files, reviewer reports.

A Next.js API route (/api/ai/specsmith) that:

Accepts an upload

Streams the compile (Phase 1)

Emits /tasks/*.task.md files

A task runner route (/api/ai/run-task) with tools: readFile, writeFile, runTests, lintCheck.

A small demo project (e.g., “Checkout Flow”) to exercise the pipeline end-to-end.

If you want, I’ll generate the initial schemas + the SpecSmith compile endpoint now so you can start building immediately.

You said:
perfect, this sounds like a good plan. I especially like the idea of voting being an option that can be turned on by the user if they wish. I now plan to go over to Cursor and start developing this product. Generate a spec file that can be given to Cursor that includes the requirements, architecture, and tasks needed to complete this product.
ChatGPT said:
Thought for 12s

Here’s a single SPEC.md you can drop into Cursor. It defines requirements, architecture, schemas, routes, and an actionable task plan to build SpecSmith end-to-end.

# SpecSmith — Semantic Compiler for PRDs
**Version:** 1.0  
**Owner:** Tyler Pina  
**Goal:** Translate human PRDs into AI-readable specifications and a DAG of granular tasks, then orchestrate parallel coding agents with optional voting, a reviewer loop, and final aggregation.

---

## 1) Product Requirements

### 1.1 Problem
- PRDs are ambiguous and verbose; coding agents struggle to act on them.
- Teams need a **single source of truth** the agents can parse, validate, and execute against.

### 1.2 Objectives
- Upload PRD → produce **AI-ready spec** + **task graph**.
- Generate one **architecture/spec doc** and **one task md** per task.
- Execute tasks in parallel with optional **voting** (off by default).
- Run a **reviewer loop** until acceptance criteria pass or max iterations.
- Aggregate all task outputs into a unified repo and validate end-to-end.

### 1.3 Non-Goals
- Rich WYSIWYG editing of PRDs (MVP uses file upload + simple preview).
- Multi-repo, polyservice deployment (MVP: single repo assembly).
- Human approvals UI (optional later; MVP accepts auto-approve or simple confirm modal).

### 1.4 Success Metrics
- **Ambiguity reduction:** ≥80% PRD statements mapped to schema/ACs.
- **Spec coverage:** ≥90% acceptance criteria backed by tests.
- **Iteration efficiency:** ≤2.0 review loops per task on median.
- **Assembly integrity:** ≥95% tasks merge cleanly on first attempt.

---

## 2) User Stories

- **Upload:** As a PM, I upload a PRD (.md/.pdf/.docx) and see compile progress streaming.
- **Inspect:** As a dev, I view the generated `spec.ai.md` + `spec.ai.json` + `/tasks/*.task.md`.
- **Run:** As an engineer, I kick off task execution and optionally enable **voting**.
- **Review:** As a reviewer, I see failures mapped to AC IDs and diffs to fix.
- **Assemble:** As a lead, I download `/build` (assembled code), `openapi.yaml`, and reports.

---

## 3) System Overview

```mermaid
flowchart TD
  U[User Uploads PRD] --> ING[Ingest & Preprocess]
  ING --> COMP[Semantic Compile (Summary/Entity/API/Constraint/Scenario/Hints Agents)]
  COMP --> ARTifacts[spec.ai.json + spec.ai.md + /tasks/*.task.md]
  ARTifacts --> RUN[Task Runner]
  RUN -->|parallel| WORK[Worker Agents]
  WORK -->|review loop| REV[Reviewer Agent]
  REV --> RUN
  WORK --> AGG[Aggregator Agent]
  AGG --> BUILD[/build + openapi.yaml + reports/]
  BUILD --> E2E[Final Validation]

4) Tech Stack

Frontend: Next.js (App Router), React Server Components, Tailwind (simple), ai SDK UI hooks (useChat, streamUI).

LLM Orchestration: Vercel AI SDK (ai) with tool calling and responseSchema.

Models: OpenAI (swappable), gpt-4o-mini for most; stronger model for complex code synth.

Data: Postgres (Drizzle ORM). Optional pgvector later for PRD similarity.

Queue/Rate-limit: Upstash Redis (optional; MVP can run serially).

CI/Test: Vitest for unit; Playwright for simple E2E smoke.

Observability: Langfuse or Helicone (traces, latency, cost).

Deployment: Vercel — Edge for chat/stream; Node functions for long ops (tests/lint).

5) Directory Layout
/app
  /upload
  /projects/[id]
  /api/ai/specsmith/compile/route.ts
  /api/ai/specsmith/run-task/route.ts
  /api/ai/specsmith/review/route.ts
  /api/ai/specsmith/aggregate/route.ts
/lib
  /agents/summary.ts
  /agents/entityApi.ts
  /agents/constraints.ts
  /agents/scenarios.ts
  /agents/hints.ts
  /agents/reviewer.ts
  /agents/worker.ts
  /agents/aggregator.ts
  /tools/fs.ts
  /tools/tests.ts
  /tools/lint.ts
  /tools/openapi.ts
  /db/schema.ts
  /taskRunner.ts
/spec                 # generated
/tasks                # generated
/build                # generated
/reports              # generated
/scripts              # embed/seed/eval

6) Data Model (Drizzle)
// /lib/db/schema.ts
import { pgTable, text, varchar, jsonb, boolean, integer, timestamp, serial } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  status: varchar('status', { length: 40 }).$type<'NEW'|'COMPILED'|'RUNNING'|'ASSEMBLED'|'DONE'>().default('NEW'),
  createdAt: timestamp('created_at').defaultNow()
});

export const specs = pgTable('specs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  version: integer('version').default(1),
  json: jsonb('json').notNull(),          // spec.ai.json
  createdAt: timestamp('created_at').defaultNow()
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id),
  taskId: varchar('task_id', { length: 32 }).notNull(),  // e.g., "T-001"
  status: varchar('status', { length: 32 }).$type<'PENDING'|'RUNNING'|'NEEDS_CHANGES'|'APPROVED'|'MERGED'|'DONE'>().default('PENDING'),
  attempt: integer('attempt').default(0),
  score: integer('score'),                 // optional voting score
  path: varchar('path', { length: 256 }),  // /tasks/T-001.task.md
  createdAt: timestamp('created_at').defaultNow()
});

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id),
  payload: jsonb('payload').notNull(),     // reviewer report JSON
  pass: boolean('pass').default(false),
  createdAt: timestamp('created_at').defaultNow()
});

export const artifacts = pgTable('artifacts', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id),
  path: varchar('path', { length: 256 }).notNull(),
  sha: varchar('sha', { length: 64 }),
  kind: varchar('kind', { length: 32 })    // 'code'|'test'|'doc'|'patch'
});

export const traces = pgTable('traces', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id),
  event: varchar('event', { length: 64 }).notNull(),
  payload: jsonb('payload'),
  ts: timestamp('ts').defaultNow()
});

7) Contracts & File Formats
7.1 spec.ai.json (Zod schema)
// /lib/agents/specSchema.ts
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
  constraints: z.array(z.object({
    rule: z.string(),
    type: z.enum(['perf','security','compliance','ux']),
    value: z.string().optional()
  })),
  scenarios: z.array(z.object({
    id: z.string(), given: z.string(), when: z.string(), then: z.string()
  })),
  tasks: z.array(z.object({
    id: z.string(), title: z.string(),
    dependsOn: z.array(z.string()).default([]),
    deliverables: z.array(z.string()).default([]),
    acceptanceCriteria: z.array(z.string()).default([])
  }))
});

export type Spec = z.infer<typeof SpecSchema>;

7.2 Task file (/tasks/T-001.task.md)
---
id: T-001
title: Implement Cart Service
dependsOn: [T-000]
ownerAgent: "code-ts"
artifacts.expected:
  - "src/services/cart.ts"
  - "tests/cart.spec.ts"
acceptanceCriteria: ["AC-012","AC-018"]
runtime.language: "ts"
runtime.framework: "express"
runtime.db: "postgres"
constraints: ["response_time < 200ms","must_encrypt=true"]
---

## Description
Implement CRUD operations for the cart service with validation.

## Interface
Input: { userId: string, itemId: string, qty: number }  
Output: { cartId: string, items: CartItem[] }

7.3 Reviewer report JSON (Zod)
// /lib/agents/reviewerSchema.ts
import { z } from 'zod';

export const ReviewIssue = z.object({
  file: z.string(), line: z.number().optional(),
  rule: z.string(), severity: z.enum(['low','med','high']),
  message: z.string(), ac: z.string().optional(),
  fix_hint: z.string().optional()
});

export const ReviewReport = z.object({
  taskId: z.string(),
  pass: z.boolean(),
  issues: z.array(ReviewIssue),
  coverage: z.array(z.string()) // AC IDs satisfied
});

8) API Surface (Next.js App Router)

POST /api/ai/specsmith/compile

Body: { projectId, fileRef | text }

Action: Ingest → run Summary/Entity/API/Constraint/Scenario/Hints Agents → emit spec.ai.json, spec.ai.md, /tasks/*.task.md

Response: streaming SSE of sections + final artifact list.

POST /api/ai/specsmith/run-task

Body: { projectId, taskId, voting?: { enabled: boolean, n?: number, strategy?: 'self-consistency'|'pair-debate'|'committee' } }

Action: Execute worker(s) with tools; if voting enabled, run strategy; persist artifacts.

Response: stream logs, final status.

POST /api/ai/specsmith/review

Body: { projectId, taskId }

Action: Reviewer Agent runs tools (lintCheck, typeCheck, runTests, openapiValidate), produces ReviewReport. Loop until pass or maxN.

Response: ReviewReport, updated task status.

POST /api/ai/specsmith/aggregate

Body: { projectId }

Action: Aggregator merges patches by dependency order, resolves conflicts by spec precedence, generates openapi.yaml, README.generated.md.

Response: /build manifest + e2e validation results.

9) Agent Implementations (AI SDK)

All agents use streamText/generateText with responseSchema (where applicable) and tools with strict Zod params.

9.1 Tools (examples)
// /lib/tools/fs.ts
import { tool } from 'ai';
import { z } from 'zod';
import { promises as fs } from 'fs';

export const readFileTool = tool({
  description: 'Read a text file by path',
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => ({ path, content: await fs.readFile(path, 'utf8') })
});

export const writeFileTool = tool({
  description: 'Write text content to a file path (overwrites)',
  parameters: z.object({ path: z.string(), content: z.string() }),
  execute: async ({ path, content }) => {
    await fs.mkdir(path.split('/').slice(0,-1).join('/'), { recursive: true });
    await fs.writeFile(path, content, 'utf8');
    return { ok: true, path };
  }
});

// /lib/tools/tests.ts
export const runTestsTool = tool({
  description: 'Run unit tests and return summary json',
  parameters: z.object({ cwd: z.string().default('.') }),
  execute: async ({ cwd }) => {
    // MVP stub: later spawn vitest with JSON reporter
    return { passed: true, summary: '0 failing, 10 passing' };
  }
});

// /lib/tools/lint.ts
export const lintTool = tool({
  description: 'Run eslint and return issues',
  parameters: z.object({ cwd: z.string().default('.') }),
  execute: async ({ cwd }) => ({ issues: [] })
});

9.2 Summary/Compile endpoint (sketch)

Reads PRD text → calls sub-agents (summary, entity/api, constraints, scenarios, hints) → assembles spec.ai.json via responseSchema → renders spec.ai.md + /tasks/*.task.md from the JSON so they don’t drift.

9.3 Reviewer Agent

Deterministic, tool-heavy; produces ReviewReport (schema above). If pass=false, route moves task to NEEDS_CHANGES and re-queues worker.

9.4 Worker Agent

Consumes its T-XXX.task.md + spec.ai.json.

Allowed tools: readFile, writeFile, openapiTool (optional), lint, runTests.

9.5 Aggregator Agent

Reads all task artifacts; applies patches in DAG order; validates exports (OpenAPI, README), then triggers e2e smoke.

10) Voting System (optional)

Config:

type VotingConfig = {
  enabled: boolean;
  n?: number;                 // default 3
  strategy?: 'self-consistency'|'pair-debate'|'committee';
};


Scoring signals:

Passes reviewer tools (tests/lint/typecheck) → +3

Satisfies AC IDs referenced in task → +2

Smaller diff for same AC coverage → +1

Style/clarity (lint score proxy) → +1

Selection: Max score wins; ties → shortest diff.

11) Phase Breakdown & Tasks
Phase A — Compile (Spec)

[A1] Implement /api/ai/specsmith/compile with streaming

[A2] Build Summary/Entity&API/Constraints/Scenarios/Hints agents

[A3] Implement SpecSchema + renderer for spec.ai.md

[A4] Generate /tasks/*.task.md from spec.ai.json

[A5] Persist projects/specs/tasks in Postgres

Acceptance: Upload demo PRD → see spec.ai.json, spec.ai.md, ≥5 tasks generated with AC IDs.

Phase B — Task Runner

[B1] Implement /lib/taskRunner.ts (topological sort by dependsOn)

[B2] Implement /api/ai/specsmith/run-task (single task) with tools

[B3] Add optional voting strategies

[B4] Store artifacts + traces

Acceptance: Run 2+ independent tasks in parallel; artifacts written; traces recorded.

Phase C — Review Loop

[C1] Implement /api/ai/specsmith/review route (Reviewer Agent + tools)

[C2] Loop until pass or max 3 iterations

[C3] Persist reviews and update task status

Acceptance: Reviewer blocks failing tasks; passing tasks flip to APPROVED.

Phase D — Aggregation & Validation

[D1] Implement /api/ai/specsmith/aggregate (merge patches by DAG)

[D2] Generate openapi.yaml from spec.ai.json.apis

[D3] Create README.generated.md (personas, AC coverage, run instructions)

[D4] Add e2e smoke for top scenarios

Acceptance: /build folder compiles; e2e smoke passes; coverage links AC IDs.

Phase E — UI & DX

[E1] Upload page with live compile stream

[E2] Project page showing spec, tasks, run status, toggle for voting

[E3] Download bundle: /build, spec.ai.*, /tasks, reports/

Acceptance: End-to-end demo: upload PRD → compile → run tasks → review → aggregate → download.

12) Security & Guardrails

Only write files under project sandbox; never read system files.

Redact secrets; block .env writes by agents.

Reviewer enforces security constraints from spec (e.g., encryption flags).

13) Observability

Log every agent/tool call to traces with cost/latency.

Add Langfuse/Helicone instrumentation IDs per route.

14) Evaluation (MVP)

Golden PRDs (3–5) with expected entities/APIs/ACs → measure precision/recall on compile.

Task eval: % ACs satisfied per task; loops to pass; time/cost per task.

Assembly eval: Pass rate for e2e scenarios.

15) Prompts (Sketches)

System (Summary Agent):
“You are the SpecSmith compiler front-end. Translate a human PRD into a canonical spec following SpecSchema. Prefer explicit entities, APIs, constraints, and Given/When/Then scenarios. Assign unique IDs (AC-###, T-###).”

System (Reviewer):
“You are the SpecSmith Reviewer. Enforce acceptance criteria, constraints, and static checks. Output a ReviewReport JSON only.”

System (Worker):
“You are a coding agent constrained by spec.ai.json and your T-###.task.md. Produce only the files listed in artifacts.expected. Do not change API contracts without proposing a Spec Delta.”

16) Definition of Done (DoD)

Upload → compile produces consistent spec.ai.json & spec.ai.md.

/tasks generated with valid frontmatter and linked AC IDs.

Tasks execute with tools; optional voting works.

Reviewer loop prevents merges until pass.

Aggregator assembles /build + openapi.yaml + README.generated.md.

E2E smoke passes for at least one demo PRD.