# Execution Prompt: Continue EngineeringOS AI (Phase 2)

> Copy everything below this line into the next AI agent as its task prompt. It is self-contained:
> the agent should read the referenced files in this repo for full detail rather than ask the user
> to re-explain anything.

---

## Who you are and what this project is

You are a senior full-stack engineer continuing work on **EngineeringOS AI**, an enterprise
multi-tenant SaaS "Engineering Intelligence Platform" — it ingests engineering signals (GitHub, Jira,
Teams, calendars, desktop-agent activity, AI-tool usage) and uses AI agents to explain **how
engineering execution is progressing**, with cited evidence, not raw dashboards. It is explicitly
**not** an employee-surveillance product — read [`docs/00-vision-and-scope.md`](./docs/00-vision-and-scope.md)
§4 for the hard anti-goals before writing anything (no screenshots/keystrokes, no individual ranking,
consent-gated collection, team-over-individual framing).

**Start here, in order, before writing any code:**
1. [`docs/README.md`](./docs/README.md) — full documentation index.
2. [`docs/plans/00-roadmap-and-phasing.md`](./docs/plans/00-roadmap-and-phasing.md) — the phase plan this
   prompt continues.
3. [`docs/phase-1-implementation-guide.md`](./docs/phase-1-implementation-guide.md) — what's already
   built and verified working, plus a table of real build/tooling bugs already hit and fixed. **Read
   this before touching Docker/webpack/Nx config** — several non-obvious issues (see §5 there) will
   resurface identically if you don't know they were already solved.
4. [`docs/08-coding-standards.md`](./docs/08-coding-standards.md) and [`.claude/skills/`](./.claude/skills/README.md)
   — house style: small files, ports/adapters, no cross-boundary imports.
5. [`docs/10-shared-packages-and-boundaries.md`](./docs/10-shared-packages-and-boundaries.md) — the
   dependency DAG. **Never create a circular dependency** — run `npx nx lint <project>` and
   `npx madge --circular --extensions ts libs apps` before considering any task done.

## Current state (verified working, do not re-litigate)

- Nx monorepo: `apps/{api,worker,web}` + `libs/{shared,backend}/*`, npm workspaces
  (`"workspaces": ["apps/*", "libs/backend/*", "libs/shared/*"]` in root `package.json` — note the
  nested globs, this matters, see phase-1 doc §5).
- Auth is fully implemented and tested end-to-end: signup, login, JWT access tokens, **hashed,
  rotating refresh tokens with reuse-detection** (`libs/backend/auth`), argon2id password hashing.
  Verified live via `docker compose` + curl (see phase-1 doc §3). Unit tests pass
  (`npx nx test @eos/auth`).
- Database: `organizations`, `users`, `refresh_tokens` tables via Sequelize + Umzug migrations
  (`libs/backend/database`). **Only these three tables exist so far** — no departments/teams/projects
  yet (that's your first task below).
- Docker: `docker-compose.yml` (prod-shaped) + `docker-compose.override.yml` (local dev, remaps ports,
  relaxes the `internal` network for host access — see phase-1 doc §5 for why that override is needed).
- A throwaway browser test page (`apps/web/src/app/auth-test-page.tsx`) exists only to exercise auth
  manually — it is **not** the real UI. The real UI must follow
  [`docs/11-ui-ux-design-system.md`](./docs/11-ui-ux-design-system.md) (tokens, light/dark, Inter/Manrope,
  no default-blue/no-gold palette) once you build actual feature pages.
- ESLint module boundaries are enforced (`eslint.config.mjs`, `@nx/enforce-module-boundaries`). Nx Cloud
  is intentionally **disabled** (removed `nxCloudId` from `nx.json` — it caused a silent cache-artifact
  bug in Docker builds, see phase-1 doc §5). Do not re-enable it.

## Ground rules (non-negotiable)

- **Tenant isolation**: every tenant-owned table/query goes through `TenantScopedRepository`
  (`libs/backend/database/src/tenant-scoped.repository.ts`) — `organizationId` is always an explicit,
  required parameter, never an ambient/global scope. Write a cross-tenant-isolation test for every new
  repository (see the pattern in `tenant-scoped.repository.spec.ts`).
- **Explainability**: any new metric or AI-produced insight must store the evidence/events that
  produced it (`NFR-EXPLAIN`, docs/04 §6).
- **Consent-gating**: any new collector must check `consents` before ingesting a signal type
  (`NFR-CONSENT`, docs/06).
- **Contracts-first**: new API request/response shapes go in `@eos/contracts` as zod schemas first;
  controllers validate with `ZodValidationPipe` (`@eos/backend-core`).
- **Small files, ports/adapters**: follow `.claude/skills/nest-module/SKILL.md`,
  `.claude/skills/sequelize-migration/SKILL.md`, `.claude/skills/integration-adapter/SKILL.md` for the
  established patterns — don't reinvent structure per feature.
- **Tests are part of "done"**: unit (mocked repos), integration (real Postgres via Testcontainers per
  docs/09), and for user-facing flows, an e2e journey. No PR-equivalent task is complete without tests.
- **Secrets**: `.env` is gitignored and already has real local dev values generated (do not commit it,
  do not print its contents in any output you produce). Only `.env.example` (placeholders) is tracked.
  If a new integration needs a secret, add the placeholder to `.env.example` too.
- **Docker/webpack gotchas**: if you add a new class that `extends` something from an external
  package (like `sequelize-typescript`'s `Model` or any mixin-returning function), verify the compiled
  `apps/api/dist/main.js` actually contains a real `class X extends Y {}` and not a down-leveled
  `Y.call(this)` pattern — see phase-1 doc §5's `FixSwcTargetPlugin` entry. The fix
  (`tools/webpack/fix-swc-target.plugin.js`) is already wired into both `apps/api/webpack.config.js` and
  `apps/worker/webpack.config.js`; don't remove it.

## Your tasks, in priority order

Work through these in order — each depends on the previous. After each task: run
`npx nx run-many -t lint typecheck test build` for every touched project, and do a live
`docker compose` smoke test (rebuild the affected image(s), restart, hit the new endpoint with curl)
before moving to the next task. Update `docs/phase-1-implementation-guide.md`'s §5 table if you hit
and fix any new non-obvious bug — the next agent after you needs it too.

### 1. Multi-tenancy: org hierarchy (`docs/plans/02-multi-tenancy.md`)
Add `departments`, `teams`, `projects`, `memberships` tables/models/repositories per that plan.
`users` need a `memberships` relation (a user can belong to multiple teams with different roles).
Migration files go in `libs/backend/database/src/migrations/`, numbered after `0003-create-refresh-tokens.ts`.

### 2. RBAC (`docs/plans/03-rbac.md`)
Implement the permission catalog, default roles, and the three enforcement gates (tenant → permission →
resource/ownership) described there. Wire a `@RequirePermission(...)` guard. Add the mandatory
HR-cannot-see-individual-data test and the tenant-isolation negative tests the plan specifies.

### 3. Realtime event pipeline (`docs/plans/05-event-pipeline.md`)
Canonical `DomainEvent` type (extend `@eos/shared-enums`'s `EventType`/`EventSource` — these don't exist
yet, create them), idempotent ingest, transactional outbox → Redis Streams, worker-side projection
consumers. This is the backbone every later integration (GitHub, Jira, Teams) publishes into — get the
port/interface right before building on it.

### 4. GitHub integration (`docs/plans/06-github-integration.md`)
The highest-signal, lowest-friction source. GitHub App auth, webhook ingest (verify HMAC signatures),
normalize into canonical events via the `SourceAdapter` port, `pr_metrics`/`dora_metrics` projections,
bottleneck detection.

### 5. Daily timeline + basic dashboards (`docs/plans/12-daily-timeline.md`, `docs/plans/16-dashboards.md`)
Once real events exist (from GitHub), build the per-person timeline projection and the Employee +
Manager dashboard read APIs. **Now** build real frontend pages per `docs/11-ui-ux-design-system.md` —
replace the throwaway `auth-test-page.tsx` with real signup/login pages using `@eos/ui` design tokens,
light/dark theme, and the actual dashboard views.

## What NOT to do

- Don't add Kubernetes, don't re-enable Nx Cloud, don't switch off `internal: true` in the production
  `docker-compose.yml` (only the `.override.yml` relaxes it, for local dev — see phase-1 doc §5).
- Don't build features that rank/score individuals (doc 00 §4).
- Don't skip the tenant-isolation test on any new repository — it's the single most important test
  class in this codebase.
- Don't invent new shared-lib boundaries without checking `docs/10` first — put new enums/constants/
  types in the existing `@eos/shared-*` libs, not new ad-hoc ones.

---

_If anything in this prompt conflicts with a doc in `docs/`, the doc wins — this prompt is a summary,
not the source of truth._
