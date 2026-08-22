# 10 — Shared Packages & Dependency Boundaries

Expands on [03 — System Architecture](./03-system-architecture.md) §6 (monorepo layout) and §7
(dependency rules & tags). This is the canonical reference for **what goes in each shared lib** and
**how we structurally prevent circular dependencies**. Read alongside
[04 — Data Model](./04-data-model.md) (the `@eos/shared-enums` and repository conventions) and
[08 — Coding Standards](./08-coding-standards.md).

> **Why this doc exists.** Circular deps are the #1 cause of "works locally, breaks in Docker/prod"
> build failures in an Nx monorepo. A cycle can pass `tsc` incrementally on a warm cache and then fail
> a cold production build, or silently produce `undefined` at module-init time. We prevent cycles
> **structurally** (a layered DAG of small libs) and **enforce them in CI** (`@nx/enforce-module-boundaries`).
> The keywords **MUST**, **MUST NOT**, **SHOULD**, **MAY** are used per RFC 2119.

---

## 1. The mental model in one sentence

Every internal package sits on a **layer**; dependencies may only point **downward**; `shared/*` is the
leaf that imports nothing internal; frontend and backend never see each other and meet only at
`@eos/contracts`; apps are the only composition roots. If you internalize that, the rest is detail.

---

## 2. Catalog of shared libraries

All internal libs are published under the **`@eos/*`** scope (path-mapped in `tsconfig.base.json`, §7 —
no npm publish). Import scope tells you who is allowed to depend on the lib.

### 2.1 `shared/*` — the leaf layer (framework-agnostic, universal)

These are **pure TypeScript**. They MUST NOT import Nest, React, Sequelize, or any I/O. Both `apps/api`,
`apps/worker`, and `apps/web` consume them.

| Package | Path | Import scope | MAY contain | MUST NOT contain |
|---------|------|--------------|-------------|------------------|
| `@eos/shared-constants` | `libs/shared/constants` | everyone | app-wide constants & thresholds (`STALE_PR_HOURS`, `MAX_UPLOAD_BYTES`), config **keys** (not values), well-known string keys, regexes | env values/secrets, anything computed at runtime, any import |
| `@eos/shared-enums` | `libs/shared/enums` | everyone | `EventType`, `EventSource`, `Role`, `Sensitivity`, `NotificationChannel`, `IntegrationProvider`, `RecommendationStatus`, `ConsentStatus` — the single source of truth shared FE↔BE | types that reference domain objects, zod, runtime logic |
| `@eos/shared-types` | `libs/shared/types` | everyone | domain **types/interfaces** (`DomainEvent` discriminated union, `TimelineEntry`, `PrMetrics`), branded ids, port **interface** shapes | zod, classes with behavior, anything that emits runtime JS beyond `enum`-free `type`/`interface` |
| `@eos/contracts` | `libs/shared/contracts` | FE + BE (the boundary) | **zod schemas** for REST request/response DTOs and WS/SSE event payloads; types **derived** from those schemas (`z.infer`); the API version surface | Nest decorators, React, DB models, business logic |
| `@eos/shared-utils` | `libs/shared/utils` | everyone | pure helpers: date math, formatting, `Result<T,E>` / `Ok`/`Err`, guards, pagination math | any framework import, any I/O, any singleton with state |

**Rule of thumb inside `shared/*`:** `constants` and `enums` are the deepest leaves and import
**nothing** (not even each other, unless enums genuinely need a constant — prefer not). `types` MAY
import `enums` (e.g. `DomainEvent.type: EventType`). `contracts` MAY import `enums` and `constants`.
`utils` MAY import `types`/`enums`. Never the reverse.

```ts
// @eos/shared-constants — pure, zero imports
export const STALE_PR_HOURS = 48;
export const CONFIG_KEYS = { REDIS_URL: 'REDIS_URL', DATABASE_URL: 'DATABASE_URL' } as const;

// @eos/shared-enums — the single source of truth (doc 04 §5)
export enum EventSource { GitHub = 'github', Jira = 'jira', Teams = 'teams', Agent = 'agent', Calendar = 'calendar', AiTool = 'ai_tool' }

// @eos/contracts — zod is the contract; the type is derived, never hand-written
import { z } from 'zod';
export const PrMetricsResponse = z.object({ prId: z.string().uuid(), reviewWaitHours: z.number() });
export type PrMetricsResponse = z.infer<typeof PrMetricsResponse>;
```

> **Why `contracts` is separate from `types`.** `@eos/shared-types` is *type-only* (erased at build).
> `@eos/contracts` ships **runtime** zod validators. Mixing runtime and type-only exports in one barrel
> is a classic cycle/`undefined`-at-init trap (see §5). Keep the erasable and the runtime layers apart.

### 2.2 `backend/*` — server-only libraries (MAY import Nest)

Consumed by `apps/api` and `apps/worker` only. MUST NOT be imported by anything under `frontend/*`.

| Package | Path | Responsibility | Notes |
|---------|------|----------------|-------|
| `@eos/backend-core` | `libs/backend/core` | typed/validated config, structured logging, base classes, **`TenantContext`**, repository **port** interfaces, error shapes | the infra other backend libs stand on; imports only `shared/*` |
| `@eos/database` | `libs/backend/database` | Sequelize models, migrations, `TenantModel` base, repositories (doc 04 §9) | the **only** place models live; exposes repositories, not models |
| `@eos/events` | `libs/backend/events` | `EventBus` port + Redis Streams adapter, transactional outbox | swappable to Kafka with no caller change (ADR-0005) |

Backend feature libs (`@eos/auth`, `@eos/rbac`, `@eos/ai`, `@eos/integrations`) sit **above** these and
depend on `backend-core`/`database`/`events` and `shared/*` — never on each other (§4).

### 2.3 `frontend/*` — browser-only libraries (MAY import React)

Consumed by `apps/web` only. MUST NOT import anything under `backend/*`.

| Package | Path | Responsibility |
|---------|------|----------------|
| `@eos/ui` | `libs/frontend/ui` | shadcn/ui components, design system primitives — **presentational only**, no data fetching |
| `@eos/frontend-data` | `libs/frontend/data` | TanStack Query hooks, the typed API client; validates responses with `@eos/contracts` |

`feature-*` frontend libs (route-level) compose `@eos/ui` + `@eos/frontend-data` and MUST NOT import
each other.

---

## 3. The layered DAG

Restated from [03 §7](./03-system-architecture.md#7-dependency-rules--preventing-circular-dependencies).
**Arrows point downward only.** A back-edge is, by definition, a cycle.

```mermaid
graph TD
  subgraph apps["apps/* — composition roots"]
    API[apps/api]
    WORKER[apps/worker]
    WEB[apps/web]
  end

  subgraph feat["feature layer (siblings MUST NOT import each other)"]
    FEFEAT[frontend/feature-*]
    BEFEAT["backend/{auth,rbac,ai,integrations}"]
  end

  subgraph fe["frontend libs"]
    UI[@eos/ui]
    FDATA[@eos/frontend-data]
  end

  subgraph beinfra["backend infra"]
    BCORE[@eos/backend-core]
    DB[@eos/database]
    EVENTS[@eos/events]
  end

  subgraph shared["shared/* — leaf, imports NOTHING internal"]
    CONTRACTS[@eos/contracts]
    TYPES[@eos/shared-types]
    ENUMS[@eos/shared-enums]
    CONST[@eos/shared-constants]
    UTILS[@eos/shared-utils]
  end

  API --> BEFEAT
  WORKER --> BEFEAT
  WEB --> FEFEAT
  FEFEAT --> UI
  FEFEAT --> FDATA
  BEFEAT --> BCORE
  BEFEAT --> DB
  BEFEAT --> EVENTS
  UI --> shared
  FDATA --> CONTRACTS
  BCORE --> shared
  DB --> shared
  EVENTS --> shared
  CONTRACTS --> ENUMS
  TYPES --> ENUMS
  UTILS --> TYPES
```

Invariants:

- **`shared/*` is a leaf.** It MUST NOT import from `backend/*`, `frontend/*`, or `apps/*`.
- **Frontend ↔ backend is forbidden.** They meet **only** through `@eos/contracts` (both sides import
  it; neither imports the other). This is what lets the API and SPA evolve against a typed wire contract.
- **Siblings in a layer do not import each other.** `backend/auth ↛ backend/rbac`;
  `feature-dashboard ↛ feature-timeline`. Shared needs go **down** into `backend-core` or a `shared/*` lib.
- **No cross-module model imports** (doc 04 §9): a module reaches another module's data only through a
  repository/service **port**, never its Sequelize model.
- **Apps are the only composition roots.** Only `apps/*` wire concrete adapters to ports (DI). Libs
  depend on interfaces, so a module can later be extracted to its own service with zero caller changes
  (doc 03 §2).

---

## 4. How circular dependencies happen — and the fix for each

Every cycle in this repo traces back to one of these. For each anti-pattern, the structural fix.

### 4.1 A "shared" lib imports a feature (up-import)

**Symptom.** `@eos/shared-utils` imports `@eos/integrations` to reuse one helper → `shared` is no longer
a leaf, and any feature that imports `shared-utils` now transitively depends on `integrations`.
**Fix.** Move the symbol **down** to the lowest layer that needs it. If a helper is needed by both a
feature and `shared`, it belongs in `shared`. **Never up-import.** (§6 decision flow.)

### 4.2 Barrel files re-exporting across a boundary

**Symptom.** A convenience `index.ts` does `export * from '@eos/database'` inside a `shared` or
`frontend` barrel — dragging Sequelize (or a whole feature graph) across the boundary and creating a
cycle the moment the other side is imported back.
**Fix.** Barrels MAY only re-export **within their own lib**. A barrel MUST NOT re-export another
`@eos/*` package. Import cross-package symbols directly from their package entry point.

### 4.3 Two features importing each other's models/services

**Symptom.** `backend/auth` imports `RbacService` and `backend/rbac` imports `UserModel` from `auth`
→ direct cycle.
**Fix.** Extract the shared contract **down** into `@eos/backend-core` (a `RoleResolver` port + a
`UserRepository` port). Each feature depends on the port; `apps/api` wires the concrete implementations.
Siblings never talk directly.

### 4.4 Mixing type-only and runtime exports in one barrel

**Symptom.** `@eos/contracts/index.ts` re-exports both zod schemas (runtime) and a big `types.ts`
(erased). Under `isolatedModules`/certain bundlers, the runtime half imports the type half which
imports back — evaluated at module-init, one side is `undefined`.
**Fix.** Keep `@eos/shared-types` (type-only) and `@eos/contracts` (runtime zod) as **separate libs**
(§2.1). Within a lib, use `import type` for type-only edges so the compiler drops them from the runtime
graph. See [08 — Coding Standards](./08-coding-standards.md) on `import type`.

### 4.5 App-level glue leaking into a lib

**Symptom.** A lib imports the app's DI container/module to grab a provider → the lib now depends on the
app that depends on the lib.
**Fix.** Libs expose **ports**; only `apps/*` compose. If a lib needs a dependency, it declares an
interface and receives the implementation via constructor injection — it never reaches up into the app.

---

## 5. tsconfig.base.json path mappings

The `@eos/*` scope is pure TS path-mapping — no npm registry involved. Example:

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@eos/shared-constants": ["libs/shared/constants/src/index.ts"],
      "@eos/shared-enums":     ["libs/shared/enums/src/index.ts"],
      "@eos/shared-types":     ["libs/shared/types/src/index.ts"],
      "@eos/contracts":        ["libs/shared/contracts/src/index.ts"],
      "@eos/shared-utils":     ["libs/shared/utils/src/index.ts"],
      "@eos/backend-core":     ["libs/backend/core/src/index.ts"],
      "@eos/database":         ["libs/backend/database/src/index.ts"],
      "@eos/events":           ["libs/backend/events/src/index.ts"],
      "@eos/ui":               ["libs/frontend/ui/src/index.ts"],
      "@eos/frontend-data":    ["libs/frontend/data/src/index.ts"]
    }
  }
}
```

Consumers import only the **package entry** (`@eos/shared-enums`), never a deep path
(`@eos/shared-enums/src/internal/...`). Deep imports bypass the lib's public surface and are the fastest
way to smuggle in a hidden edge; the boundary rule (§6) forbids them.

---

## 6. Enforcement — tags, ESLint, CI

Structure is only real if CI rejects violations. Three layers:

### 6.1 Nx project tags

Every `project.json` declares `scope:*` and `type:*` tags (doc 03 §7):

```jsonc
{ "tags": ["scope:shared",   "type:util"] }      // libs/shared/utils
{ "tags": ["scope:shared",   "type:contract"] }  // libs/shared/contracts
{ "tags": ["scope:backend",  "type:infra"] }     // libs/backend/database
{ "tags": ["scope:backend",  "type:feature"] }   // libs/backend/auth
{ "tags": ["scope:frontend", "type:ui"] }        // libs/frontend/ui
{ "tags": ["scope:frontend", "type:feature"] }   // libs/frontend/feature-timeline
{ "tags": ["scope:app"] }                          // apps/api
```

### 6.2 `@nx/enforce-module-boundaries`

The root ESLint config turns the DAG into a lint rule. `onlyDependOnLibsWithTags` is a **whitelist** —
anything not listed is forbidden, which is what closes the frontend↔backend and sibling→sibling edges:

```jsonc
// eslint.config.js (root) — @nx/enforce-module-boundaries
{
  "depConstraints": [
    { "sourceTag": "scope:shared",
      "onlyDependOnLibsWithTags": ["scope:shared"] },              // leaf: shared → shared only

    { "sourceTag": "scope:backend",
      "onlyDependOnLibsWithTags": ["scope:backend", "scope:shared"],
      "notDependOnLibsWithTags": ["scope:frontend"] },             // backend never sees frontend

    { "sourceTag": "scope:frontend",
      "onlyDependOnLibsWithTags": ["scope:frontend", "scope:shared"],
      "notDependOnLibsWithTags": ["scope:backend"] },              // frontend never sees backend

    { "sourceTag": "type:feature",
      "notDependOnLibsWithTags": ["type:feature"] },               // siblings don't import each other

    { "sourceTag": "type:infra",
      "onlyDependOnLibsWithTags": ["scope:shared", "type:infra"] },// infra depends down only

    { "sourceTag": "scope:app",
      "onlyDependOnLibsWithTags": ["scope:shared", "scope:backend", "scope:frontend"] }
  ]
}
```

`@nx/enforce-module-boundaries` also flags **circular dependencies** and **self-loops** out of the box.

### 6.3 Visualize, lint, build affected

| Command | Purpose |
|---------|---------|
| `nx graph` | render the project graph in the browser; eyeball that all arrows point down |
| `nx lint` / `nx run-many -t lint` | fail on any boundary or cycle violation — wired into CI so a cycle **cannot reach `main` or a deploy** |
| `nx affected -t build lint test` | on a PR, build/lint/test only what a change ripples into (§8) |

Secondary circular-import check (defense in depth, catches JS-level cycles ESLint's project graph might
miss, e.g. within a single lib):

```bash
npx madge --circular --extensions ts libs apps   # or: npx dpdm --no-warning --no-tree 'apps/**/*.ts'
```

Run `madge`/`dpdm` in CI as a separate gate. When it flags a cycle, the fix is always one of §4.

---

## 7. Adding a new shared symbol — decision flow

Put every symbol at the **lowest layer that needs it**, and **never up-import**. Before adding, walk this:

```mermaid
graph TD
  A[New symbol to share] --> B{Framework-specific?<br/>Nest / React / Sequelize}
  B -->|Yes, server| S1[backend/* lib<br/>backend-core / database / events]
  B -->|Yes, browser| S2[frontend/* lib<br/>ui / frontend-data]
  B -->|No, pure TS| C{What is it?}
  C -->|Fixed set of named values| E[@eos/shared-enums]
  C -->|Constant / threshold / config key| K[@eos/shared-constants]
  C -->|Type / interface, no runtime| T[@eos/shared-types]
  C -->|Request/response/WS wire shape| Z[@eos/contracts &#40;zod&#41;]
  C -->|Pure helper function| U[@eos/shared-utils]
```

Tie-breakers:

- **Is it crossing the wire (FE↔BE)?** It MUST be a zod schema in `@eos/contracts`, with its TS type
  `z.infer`-derived. Do not hand-write a parallel interface in `shared-types`.
- **Is it a magic string used in more than one place?** Promote it to `@eos/shared-enums` (named values)
  or `@eos/shared-constants` (keys/thresholds). No string literals for `EventType`/`EventSource`
  anywhere (doc 04 §5).
- **Would placing it here force an up-import?** Then it's in the wrong lib — move it down.

---

## 8. Versioning & ownership

These packages are **internal** — path-mapped, never published to a registry — so there is **no
semver**; the working tree is always internally consistent.

- **Changes ripple via `nx affected`.** Editing `@eos/shared-enums` marks every dependent (FE + BE) as
  affected; CI rebuilds/tests exactly those. This is the safety net that makes shared-lib edits cheap
  **and** honest — you cannot break a consumer without CI noticing.
- **CODEOWNERS.** `libs/shared/*` and `@eos/backend-core` are owned by the platform team; a PR touching
  them requires their review. Shared code is high-blast-radius; gate it accordingly.
- **Keep them small and stable.** `shared/*` should change rarely. Frequent churn there is a smell that
  a feature concern leaked down. A shared lib SHOULD be additive; breaking a widely-used symbol means
  fixing every `nx affected` consumer in the same PR (that's a feature, not a bug).
- **One public surface per lib.** Each lib's `src/index.ts` is its contract; internal files are private.

---

## 9. Do / Don't

| Do | Don't |
|----|-------|
| Import from the package entry: `@eos/shared-enums` | Deep-import `@eos/shared-enums/src/internal/...` |
| Put a symbol at the lowest layer that needs it | Up-import — a lib reaching into a higher layer |
| Cross FE↔BE only through `@eos/contracts` | Import `@eos/database` from any `frontend/*` lib |
| Derive DTO types from zod (`z.infer`) | Hand-write a type that parallels a zod schema |
| Reach other modules via repository/service ports | Import another module's Sequelize model (doc 04 §9) |
| Re-export only within a lib's own barrel | `export *` another `@eos/*` package from a barrel |
| Keep runtime (zod) and type-only libs separate | Mix runtime + `type` exports in one barrel |
| Let `nx lint` + `madge` gate every PR | Rely on "it built locally" — cold prod builds differ |
| Wire concrete adapters only in `apps/*` | Import an app's DI module from a lib |

---

_Next: [deployment/00 — GCP VM Deployment](./deployment/00-gcp-vm-deployment.md)_
