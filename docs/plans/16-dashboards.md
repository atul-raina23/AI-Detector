# Plan 16 — Dashboards

> The **home surface** of the product: three role-shaped dashboards — Employee, Manager, and CTO — that
> compose already-built **projections** (never raw events) into a single, fast, explainable view. Each
> persona sees only what RBAC scope permits; every widget reads a named projection/API, updates live over
> WebSocket, and renders skeleton/empty/error states independently so one slow widget never blocks the
> page. The whole dashboard loads **≤ 1.5s p95** (`NFR-LATENCY`).

| | |
|---|---|
| **Status** | Draft v1 |
| **Phase** | Phase 1 (basic) → enriched in Phase 2–3 (see [Roadmap](./00-roadmap-and-phasing.md)) |
| **Owner** | Frontend / Product Eng |
| **Satisfies** | `FR-DASH-01`, `FR-DASH-02`, `FR-DASH-03` (from [PRD](../01-product-requirements.md)) |
| **Depends on** | [05 — Event Pipeline](./05-event-pipeline.md) & projections ([04 §6](../04-data-model.md#6-projections-read-models)); [06 — GitHub](./06-github-integration.md) (`pr_metrics`, `dora_metrics`, `reviewer_load`); [07 — Jira](./07-jira-sprints.md) (`sprint_metrics`); [12 — Daily Timeline](./12-daily-timeline.md); [15 — Recommendations](./15-recommendations.md); [03 — RBAC](./03-rbac.md); [17 — Notifications](./17-notifications.md) (bell) |
| **Nx projects** | `libs/frontend/feature-dashboard` (`@eos/feature-dashboard`, `scope:frontend`/`type:feature`) · `libs/backend/dashboards` (`@eos/dashboards`, `scope:backend`/`type:feature`) · consumes `@eos/ui`, `@eos/frontend-data`, `@eos/contracts` (FE) and `@eos/backend-core`, `@eos/database`, `@eos/contracts` (BE); wired in `apps/web` + `apps/api` (see [10 — Boundaries](../10-shared-packages-and-boundaries.md)) |

---

## 1. Goal & scope

- **In scope:** three persona dashboards (Employee/Manager/CTO); a server-side **dashboard aggregation**
  that batches the widgets a persona needs into **one** RBAC-scoped payload (one round trip → the latency
  budget); the `@eos/feature-dashboard` React lib (widget grid, per-widget loading/empty/error states,
  light/dark + responsive per [doc 11](../11-ui-ux-design-system.md)); live widget updates over WS with
  TanStack Query cache invalidation; the dashboard query index set (`EXPLAIN`-verified, [04 §10](../04-data-model.md#10-indexing--performance-notes)).
- **Out of scope:** the projections themselves (owned by [06](./06-github-integration.md)/[07](./07-jira-sprints.md)/[12](./12-daily-timeline.md)); the Manager Copilot ([13](./13-ai-agents.md)); report generation ([18](./18-reports.md)); the notification bell's delivery ([17](./17-notifications.md)) — the dashboard only *renders* it.
- **Anti-goals:** no per-keystroke surveillance panels, no individual "productivity score" leaderboard, no
  dashboard that recomputes metrics client-side or reads raw `events` on the hot path ([Vision §4](../00-vision-and-scope.md#4-what-we-are-not-building-anti-goals)).

## 2. User stories

- `As an Employee, I want one screen showing my day — timeline, tasks, PRs, meetings, focus, AI usage — so that I skip status meetings.` — `FR-DASH-01`
- `As an Employee, I want my open PRs flagged as "awaiting review" vs "changes requested", so that I know my next action.` — `FR-DASH-01`
- `As a Team Lead, I want team health, the PR queue, sprint progress, blockers, and review load in one glance, so that I can unblock the team today.` — `FR-DASH-02`
- `As an Engineering Manager, I want the same view across my department's teams, so that I can spot a reviewer overloaded across teams.` — `FR-DASH-02`
- `As a CTO, I want org KPIs, velocity, DORA, repo health, and AI adoption, so that I can see delivery health without drilling to people.` — `FR-DASH-03`
- `As any user, I want the dashboard to paint fast and never hang on one slow widget, so that it feels instant.` — `NFR-LATENCY`

## 3. Domain model

Dashboards add **no new source tables** — they are a *read composition* over existing projections
([04 §6](../04-data-model.md#6-projections-read-models)), which is what makes them cheap and explainable
(`NFR-EXPLAIN`). Two additions live in `@eos/database`, both tenant-scoped (`TenantModel`,
[04 §9](../04-data-model.md#9-sequelize-conventions)):

| Table | Key columns | Sensitivity | Purpose |
|-------|-------------|-------------|---------|
| `dashboard_layouts` | `id`, `organization_id`, `user_id`, `persona`, `widgets` (jsonb: order + collapsed), `updated_at` | P2 | per-user widget arrangement; optional, defaults from persona preset |
| `dashboard_snapshots` | `id`, `organization_id`, `scope`, `persona`, `payload` (jsonb), `computed_at`, `ttl_at` | P2 | last computed aggregate for a scope (warm cache for first paint / WS-coalesced refresh) |

Widgets read these existing projections (each row carries `derived_from` → the "why", `NFR-EXPLAIN`):

| Widget source | Projection | Serves persona |
|---------------|-----------|----------------|
| Timeline strip | `timeline_entries` | Employee |
| PR queue / my PRs | `pr_metrics` | Employee, Manager |
| Sprint progress / my tasks | `sprint_metrics` | Employee, Manager, CTO |
| Review load | `reviewer_load` | Manager, CTO |
| Focus vs meetings | `focus_metrics` | Employee, Manager |
| AI usage / adoption | `ai_usage_rollups` | Employee (own), Manager/CTO (agg) |
| DORA / velocity | `dora_metrics` | Manager, CTO |
| Risks / recommendations | `recommendations` | all (scoped) |

New enum in `@eos/shared-enums`: `DashboardPersona` (`employee` | `manager` | `cto`). No new `EventType`s —
dashboards are pure read models; they consume the WS events other modules already emit (§5).

## 4. Architecture & flow

`@eos/dashboards` (backend feature lib) exposes a `DashboardService` that, given the request-scoped
`TenantContext` + RBAC scope, **fans out to the projection repositories in parallel** and assembles one
persona payload. It depends **down** on `@eos/backend-core` (context, ports), `@eos/database`
(repositories — never models, [04 §9](../04-data-model.md#9-sequelize-conventions)), and `@eos/contracts`;
it imports **no sibling** feature lib — it reaches other modules' data through their **repository ports**
([10 §3](../10-shared-packages-and-boundaries.md#3-the-layered-dag)), not their models.

**Port introduced** (interface in `@eos/backend-core`, adapters wired in `apps/api`):

| Port | Contract | Adapter |
|------|----------|---------|
| `WidgetProvider<T>` | `key`, `requiredPermission`, `load(scope): Promise<WidgetData<T>>` | one per widget, each wrapping a scoped projection repo |

The service composes registered `WidgetProvider`s for the persona, calling only those the caller's
permissions allow (a denied widget is **omitted**, not errored). This keeps a new widget a one-provider
addition — the "extensible by contract" rule ([03 §8](../03-system-architecture.md#8-how-a-new-integrationagent-plugs-in-extensibility)).

```mermaid
sequenceDiagram
  participant W as SPA (feature-dashboard)
  participant A as DashboardController
  participant S as DashboardService
  participant R as Projection repos (scoped)
  W->>A: GET /dashboards/{persona}
  A->>S: resolve persona + RBAC scope
  par fan-out (only permitted widgets)
    S->>R: pr_metrics.forScope(...)
    S->>R: sprint_metrics.forScope(...)
    S->>R: recommendations.forScope(...)
  end
  R-->>S: widget data (+ derived_from)
  S-->>A: composed payload (partial-tolerant)
  A-->>W: 200 { widgets: [...] }
  Note over W: skeletons → hydrate; WS pushes invalidate per-widget cache
```

`nx graph` confirms `feature-dashboard → ui/frontend-data/contracts` and `dashboards → backend-core/database`
only; no cross-boundary or cyclic edge.

### 4.1 Frontend feature-lib structure (`@eos/feature-dashboard`)

```
libs/frontend/feature-dashboard/src/
├─ DashboardRoute.tsx          # resolves persona from RBAC role → renders the right grid
├─ grid/DashboardGrid.tsx      # responsive CSS-grid; per-widget <WidgetBoundary>
├─ widgets/
│  ├─ MyPrsWidget.tsx  MyTasksWidget.tsx  TimelineStripWidget.tsx  FocusWidget.tsx …
│  ├─ PrQueueWidget.tsx  SprintProgressWidget.tsx  ReviewLoadWidget.tsx  BlockersWidget.tsx …
│  └─ DoraWidget.tsx  VelocityWidget.tsx  AiAdoptionWidget.tsx  RepoHealthWidget.tsx …
├─ WidgetBoundary.tsx          # error boundary + Suspense + empty-state fallback per widget
└─ hooks/useDashboard.ts       # TanStack Query; WS subscription → cache invalidation
```

- Widgets are **presentational** components from `@eos/ui` (Card, Stat, Sparkline, Badge, Skeleton) fed by
  hooks in `@eos/frontend-data`; the feature lib holds **no** API/fetch code of its own beyond the hooks it
  composes. Sibling feature libs are never imported ([10 §2.3](../10-shared-packages-and-boundaries.md#23-frontend--browser-only-libraries-may-import-react)).
- **Design system ([doc 11](../11-ui-ux-design-system.md)):** widgets use design **tokens** (spacing,
  color, radius) — never hard-coded hex — so **light/dark** come free; the grid is **responsive**
  (1-col mobile → 2-col tablet → 3–4-col desktop) via token breakpoints; every widget meets **WCAG 2.1 AA**
  (`NFR-A11Y`) — sparklines carry text alternatives, color is never the only signal (stale = icon + label).

## 5. API & realtime surface

One aggregate endpoint per persona (schemas are zod in `@eos/contracts`, canonical envelope
[05 §3](../05-api-and-realtime.md#3-envelope-errors-and-auth-on-the-wire)); optional per-widget endpoints
back the "refresh this card" / drill-in actions.

| Method + path | Purpose | Permission ([02 §2.2](../02-personas-and-rbac.md#22-default-role--permission-matrix-excerpt)) | FR |
|---------------|---------|------------|-----|
| `GET /api/v1/dashboards/employee` | own day: timeline, tasks, PRs, meetings, focus, AI, recs | `dashboard:read:own` (auto) | `FR-DASH-01` |
| `GET /api/v1/dashboards/manager?teamId=…` | team health, PR queue, sprint, blockers, review/meeting load, risk | `pr:read:team` ∪ `sprint:read:team` ∪ `metrics:dora:read` | `FR-DASH-02` |
| `GET /api/v1/dashboards/cto` | org KPIs, velocity, DORA, repo health, AI adoption | `metrics:dora:read` (org) ∪ `ai_usage:read:agg` | `FR-DASH-03` |
| `GET /api/v1/dashboards/layout` · `PUT …/layout` | read/save widget arrangement | own | — |

- **RBAC scoping (`FR-RBAC-03/04`).** `organizationId` comes from the JWT, never a param
  ([05 §2.2](../05-api-and-realtime.md#22-resource-naming)). The manager endpoint's `teamId` is validated by
  the resource/ownership gate ([02 §2.3](../02-personas-and-rbac.md#23-enforcement-server-side-always)) — a
  lead may only pass a team they lead; an Eng Manager, any team in their dept. **Scope narrows the query**,
  it does not just hide fields: a manager's PR queue is filtered to their team's repos server-side.
  **HR has no dashboard persona** — HR is aggregate-only via reports ([18](./18-reports.md)); the routes
  above have no `:agg` variant that would identify an individual, by construction.
- **Real-time (`FR-EVT-04`, `NFR-LATENCY`).** On mount the client subscribes to the rooms it is entitled to
  ([05 §5.1](../05-api-and-realtime.md#51-channel--room-model)): Employee → `org:{orgId}:user:{userId}`;
  Manager → `org:{orgId}:team:{teamId}` (per team in view). A push (`pr.metrics.updated`,
  `sprint.metrics.updated`, `recommendation.created`, …) **invalidates the matching TanStack Query key**;
  the affected widget refetches (or applies the coalesced payload) — the WS is a *change signal*, the REST
  read model stays source of truth ([05 §5.5](../05-api-and-realtime.md#55-reconnection--backpressure)). The
  CTO's org rollups refresh on a slower cadence (worker-recomputed `dashboard_snapshots` + a periodic poll)
  since org-wide DORA changes are not sub-second events. Backpressure coalescing means a widget applies the
  **latest** state, not every intermediate event.

## 6. AI involvement (if any)

None in the render path — dashboards show **projection** numbers, not model output, so they are fast and
deterministic. The dashboard *surfaces* AI results produced elsewhere: the **risk/recommendations widget**
renders `recommendations` rows (each with a **Why** affordance expanding stored `evidence`,
[07 §6](../07-ai-architecture.md#6-explainability-by-construction-nfr-explain)) and links to the Manager
Copilot ([13](./13-ai-agents.md)) — but generation happens in the AI layer, not here. No agent runs on a
dashboard GET.

## 7. Security, privacy & consent

- **Signals & consent (`NFR-CONSENT`).** Widgets read projections built only from **consented** signals; a
  signal an employee did not opt into is never in `focus_metrics`/`ai_usage_rollups`, so it cannot surface —
  RBAC and consent **compose, more-restrictive wins** ([02 §3](../02-personas-and-rbac.md#3-privacy-interaction)).
- **Scope & sensitivity.** Employee data is P2–P3 shown only to its owner and (aggregate) to their chain;
  AI-usage and wellbeing are surfaced to managers **aggregate-only** (`ai_usage:read:agg`,
  `wellbeing:read:agg`) — never a manager staring at one person's browser domains. Manager/CTO views are
  team/org aggregates.
- **Audit (`FR-ENT-01`).** A manager/CTO widget that identifies an individual's activity (e.g. drilling
  from the PR queue into one person's timeline) generates an **audit record** even for the CTO
  ([02 §2.2 notes](../02-personas-and-rbac.md#22-default-role--permission-matrix-excerpt)); the aggregate
  dashboard read itself is logged structurally but not audited per-row.
- Reference [06 — Security, Privacy & Consent](../06-security-privacy-consent.md).

## 8. Implementation plan (phased tasks)

Each a small PR; backend + `@eos/contracts` schema + FE widget land together per widget where practical.

1. **`WidgetProvider` port + `DashboardService`** in `@eos/dashboards` with parallel fan-out + partial
   tolerance; `dashboard_layouts`/`dashboard_snapshots` migrations. *Accept:* a denied widget is omitted,
   not errored; one failing provider degrades to an error card, not a 500.
2. **Employee endpoint + `@eos/feature-dashboard` shell** (grid, `WidgetBoundary`, `useDashboard`) with the
   Employee widget set. *Accept:* own-scope payload; skeleton→hydrate; per-widget error/empty states.
3. **Manager endpoint + widgets** (PR queue, sprint, blockers, review/meeting load, risk) with `teamId`
   ownership gate. *Accept:* lead sees only their team; scope narrows the query (§9 isolation test).
4. **CTO endpoint + widgets** (DORA, velocity, repo health, AI adoption) reading org rollups +
   `dashboard_snapshots`. *Accept:* org-scope only; snapshot warm-cache first paint.
5. **Realtime wiring:** room subscription → TanStack Query invalidation, coalesced updates, resync on gap.
   *Accept:* a PR metric change repaints the card ≤ 2s; a WS gap triggers REST resync.
6. **Perf pass:** `EXPLAIN`-verify the dashboard queries ([04 §10](../04-data-model.md#10-indexing--performance-notes)),
   code-split the route, add layout persistence. *Accept:* dashboard load **≤ 1.5s p95** in the perf test (§9).

## 9. Testing (`unit` / `integration` / `e2e`)

Per [09 — Testing Strategy](../09-testing-strategy.md). Deterministic — injected `clock`, seeded
projections, no live integrations.

- **Unit:** persona→widget-set resolver; `DashboardService` composition (partial tolerance: one provider
  throws → payload still returns others with an error marker); RBAC widget-omission logic; WS event → query-key
  invalidation mapping.
- **Integration (Testcontainers PG/Redis, real migrations):**
  - **Tenant isolation (`NFR-ISO`) — mandatory:** each `WidgetProvider`'s repo ships a cross-tenant negative
    test; `assertTenantScoped()` sweep covers them ([09 §5.1](../09-testing-strategy.md#51-tenant-isolation-nfr-iso--mandatory-pattern)).
  - **Scope enforcement (negative, security-critical):** a Team Lead requesting a team they don't lead →
    `403`/`404`; a manager's PR queue never contains another team's PRs; an Employee cannot hit the manager
    endpoint.
  - **HR forbidden:** an HR principal has no dashboard-persona route that identifies an individual.
  - Partial failure: a stubbed failing projection yields an error card, HTTP `200`, other widgets intact.
- **E2E (Playwright):** login as each persona → correct widget set renders; live PR update repaints the
  queue card; collapse/reorder persists across reload.
- **Performance (must-have):** a seeded org (20 users, realistic projection volume) asserts
  `GET /dashboards/*` p95 **≤ 1.5s** and first-contentful widget paint under the budget (`NFR-LATENCY`).

## 10. Observability

Per [deployment/03 — Observability](../deployment/03-observability.md). One structured log line per
dashboard request (`{ correlationId, orgId, userId, persona, widgetCount, durationMs }`), no P3/P4 fields
([05 §11](../05-api-and-realtime.md#11-api-observability-nfr-obs)). Metrics: `dashboard_load_ms` histogram
per persona (alert on p95 > 1.5s → `NFR-LATENCY` breach), `dashboard_widget_error_total{widget}`,
`dashboard_ws_repaint_lag_ms`, `dashboard_snapshot_staleness_seconds`. Frontend RUM reports real
first-contentful-widget time. Sentry captures widget error-boundary trips with `correlationId`.

## 11. Acceptance criteria

- [ ] Employee dashboard shows today's work, timeline, tasks, PRs, meetings, focus, AI usage. — `FR-DASH-01`
- [ ] Manager dashboard shows team health, PR queue, sprint progress, blocked tasks, review load, meeting load, risk — scoped to their team(s). — `FR-DASH-02`
- [ ] CTO dashboard shows engineering KPIs, velocity, repo health, DORA, AI adoption, org analytics — org aggregate. — `FR-DASH-03`
- [ ] Every widget reads a named projection; none reads raw `events` on the hot path; each shows loading/empty/error independently. — `NFR-EXPLAIN`
- [ ] Live updates repaint the relevant widget ≤ 2s after ingestion; a WS gap triggers REST resync. — `FR-EVT-04`
- [ ] Dashboard load **≤ 1.5s p95**; light/dark + responsive + WCAG 2.1 AA. — `NFR-LATENCY`, `NFR-A11Y`
- [ ] Cross-tenant and out-of-scope reads fail closed; HR has no individual-identifying dashboard. — `NFR-ISO`, RBAC

## 12. Risks & open questions

| Risk / question | Mitigation / decision |
|---|---|
| CTO org rollups too heavy for a ≤1.5s live read | Precompute into `dashboard_snapshots` on the worker; dashboard reads the snapshot + poll, not live aggregation. |
| One slow projection repo blows the whole payload | Parallel fan-out with per-provider timeout + partial tolerance; slow widget degrades to skeleton→error card. |
| WS storm on a busy team repaints too often | Backpressure coalescing (latest-state-per-key, [05 §5.5](../05-api-and-realtime.md#55-reconnection--backpressure)) + debounce query invalidation. |
| Layout persistence vs shifting persona presets | Store only deltas in `dashboard_layouts`; unknown widget keys ignored so preset changes don't break saved layouts. |
| **Open:** should Eng Manager multi-team view aggregate or tab per team? | Proposed: department roll-up card + per-team tabs — confirm with product/[doc 11](../11-ui-ux-design-system.md). |

---

_Next: [17 — Notifications](./17-notifications.md)_
