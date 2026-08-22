# 08 — Coding Standards

The team's clean-code + conventions bible for **EngineeringOS AI**. It applies to every app and lib in
the Nx monorepo ([03 — System Architecture](./03-system-architecture.md)). Read the boundary rules in
[10 — Shared Packages & Boundaries](./10-shared-packages-and-boundaries.md) alongside this — they are
the structural half of what's below.

RFC-2119 keywords (**MUST**, **SHOULD**, **MAY**) are used deliberately. **MUST** rules are enforced by
CI (ESLint / TypeScript / Nx). **SHOULD** rules are strong defaults a reviewer may waive with a reason.

---

## 1. Philosophy

We optimize for the **reader**, not the writer. Code is read far more often than it is written, and this
codebase is meant to be extended by contract for years.

1. **Readability first.** Clever beats readable only in a benchmark. Prefer the boring, obvious solution.
2. **Small, focused units.** One file, one job. One function, one reason to exist. Don't write too much
   code in a file — a long file is almost always several small ones hiding.
3. **Single Responsibility.** A module, class, or function that needs "and" to describe it is two things.
4. **Composition over inheritance.** Compose small pieces (functions, providers, hooks). Deep class
   hierarchies are banned outside the sanctioned base classes (`TenantModel`, Nest base classes).
5. **Explicit over implicit.** Name the thing. Pass the dependency. Return the type. No hidden globals,
   no magic strings, no "you just have to know."
6. **Depend on interfaces, not implementations.** Ports keep modules decoupled and the DAG acyclic
   (doc 03 §7). This is what lets us extract a module into its own service later with zero caller changes.

> If a rule below ever fights readability, readability wins — and you open a PR to fix the rule.

---

## 2. Size & complexity guidelines

These are **SHOULD** targets, not dogma. They exist to trigger a *pause and think*, not to fail a build
on line 251. When you cross one, the right move is usually to **split**, not to suppress the linter.

| Metric | Target | Hard ceiling (lint warns) | When exceeded |
|--------|--------|---------------------------|---------------|
| File length | ≤ 200 lines | 250 | Split by responsibility (see below) |
| Function / method length | ≤ 40 lines | 60 | Extract helpers; name the extracted steps |
| Function parameters | ≤ 3 | 4 | Use an **options object** |
| Cyclomatic complexity | ≤ 8 | 12 | Extract branches; use lookup maps / polymorphism |
| Nesting depth | ≤ 3 | 4 | Early returns / guard clauses |
| Primary exports per file | **1** | — | One class/component/hook per file; co-locate only tiny helpers |

**One primary export per file.** A file named `pr-metrics.service.ts` exports `PrMetricsService` and
nothing else public. Types used only by it live in `pr-metrics.types.ts`; pure helpers in
`pr-metrics.util.ts`. This makes imports predictable and files greppable.

**How to split a growing file** — in priority order:

1. **By responsibility.** A service doing fetch + transform + persist is three collaborators.
2. **By type.** Move interfaces/DTOs/enums into a sibling `*.types.ts`.
3. **By pure logic.** Extract branch-free calculations into a `*.util.ts` you can unit-test alone.
4. **By sub-feature.** A React feature folder that sprawls becomes nested feature folders.

```ts
// BAD — 4 positional params, order is a guessing game
createReport(orgId, from, to, includeDrafts, format) { /* ... */ }

// GOOD — options object; call sites self-document
createReport(opts: {
  orgId: string;
  range: DateRange;
  includeDrafts?: boolean;
  format?: ReportFormat;
}) { /* ... */ }
```

---

## 3. Naming

Names carry the design. Spend the extra second.

| Kind | Convention | Example |
|------|------------|---------|
| Files & folders | `kebab-case` | `pr-metrics.service.ts`, `reviewer-load/` |
| Classes, types, interfaces, enums | `PascalCase` | `PrMetricsService`, `DomainEvent`, `EventType` |
| Variables, functions, methods | `camelCase` | `reviewWaitSeconds`, `computeDora()` |
| Constants (module-level, fixed) | `SCREAMING_SNAKE_CASE` | `MAX_PAGE_SIZE`, `DEFAULT_TTL_MS` |
| Enum members | `PascalCase` keys | `EventSource.GitHub` |
| React components & hooks | `PascalCase` / `useX` | `TimelinePanel`, `usePrMetrics` |
| Booleans | `is` / `has` / `should` / `can` prefix | `isStale`, `hasConsent`, `shouldRetry` |
| Interfaces | **No `I` prefix** — name the role | `EventBus`, not `IEventBus` |
| Ports vs adapters | Port = role, adapter = tech | `SourceAdapter` port, `GithubSourceAdapter` impl |

- **No abbreviations** except a tiny agreed set: `id`, `db`, `url`, `dto`, `org`, `repo`. Not `usr`,
  `cfg`, `mgr`, `svc`. Say what you mean.
- **No suffix noise** (`DataInfo`, `Manager`, `Helper`, `Util` classes). A `Helper` class is a bag of
  functions wanting to be a module of named functions.
- File **suffixes** signal role and MUST match the artifact: `*.controller.ts`, `*.service.ts`,
  `*.repository.ts`, `*.module.ts`, `*.model.ts`, `*.dto.ts`, `*.port.ts`, `*.adapter.ts`, `*.guard.ts`,
  `*.spec.ts`. React: `*.tsx` components, `*.hook.ts` or `use-*.ts` hooks, `*.store.ts` Zustand stores.

### Folder structure — NestJS module

```
libs/backend/github/src/
├─ github.module.ts            # wiring only: providers, imports, exports
├─ controllers/                # thin HTTP/WS entry points
│  └─ pr.controller.ts
├─ services/                   # orchestration / business logic
│  └─ pr-metrics.service.ts
├─ ports/                      # interfaces this module depends on / exposes
│  └─ source-adapter.port.ts
├─ adapters/                   # concrete impls of ports
│  └─ github-source.adapter.ts
├─ dto/                        # request/response shapes + validation
│  └─ list-prs.dto.ts
└─ index.ts                    # public surface (barrel — see §9)
```

### Folder structure — React feature

```
libs/frontend/feature-timeline/src/
├─ timeline.routes.tsx         # route wiring
├─ components/                 # presentational (dumb) components
│  └─ timeline-entry.tsx
├─ containers/                 # data-bound (smart) components
│  └─ timeline-panel.tsx
├─ hooks/                      # feature-local hooks (not data fetching — that's @eos/frontend-data)
│  └─ use-timeline-filters.ts
├─ timeline.store.ts           # Zustand, only if genuinely global UI state
└─ index.ts
```

---

## 4. TypeScript rules

- **`strict` is on** repo-wide and MUST NOT be relaxed per-file. No `// @ts-nocheck`. A `// @ts-expect-error`
  MUST carry a one-line justification and a ticket.
- **No `any`.** Use `unknown` at boundaries and **narrow** before use. `any` disables the one tool that
  makes a TS-everywhere monorepo worth it.

```ts
// BAD
function parse(input: any) { return input.payload.type; }

// GOOD
function parse(input: unknown): EventType {
  const parsed = domainEventSchema.parse(input); // zod narrows unknown → typed
  return parsed.type;
}
```

- **Types come from shared libs.** Domain types from `@eos/shared-types`, contracts from `@eos/contracts`.
  Don't re-declare `DomainEvent` locally — import the one source of truth (doc 04 §5).
- **No magic strings/numbers.** Enumerable values live in `@eos/shared-enums`; tunables in
  `@eos/shared-constants`. `'github.pr.opened'` in code is a bug waiting to drift.
- **Discriminated unions** for anything with variants — especially events, keyed on `type`.
- **Exhaustive `switch`** with a `never` check so adding an enum member fails compilation until handled.

```ts
function iconFor(source: EventSource): string {
  switch (source) {
    case EventSource.GitHub:   return 'git';
    case EventSource.Jira:     return 'ticket';
    case EventSource.Agent:    return 'desktop';
    default:
      return assertNever(source); // compile error if a source is unhandled
  }
}
const assertNever = (x: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
};
```

- **zod at every boundary** — HTTP bodies, WS messages, queue payloads, env config, third-party API
  responses. Inside the boundary, work with the parsed static type. Never trust `JSON.parse` output.
- **`readonly` and `as const`** for data that shouldn't mutate. Prefer immutable updates.
- **No non-null `!`** except in Sequelize decorators (a framework requirement) and tests. Narrow instead.
- **Return types on all exported functions.** Inference is fine internally; the public surface is a
  contract and MUST be explicit.

---

## 5. NestJS conventions

Keep every layer **thin** and single-purpose. The request flows one way; each layer adds exactly one kind
of value.

| Layer | Owns | MUST NOT |
|-------|------|----------|
| **Controller** | HTTP/WS shape: route, validate (DTO), map to service call, map result to response | Contain business logic, touch the DB, know about Sequelize |
| **Service** | Orchestration: business rules, transactions, calling repos/ports | Parse HTTP, build SQL, format responses |
| **Repository** | Persistence: Sequelize queries with mandatory tenant scope (doc 04 §9) | Hold business logic, be imported by another module |
| **Module** | Wiring: providers, imports, exports, provider tokens | Contain logic of any kind |

```ts
// BAD — controller doing business logic + persistence
@Post()
async create(@Body() body: any) {
  const org = await this.orgModel.findByPk(body.orgId);   // ❌ DB in controller
  if (org.plan === 'free' && body.seats > 5) throw ...;   // ❌ rule in controller
}

// GOOD — controller validates & delegates; service decides
@Post()
create(@Body() dto: CreateTeamDto): Promise<TeamResponse> {
  return this.teams.create(dto); // service owns the rule; repo owns the write
}
```

- **DI via interfaces (ports), not concrete classes.** Feature modules inject `EventBus`,
  `SourceAdapter`, `TeamRepository` — never the concrete `RedisStreamsEventBus`. Only the **app**
  (composition root) binds token → implementation. This keeps the DAG acyclic and modules extractable.

```ts
// port (in the module or @eos/backend-core)
export const EVENT_BUS = Symbol('EVENT_BUS');
export interface EventBus { publish(e: DomainEvent): Promise<void>; }

// app composition root binds the token to a concrete adapter
providers: [{ provide: EVENT_BUS, useClass: RedisStreamsEventBus }]

// consumer depends on the interface only
constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}
```

- **Provider tokens** are `Symbol`s exported next to the port. No stringly-typed tokens.
- **DTOs** validate at the edge with zod (via a `ZodValidationPipe`) or `class-validator`; pick one per
  app and be consistent. A DTO is a boundary contract, not a domain type — map into domain types inside
  the service.
- **No circular deps between modules.** Siblings meet through ports/contracts, never direct imports
  (doc 03 §7). `nx lint` fails the build on a cycle.

---

## 6. React conventions

- **Function components + hooks only.** No class components.
- **Container / presentational split.** Presentational components take props and render — no fetching, no
  stores, trivially testable. Containers wire data to them.
- **Data fetching lives in `@eos/frontend-data`** as TanStack Query hooks. Components call `usePrMetrics()`;
  they never call `fetch`/axios or know a URL.

```tsx
// BAD — component fetches + holds business logic
function Panel({ orgId }) {
  const [data, setData] = useState();
  useEffect(() => { fetch(`/api/prs?org=${orgId}`).then(r => r.json()).then(setData); }, [orgId]);
  const stale = data?.filter(p => Date.now() - p.updatedAt > 2 * 864e5); // ❌ rule in component
}

// GOOD — hook fetches, selector in data layer, component renders
function PrPanel() {
  const { data: stalePrs, isLoading } = useStalePrs(); // @eos/frontend-data owns fetch + "stale" rule
  if (isLoading) return <Spinner />;
  return <PrList items={stalePrs} />;
}
```

- **No business logic in components.** Derivations belong in the data layer, a hook, or a pure util in
  `@eos/shared-utils`. Components decide *layout*, not *truth*.
- **Design-system components from `@eos/ui`.** No raw styled `<button>` when `<Button>` exists; no ad-hoc
  Tailwind for something the design system already solves.
- **State placement:** local UI state → `useState`; server state → **TanStack Query** (it *is* your
  cache, don't mirror it into a store); genuinely global UI state (theme, command palette, current org
  switcher) → **Zustand**, one small store per concern. Don't reach for Zustand as a `useState` upgrade.
- **Colocation.** A component's styles, tests, and local hooks live beside it. Delete-ability is a
  design goal: removing a feature should be `rm -rf feature-x/`.

---

## 7. Error handling

- **Never swallow errors.** An empty `catch {}` is a **MUST-fix** in review. Handle, wrap-and-rethrow, or
  log-and-rethrow — never silently drop.
- **Typed errors.** Extend a shared `AppError` with a stable `code` and `httpStatus`. No throwing bare
  strings or plain `Error` for domain failures.
- **`Result` vs `throw`:**
  - **Throw** for *exceptional* / programmer / infra failures (DB down, invariant broken). Nest's
    exception filter maps them to the canonical error shape (doc 05 §6).
  - **Return a `Result<T, E>`** for *expected* domain outcomes that the caller must branch on
    (validation failed, not-found in a flow where absence is normal). Don't use exceptions for control flow.
- **Never leak internals to clients.** No stack traces, SQL, or provider payloads in responses. The
  filter returns `{ code, message, correlationId }`; details go to logs + Sentry, keyed by
  `correlationId` (doc 03 §9).

```ts
// BAD
try { await sync(); } catch (e) { /* nothing */ }        // ❌ silent
catch (e) { throw new Error(e.message); }                  // ❌ loses type + stack

// GOOD
try {
  await sync();
} catch (cause) {
  throw new IntegrationSyncError('github', { cause }); // typed, wraps cause, keeps stack
}
```

---

## 8. Comments & documentation

- Comments explain **why**, not **what**. The code says what. If a comment restates the line, delete one.
- **JSDoc on the public API of every lib** (anything exported from `index.ts`) — purpose, params, and
  any non-obvious constraint or unit. Internal functions get a comment only when intent isn't obvious.
- **TODO format:** `// TODO(EOS-1234): reason` — owner-traceable via ticket. A bare `// TODO` is noise.
  Use `// FIXME(EOS-1234):` for known-broken. CI may flag TODOs without a ticket.

```ts
// BAD — narrates the obvious
i += 1; // increment i

// GOOD — explains a non-obvious decision
// Redis Streams caps XADD at ~4KB efficiently; chunk large payloads to keep publish latency < 5ms.
const chunks = chunkPayload(event.payload, MAX_STREAM_CHUNK_BYTES);
```

---

## 9. Imports & module boundaries

- **Absolute `@eos/*` imports** for anything cross-lib; **relative** imports only *within* the same lib.
  No `../../../` reaching across a lib boundary — that's a boundary violation, not a path.
- **No cross-boundary imports.** `shared/*` never imports `backend/*`/`frontend/*`; frontend and backend
  meet only through `@eos/contracts`. Full rules + the ESLint config:
  [10 — Shared Packages & Boundaries](./10-shared-packages-and-boundaries.md). `@nx/enforce-module-boundaries`
  fails CI on any violation.
- **Import ordering** (Prettier + `eslint-plugin-import` autofix): (1) Node builtins, (2) external
  packages, (3) `@eos/*` libs, (4) relative — blank line between groups, alphabetized within.

```ts
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { EventType } from '@eos/shared-enums';
import { DomainEvent } from '@eos/shared-types';

import { PrMetricsRepository } from './pr-metrics.repository';
```

- **Barrel files (`index.ts`) — use sparingly.** One barrel per lib as its *public surface* is good.
  Barrels *inside* a lib re-exporting everything are a leading cause of import cycles and slow builds —
  avoid them. Never import a sibling module via a barrel that pulls in the whole world.

---

## 10. Async

- **No floating promises.** Every promise MUST be `await`ed or explicitly `void`ed (fire-and-forget with
  intent). `@typescript-eslint/no-floating-promises` is **error**.
- **`Promise.all`** for independent awaits; don't `await` in a loop when calls are independent.
- **Cancellation:** long-running work (agent runs, external calls) MUST accept an `AbortSignal` and honor
  it. Worker jobs MUST be idempotent and re-runnable (doc 03 §9) — a retried job must not double-write.

```ts
// BAD — floating promise, error vanishes; serial awaits
prs.forEach(async (pr) => { await enrich(pr); });          // ❌ unhandled + not awaited

// GOOD
await Promise.all(prs.map((pr) => enrich(pr, { signal }))); // awaited, parallel, cancelable
```

---

## 11. Formatting & tooling

| Tool | Role | Enforcement |
|------|------|-------------|
| **Prettier** | Formatting (single source of truth) | `nx format:check` in CI; format-on-save locally |
| **ESLint** | Correctness + `@nx/enforce-module-boundaries` | `nx affected -t lint` blocks merge |
| **TypeScript** | `strict` type check | `nx affected -t typecheck` blocks merge |
| **lint-staged + husky** | Format + lint only staged files pre-commit | Local pre-commit hook |
| **commitlint** | Conventional Commits | `commit-msg` hook + CI |

- **Conventional Commits:** `type(scope): summary` — e.g. `feat(github): add reviewer-load projection`,
  `fix(auth): reject expired refresh tokens`. Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`,
  `perf`, `build`, `ci`. Scope = lib/app. Breaking changes get `!` and a `BREAKING CHANGE:` footer.
- **PR size:** target **≤ 400 lines** of diff (excluding generated/lock files). Bigger PRs get worse
  reviews and hide bugs. Split by seam — a refactor PR, then the feature PR on top.
- **Never disable a lint rule inline** without a comment saying why. A repo-wide rule change is a PR with
  discussion, not a `// eslint-disable` scattered across files.
- Tests are not optional — see [09 — Testing Strategy](./09-testing-strategy.md).

---

## 12. PR review checklist

Reviewer and author both run this. A "no" is a conversation, not always a block.

- [ ] **Scope:** does the PR do one thing? Diff ≤ ~400 lines? Title is a Conventional Commit?
- [ ] **Boundaries:** no cross-boundary imports; deps point *down* the DAG; `nx lint` green (doc 10).
- [ ] **Size & shape:** files/functions within §2 targets, or a split was justified; one primary export/file.
- [ ] **Naming:** intention-revealing; booleans prefixed; no abbreviations or `Helper`/`Manager` bags.
- [ ] **Types:** no `any`; `unknown` narrowed; shared types reused; zod at every boundary; switches exhaustive.
- [ ] **Layers (Nest):** controllers thin, services orchestrate, repos own persistence, DI via ports.
- [ ] **React:** no fetching/business logic in components; `@eos/frontend-data` hooks; `@eos/ui` components.
- [ ] **Tenant safety:** every query tenant-scoped via repository (doc 04 §5/§9) — no raw model access.
- [ ] **Errors:** none swallowed; typed & wrapped; nothing internal leaked to clients.
- [ ] **Async:** no floating promises; independent awaits parallelized; cancelation honored.
- [ ] **No magic values:** strings/numbers from `@eos/shared-enums` / `@eos/shared-constants`.
- [ ] **Comments say why;** public lib APIs have JSDoc; TODOs carry a ticket.
- [ ] **Tests:** meaningful coverage for the change; they fail without it (doc 09).

---

_Next: [09 — Testing Strategy](./09-testing-strategy.md)_
