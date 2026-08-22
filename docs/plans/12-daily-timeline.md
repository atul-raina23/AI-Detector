# Plan 12 — Daily Timeline

> One chronological, per-person, per-day story of engineering work — login → SOD → coding → AI → commit →
> PR → review → meeting → EOD — assembled by **correlating every source** into a single `timeline_entries`
> projection. Individuals see their own day; managers may **replay** a team member's day chronologically,
> RBAC-scoped and audited. Every entry links back to the exact source event ids that produced it, so the
> timeline is fully explainable, never a black box.

| | |
|---|---|
| **Status** | Draft v1 |
| **Phase** | Phase 1 (Foundations) — enriched in Phase 3 as more sources land (see [Roadmap](./00-roadmap-and-phasing.md)) |
| **Owner** | Timeline & Insights |
| **Satisfies** | `FR-TL-01`, `FR-TL-02`, `FR-TL-03` (from [PRD](../01-product-requirements.md)); `NFR-EXPLAIN`, `NFR-ISO`, `NFR-LATENCY`, `FR-RBAC-03/04`, `FR-ENT-01` |
| **Depends on** | [05 — Event Pipeline](./05-event-pipeline.md) (projection framework, `derived_from`, WS fan-out), [03 — RBAC](./03-rbac.md), [02 — Multi-Tenancy](./02-multi-tenancy.md); enriched by [04 agent](./04-desktop-agent.md), [06 GitHub](./06-github-integration.md), [07 Jira](./07-jira-integration.md), [08 Teams](./08-teams-integration.md), [09 Calendar](./09-calendar-integration.md) |
| **Nx projects** | `libs/backend/database` (`timeline_entries` model), `apps/worker` (`TimelineProjection`), `apps/api` (read + replay endpoints), `libs/frontend/feature-timeline` (`@eos/feature-timeline`, `scope:frontend type:feature`), `libs/shared/contracts` |

---

## 1. Goal & scope

- **In scope:**
  - The **`timeline_entries` projection** — a per-user/day, chronologically ordered read model built by a
    worker consumer from all of a user's events (`FR-TL-01`).
  - The **correlation / merging logic** that stitches related events into a coherent narrative
    (login → SOD → coding → AI → commit → PR → review → meeting → EOD) and groups noisy micro-events.
  - The **read API** (own timeline + team-member timeline) and the **replay API/UX contract**
    (chronological playback, RBAC-scoped, audited for others) (`FR-TL-02`).
  - Every entry carrying its **source event ids** for explainability (`FR-TL-03`, `NFR-EXPLAIN`).
- **Out of scope:**
  - Producing the underlying events — each source plan does that ([04](./04-desktop-agent.md)/[06](./06-github-integration.md)/[07](./07-jira-integration.md)/[08](./08-teams-integration.md)/[09](./09-calendar-integration.md)).
    Timeline is a **consumer**, never a collector.
  - Aggregate metrics (PR/DORA/sprint/focus) — those are sibling projections in [16 — Dashboards](./16-dashboards.md).
  - AI-drafted EOD generation → [08 Teams](./08-teams-integration.md) / [13 Agents](./13-ai-agents.md); the timeline is the **correlated input** it reads.
- **Anti-goals:** no surveillance/ranking view, no keystroke/screenshot data (there is none — [PRD FR-AGENT-03](../01-product-requirements.md#34-desktop-agent--plans04)),
  no HR individual drilldown ([Personas §1.5](../02-personas-and-rbac.md), [Vision §4](../00-vision-and-scope.md#4-what-we-are-not-building-anti-goals)).

## 2. User stories

- `As an Individual Contributor, I want a chronological view of my own day across all tools, so that I get credit for my work without writing a status update.` — `FR-TL-01`
- `As an Individual Contributor, I want each timeline entry to show where it came from, so that I trust it and can correct a mis-correlation.` — `FR-TL-03`, `NFR-EXPLAIN`
- `As a Team Lead, I want to replay a team member's day chronologically (within my team), so that I can understand a blocker in context.` — `FR-TL-02`, `FR-RBAC-04`
- `As an Engineer, I want to know that when a manager views my timeline it is logged, so that access is accountable.` — `FR-ENT-01`
- `As a manager, I want the SOD's stated tasks correlated with the day's commits/PRs and the EOD, so that plan-vs-actual is visible.` — `FR-TL-01`
- `As a user, I want my timeline to update live as I work, so that today's view is current within seconds.` — `FR-TL-01`, `NFR-LATENCY`

## 3. Domain model

Extends [04 — Data Model §6](../04-data-model.md#6-projections-read-models) (`timeline_entries` is listed
there; this plan defines its columns). It is a **projection** — rebuildable from `events`, carrying
`derived_from`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuidv7 | PK |
| `organization_id` | uuid | tenant scope (`NFR-ISO`), leading index column |
| `subject_user_id` | uuid | the person the day belongs to |
| `day` | date | local calendar day in the user's tz (`NFR-I18N`); grouping key |
| `occurred_at` | timestamptz | UTC sort key within the day |
| `kind` | enum | `login`/`sod`/`coding`/`ai_usage`/`commit`/`pr`/`review`/`meeting`/`focus`/`eod` … (in `@eos/shared-enums`) |
| `title` / `summary` | text | display strings (source-derived, no PII beyond scope) |
| `correlation_id` | uuid? | groups a lifecycle (SOD task ↔ commit ↔ PR ↔ EOD) |
| `group_key` | text? | coalesces bursty micro-events (e.g., a 40-min coding block) |
| `duration_seconds` | int? | for span entries (coding/focus/meeting) |
| **`derived_from`** | jsonb | **array of source event ids** → `NFR-EXPLAIN`, `FR-TL-03` |
| `source_seq` | bigint | last applied event seq (idempotent upsert guard) |
| `sensitivity` | enum | inherited max of contributing events (P0–P4) |
| `projection_version` | int | bump → replay |

Indexes: `(organization_id, subject_user_id, day, occurred_at)` (primary read path),
`(organization_id, correlation_id)` (lifecycle stitching). No new `events` shape; adds
`TimelineEntryKind` to `@eos/shared-enums`.

## 4. Architecture & flow

A **projection** on the [05 — Event Pipeline](./05-event-pipeline.md), using its idempotent-upsert +
`derived_from` framework. The timeline is a **read model**, computed off the event log, never written to
directly by feature code.

### 4.1 Correlation model

The correlator is a set of **deterministic, pure rules** (`(state, event) → entries'`) — no wall-clock, no
LLM in the hot path — so a rebuild reproduces the same timeline byte-for-byte.

| Step | Contributing events (source) | Correlation rule |
|------|------------------------------|------------------|
| **login / SOD** | `agent.session.login`, `teams.sod.posted` | opens the day; SOD tasks parsed into lifecycle `correlationId`s (task→ticket keys) |
| **coding** | `agent.focus.*`, `ide.*` | contiguous activity within a gap threshold coalesced into one span (`group_key`) |
| **AI usage** | `ai_tool.session.*` | attached to the surrounding coding span + any linked task (`FR-AIU-01`) |
| **commit → PR** | `github.commit.pushed`, `github.pr.opened` | joined by branch/PR; ticket key in branch/commit links to the SOD task's `correlationId` (`FR-SPR-03`) |
| **review** | `github.review.*` | attached to the PR lifecycle |
| **meeting / focus** | `calendar.event.*`, `agent.focus.*` | meetings interleave; focus windows are the inverse |
| **EOD** | `teams.eod.posted` | closes the day; plan-vs-actual computed against the SOD `correlationId`s |

**Correlation keys** (in priority order): explicit `event.correlationId` → shared ticket/PR key →
`(subjectUserId, time-window)` proximity. When an event matches an existing lifecycle it **merges**
(appends its id to `derived_from`); otherwise it opens a new entry. Merging is **commutative** and
guarded by `source_seq`, so out-of-order/duplicate delivery converges to the same result.

### 4.2 Flow

```mermaid
sequenceDiagram
  autonumber
  participant BUS as EventBus (from Plan 05)
  participant TP as TimelineProjection (worker)
  participant COR as Correlator (pure rules)
  participant DB as timeline_entries (PG)
  participant WS as WS gateway
  participant SPA as feature-timeline (React)
  BUS-->>TP: DomainEvent (subjectUserId, correlationId)
  TP->>COR: apply(dayState, event)
  COR-->>TP: upsert entry(kind, derived_from += eventId)
  TP->>DB: idempotent UPSERT (source_seq guard)
  TP->>WS: emit timeline.entry.updated → org:{orgId}:user:{subjectUserId}
  WS-->>SPA: live entry (≤ 2s, NFR-LATENCY)
  Note over SPA: own timeline auto-joined; team view via subscribe + RBAC
```

### 4.3 Ports & boundaries

Timeline introduces no new adapter port — it implements the `ProjectionBuilder` base from
[Plan 05](./05-event-pipeline.md). The read side exposes a `TimelineRepository` interface (tenant-scoped,
[Data §9](../04-data-model.md#9-sequelize-conventions)); the API and any consumer depend on the interface,
not the model. `feature-timeline` (frontend) reaches the backend only through `@eos/contracts` — no
cross-scope import ([Arch §7](../03-system-architecture.md#7-dependency-rules--preventing-circular-dependencies)).

## 5. API & realtime surface

All shapes are zod schemas in `@eos/contracts`; envelope + cursor pagination + errors per
[05 — API & Realtime](../05-api-and-realtime.md). `organizationId` is never on the wire — derived from the
token ([API §2.2](../05-api-and-realtime.md#22-resource-naming)).

| Method + path | RBAC permission | Scope | Notes |
|---|---|---|---|
| `GET /api/v1/timeline?userId={me}&day=2026-07-04` | `timeline:read` (own) | `own` | self view; `userId` omitted ⇒ caller |
| `GET /api/v1/timeline?userId={other}&day=…` | `timeline:read:team\|dept\|org` | resource gate: target in caller's scope | **audited** read of another person (`FR-ENT-01`) |
| `GET /api/v1/timeline/{entryId}/evidence` | same as parent read | — | returns `derived_from` events (`FR-TL-03`) |
| `POST /api/v1/timeline/replay` | `timeline:read[:scope]` | `{ userId, day, speed? }` | opens a replay session (`FR-TL-02`); audited for non-self |

- **RBAC** ([Personas §2.2](../02-personas-and-rbac.md#22-default-role--permission-matrix-excerpt)):
  Employee `own`, Team Lead `team`, Eng Mgr `dept`, CTO `org`. **HR has no `timeline:read`** at any
  individual scope (`hrForbidden`) — HR cannot name-drill a person's day, by construction. A scope-limited
  view **narrows the query** (`FR-RBAC-04`), it does not just hide fields — a Team Lead's `?userId=` outside
  their team returns `404` (indistinguishable from "absent", `NFR-ISO`).
- **Audit** (`FR-ENT-01`): every read/replay of **another** person's timeline writes an `audit_logs` row
  (actor, subject, day, at) — enforced even for CTO/Owner ([Personas §2.2 note](../02-personas-and-rbac.md#22-default-role--permission-matrix-excerpt)).
  Reading one's **own** timeline is not audited.
- **Consent composition**: RBAC decides *who may see what exists*; **consent** decides *whether a signal
  exists at all*. A manager with `timeline:read:team` still never sees an entry from a signal the employee
  did not consent to — the more restrictive wins ([Personas §3](../02-personas-and-rbac.md#3-privacy-interaction)).

### 5.1 Replay UX contract

- `POST /timeline/replay` returns a `replaySessionId`; the client then subscribes to
  `org:{orgId}:copilot`-style… no — to a dedicated `org:{orgId}:replay:{replaySessionId}` room, or simply
  **paginates the day's ordered entries client-side** with a playback clock. MVP uses **client-side
  playback** of the fetched, ordered day (no server streaming) — the day is bounded and small; the API just
  returns entries sorted by `occurred_at` with `derived_from` inlined.
- Playback controls: play/pause, speed (`1x/2x/4x`), scrub to timestamp, and "jump to next `kind`". Each
  step surfaces the entry's evidence panel (`derived_from` → source events).
- Live vs replay: **today** streams via WS (`timeline.entry.updated`); **past days** are static reads.

### 5.2 WS event

```jsonc
{ "type": "timeline.entry.updated", "room": "org_01J…:user_01K…", "seq": 912,
  "occurredAt": "2026-07-04T10:15:03Z", "correlationId": "01J8Z…",
  "data": { "entryId": "tl_01J…", "kind": "pr", "title": "Opened PR #482",
            "derivedFrom": ["evt_01…","evt_02…"] } }
```

## 6. AI involvement (if any)

The timeline itself is built by **deterministic** correlation rules (no AI in the projection — required for
rebuildability). AI **consumes** it: the Meeting/Activity agents and the EOD drafter ([08](./08-teams-integration.md),
[13](./13-ai-agents.md)) read the correlated day as grounded input and **cite the same `derived_from`
event ids** as evidence (`FR-AI-02`, `NFR-EXPLAIN`). Any AI-drafted EOD is a separate, human-approved
artifact (`FR-TEAMS-03`, `FR-ENT-08`) — the timeline never posts anything outward.

## 7. Security, privacy & consent

Per [06 — Security, Privacy & Consent](../06-security-privacy-consent.md).

- **RBAC + audit** as in §5: individual drilldown is scope-gated and audited; HR is structurally excluded.
- **Consent** (`NFR-CONSENT`): entries only exist for consented signals; a revoked signal stops appearing
  within 1 minute (its future events are dropped at ingest per [Plan 05 §7](./05-event-pipeline.md)).
- **Sensitivity**: an entry inherits the **max** sensitivity of its contributing events; P3/P4 detail is
  redacted per the viewer's scope and never logged.
- **Tenant isolation** (`NFR-ISO`): reads flow through the tenant-scoped `TimelineRepository`; the WS room is
  `org:{orgId}`-prefixed. No code path yields another tenant's entries.
- **Right-to-erasure** (`FR-ENT-07`): because the timeline is a projection, purging a user's `events` +
  rebuilding drops their timeline; no separate deletion path to miss.

## 8. Implementation plan (phased tasks)

| # | Task | Nx project | Acceptance |
|---|------|-----------|------------|
| 1 | `timeline_entries` migration + `TimelineEntryKind` enum + repository (tenant-scoped) | `@eos/database`, `@eos/shared-enums` | migration up/down; cross-tenant negative test |
| 2 | `Correlator` pure rules (login/coding/commit→PR/meeting) + unit-tested reducers | `apps/worker` (or `@eos/events` helper) | deterministic, order-tolerant unit tests |
| 3 | `TimelineProjection` on the Plan-05 framework (idempotent upsert, `derived_from`, `source_seq`) | `apps/worker` | duplicate/out-of-order delivery converges |
| 4 | SOD↔commit↔PR↔EOD lifecycle stitching via `correlationId` / ticket keys | `apps/worker` | correlation-correctness fixture passes |
| 5 | `GET /timeline` (own + scoped other) with cursor pagination + zod contract | `apps/api`, `@eos/contracts` | contract test; RBAC scope test |
| 6 | RBAC guard + resource/ownership gate + **audit** on non-self reads | `apps/api` | HR-denied, out-of-scope→404, audit row written |
| 7 | `GET /{entryId}/evidence` (derived_from → events) | `apps/api` | evidence resolves to real events (`FR-TL-03`) |
| 8 | `POST /timeline/replay` + client-side playback contract | `apps/api`, `@eos/contracts` | replay session opens; audited for others |
| 9 | WS `timeline.entry.updated` fan-out on projection change | `apps/api` | live update p95 ≤ 2s |
| 10 | `feature-timeline` UI: chronological view, evidence panel, replay controls, tz/i18n | `@eos/feature-timeline` | component + a11y tests (`NFR-A11Y`) |
| 11 | Rebuild/replay wiring (uses Plan-05 replay) + projection_version bump path | `apps/worker` | rebuild-from-log e2e |

## 9. Testing (`unit` / `integration` / `e2e`)

Per [09 — Testing Strategy](../09-testing-strategy.md). Testcontainers for the projection/RBAC guarantees.

**Unit**
- **Correlation correctness**: fixture streams (SOD tasks + commits + PR + reviews + meeting + EOD) →
  assert entries stitch into the right lifecycles, bursty coding coalesces into one span, and AI usage
  attaches to the surrounding coding block. Shuffle input order → identical output (commutative).
- Reducer purity: no wall-clock/random; same input ⇒ same `timeline_entries`.
- React: timeline renders entries by role/text; evidence panel lists `derivedFrom`; replay controls drive
  the playback clock (`@testing-library/user-event`).

**Integration** (Testcontainers PG + Redis)
- **Projection rebuild-from-log** (`NFR-EXPLAIN`): build a day, truncate `timeline_entries`, replay → the
  rebuilt day (incl. `derived_from` and ordering) is byte-identical.
- **Idempotency**: redelivered/out-of-order events don't duplicate entries or evidence ids.
- **RBAC scope** (`FR-RBAC-04`, must-have): Employee reading another's timeline → `403`/`404`; Team Lead
  in-team → `200`, out-of-team → `404`; **HR at any individual scope → denied**; each non-self read writes
  an `audit_logs` row (assert it exists).
- **Tenant isolation** (`NFR-ISO`): org A caller never receives org B entries.
- **Evidence integrity** (`FR-TL-03`): every entry's `derived_from` ids resolve to real `events` in the
  same tenant; no dangling ids.

**E2E**
- Journey: seed a day's events → open own timeline in the web app → see correlated entries → open an
  entry's evidence → (as manager) replay a team member's day with playback controls → assert audit logged.
- **Latency** (`NFR-LATENCY`): a live event appears on the open "today" timeline p95 ≤ 2s.

**Must-have negative/security**: HR name-drill blocked; cross-scope read `404`; non-self read always
audited; revoked-consent signal disappears from the timeline within 1 minute.

## 10. Observability

Per [deployment/03 — Observability](../deployment/03-observability.md).

| Signal | Type | Alert |
|--------|------|-------|
| `timeline_apply_duration_ms` | histogram | p95 regression |
| `timeline_correlation_orphans_total` | counter | rising ⇒ a source's `correlationId`/keys are missing |
| `timeline_ws_latency_ms` | histogram | **p95 > 2s → page** (`NFR-LATENCY`) |
| `timeline_reads_total{scope=own\|team\|dept\|org}` | counter | anomaly detection on cross-user reads |
| `timeline_audited_reads_total` | counter | must track non-self reads (`FR-ENT-01`) |
| `timeline_rebuild_duration` | histogram | operator visibility on replays |

- **Logs**: one line per read (`correlationId`, actor, subject, scope, day) — never P3/P4 detail. Non-self
  reads additionally emit the audit record.
- **Traces**: the OpenTelemetry span from ingest → projection → WS (Plan 05) extends to the timeline entry,
  so a UI entry traces back to its source events.

## 11. Acceptance criteria

- [ ] A per-person/day timeline renders all sources in chronological order (login → SOD → coding → AI → commit → PR → review → meeting → EOD). → `FR-TL-01`
- [ ] Related events are correlated into coherent lifecycles (SOD task ↔ commit/PR ↔ EOD), and shuffling event arrival order does not change the result. → `FR-TL-01`
- [ ] A manager can replay a team member's day chronologically, RBAC-scoped, with playback controls. → `FR-TL-02`, `FR-RBAC-04`
- [ ] Every timeline entry links back to its source event id(s) via `derived_from`, resolvable through the evidence endpoint. → `FR-TL-03`, `NFR-EXPLAIN`
- [ ] Reading another person's timeline is permission-gated and **audited**; HR cannot name-drill an individual; out-of-scope reads return `404`. → `FR-RBAC-03/04`, `FR-ENT-01`, `NFR-ISO`
- [ ] The "today" timeline updates live within p95 ≤ 2s; the projection rebuilds byte-identically from the event log. → `NFR-LATENCY`, `NFR-EXPLAIN`

## 12. Risks & open questions

| Risk / question | Mitigation / status |
|---|---|
| Correlation false-positives (wrong events merged into one lifecycle) | Rules are conservative + evidence is always shown; users can flag a mis-correlation, feeding rule tuning. Never silently guess — prefer separate entries over a wrong merge. |
| Late-arriving events (offline agent buffer, webhook redelivery) reorder a past day | Idempotent, commutative merge + `source_seq` guard means a late event correctly re-slots on next apply; past-day WS is not needed (static read refetches). |
| Timezone/day boundaries (`NFR-I18N`) | `day` is the user's local calendar day; events stored UTC, bucketed by the user's tz at projection time; DST handled by the tz library, unit-tested. |
| Bursty micro-events (thousands of focus ticks) bloat the timeline | Coalesced into spans via `group_key` + gap threshold at projection time; raw events stay in the log for evidence. |
| Replay of a long day over WS could be heavy | MVP is **client-side** playback of a bounded, pre-fetched day — no server streaming; revisit only if days grow unbounded. |
| **Open:** should plan-vs-actual (SOD tasks vs delivered) live on the timeline or in a separate insight? | Lean: timeline shows the correlated facts; the plan-vs-actual **judgement** is a recommendation ([15](./15-recommendations.md)) citing the same entries. |

---

_Prev: [11 — AI Usage Analytics](./11-ai-usage-analytics.md) · Depends on: [05 — Event Pipeline](./05-event-pipeline.md)_
