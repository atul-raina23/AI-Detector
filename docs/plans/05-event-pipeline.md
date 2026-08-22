# Plan 05 — Realtime Event Pipeline

> The spine of the platform. Every signal — desktop agent, GitHub/Jira/Teams webhook, calendar poll —
> is normalized into one canonical `DomainEvent`, ingested **idempotently**, persisted append-only,
> published to the event bus through a **transactional outbox**, and consumed by worker **projection**
> builders that are idempotent and rebuildable from the log. Changed read models fan out to the UI over
> WebSocket/SSE within ~2s. Nothing downstream knows or cares which source an event came from.

| | |
|---|---|
| **Status** | Draft v1 |
| **Phase** | Phase 1 (Foundations) (see [Roadmap](./00-roadmap-and-phasing.md)) |
| **Owner** | Platform Eng |
| **Satisfies** | `FR-EVT-01`, `FR-EVT-02`, `FR-EVT-03`, `FR-EVT-04` (from [PRD](../01-product-requirements.md)); `NFR-LATENCY`, `NFR-EXPLAIN`, `NFR-ISO` |
| **Depends on** | [02 — Multi-Tenancy](./02-multi-tenancy.md), [03 — RBAC](./03-rbac.md); consumed by [06 — GitHub](./06-github-integration.md), [12 — Daily Timeline](./12-daily-timeline.md), all metric projections |
| **Nx projects** | `libs/backend/events` (`@eos/events`, `scope:backend type:infra`), `libs/backend/database` (`@eos/database`, `type:infra`), `apps/api` (ingest + WS gateway), `apps/worker` (consumers), `libs/shared/{types,enums,contracts}` (`scope:shared`) |

---

## 1. Goal & scope

- **In scope:**
  - The canonical `DomainEvent` **normalization** contract — the `SourceAdapter` port every source implements.
  - **Idempotent ingest** keyed on `(organizationId, source, externalId, contentHash)` (`FR-EVT-02`).
  - **Transactional outbox** → publish to the `EventBus` port (Redis Streams impl; Kafka-swappable).
  - Worker **consumer groups** and the **projection** builder framework (idempotent, rebuildable).
  - **Replay / backfill** from the append-only log; **DLQ** + poison-message handling.
  - **Ordering / partitioning** semantics; WS/SSE **fan-out** to the UI within ~2s (`NFR-LATENCY`).
- **Out of scope:**
  - Concrete source adapters (GitHub → [06](./06-github-integration.md), Jira → [07](./07-jira-integration.md),
    agent → [04](./04-desktop-agent.md), calendar → [09](./09-calendar-integration.md)). This plan defines the **port** they plug into.
  - Concrete projections' business columns (timeline → [12](./12-daily-timeline.md), PR/DORA → [06](./06-github-integration.md)).
    This plan defines the **projection framework** and the rebuild machinery.
  - AI agent reactions to events → [13](./13-ai-agents.md).
- **Anti-goals:** no full event-sourcing framework (Axon/EventStoreDB), no CQRS command bus, no Kafka in
  the MVP — see [Vision §4](../00-vision-and-scope.md#4-what-we-are-not-building-anti-goals) and
  [Arch §5](../03-system-architecture.md#5-event-first-core). We keep an append-only log + Sequelize
  projections, nothing heavier.

## 2. User stories

- `As the platform, I want every source to hand me one canonical Event shape, so that projections and agents never branch on source.` — `FR-EVT-01`
- `As an integration author, I want to implement a single SourceAdapter port, so that I can add a source without touching the core.` — `FR-EVT-01`, `FR-ENT-05`
- `As an Ops engineer, I want redelivered webhooks and agent-buffer replays to be harmless, so that at-least-once delivery never double-counts.` — `FR-EVT-02`
- `As a Platform engineer, I want to rebuild any projection from the event log, so that a projection bug is a redeploy + replay, not data loss.` — `NFR-EXPLAIN`, `FR-EVT-03`
- `As an Engineer, I want my dashboard and timeline to update within ~2s of something happening, so that it feels live.` — `FR-EVT-04`, `NFR-LATENCY`
- `As an SRE, I want poison messages quarantined in a DLQ with context, so that one bad event never stalls a consumer group.` — `FR-EVT-03`

## 3. Domain model

Extends [04 — Data Model §5–6](../04-data-model.md). No change to the canonical `events` table shape
(defined there); this plan adds the **outbox**, the **consumer checkpoint**, and the **DLQ** tables, plus
the projection bookkeeping columns.

| Table | Key columns | Notes |
|-------|-------------|-------|
| `events` (existing, §5) | `id` (uuidv7), `organization_id`, `subject_user_id?`, `type`, `source`, `occurred_at`, `ingested_at`, `external_id?`, `content_hash`, `payload` (jsonb), `correlation_id?`, `sensitivity` | append-only, month-partitioned on `occurred_at`. **Unique** `(organization_id, source, external_id, content_hash)` → idempotent ingest. |
| `event_outbox` | `id` (uuidv7), `event_id` FK, `organization_id`, `stream`, `partition_key`, `published_at?`, `attempts`, `status` (`pending`/`published`/`failed`) | written **in the same DB transaction** as the event; a relay drains it to the bus. |
| `consumer_checkpoints` | `consumer_group`, `stream`, `partition`, `last_event_id`, `last_seq`, `updated_at` | per group×partition high-water mark; enables resume + replay bounds. |
| `event_dlq` | `id`, `organization_id`, `event_id?`, `consumer_group`, `raw` (jsonb), `error`, `attempts`, `first_seen_at`, `last_seen_at`, `status` (`open`/`retried`/`discarded`) | poison messages; replayable after fix. |
| projection rows (each read model, §6 of doc 04) | `…`, `derived_from` (jsonb: event ids), `source_seq`, `projection_version` | `derived_from` powers `NFR-EXPLAIN`; `source_seq` guards out-of-order idempotency. |

New `EventType`/`EventSource` values are **not** added here — each source plan adds its own to
`@eos/shared-enums`. This plan owns the **envelope** type only:

```ts
// @eos/shared-types — canonical envelope (mirrors DB; see doc 04 §5)
export interface DomainEvent<T extends EventType = EventType> {
  id: string; organizationId: string; subjectUserId: string | null;
  type: T; source: EventSource; occurredAt: string; ingestedAt: string;
  externalId: string | null; contentHash: string;
  payload: EventPayloadMap[T];      // discriminated union keyed on `type`
  correlationId: string | null; sensitivity: Sensitivity;
}
```

## 4. Architecture & flow

Realizes [Arch §5 (event-first core)](../03-system-architecture.md#5-event-first-core) and
[§8 (how a new source plugs in)](../03-system-architecture.md#8-how-a-new-integrationagent-plugs-in-extensibility).

### 4.1 Ports (adapter contracts)

Both live in `@eos/events` (or `@eos/backend-core` for the port types); concrete impls are wired only in
the app composition roots (never imported sibling-to-sibling — [Arch §7](../03-system-architecture.md#7-dependency-rules--preventing-circular-dependencies)).

```ts
// port — every source implements this; pure, unit-testable normalize()
export interface SourceAdapter<Raw = unknown> {
  readonly source: EventSource;
  /** raw provider payload → 0..n canonical events; MUST be deterministic (pure). */
  normalize(raw: Raw, ctx: IngestContext): DomainEvent[];
}

// port — the bus; Redis Streams impl for MVP, Kafka impl later, no caller change
export interface EventBus {
  publish(events: DomainEvent[], opts: { stream: string; partitionKey: string }): Promise<void>;
  subscribe(group: string, stream: string, handler: EventHandler): Subscription;
}
```

`contentHash` is computed by a **shared canonicalizer** (`@eos/shared-utils`: stable JSON key sort →
sha256) so the same logical event always hashes identically regardless of source key ordering
(`FR-EVT-02`).

### 4.2 End-to-end flow

```mermaid
sequenceDiagram
  autonumber
  participant SRC as Source (agent / webhook)
  participant API as apps/api ingest
  participant ADP as SourceAdapter.normalize()
  participant DB as Postgres (events + outbox)
  participant REL as Outbox relay
  participant BUS as EventBus (Redis Streams)
  participant WRK as apps/worker consumer group
  participant PRJ as Projection builder
  participant WS as WS/SSE gateway
  SRC->>API: raw batch (Idempotency-Key, per-item contentHash)
  API->>ADP: normalize(raw)
  ADP-->>API: DomainEvent[]
  API->>DB: BEGIN; INSERT events ON CONFLICT DO NOTHING; INSERT outbox; COMMIT
  Note over API,DB: dedup by (org,source,externalId,contentHash) — FR-EVT-02
  API-->>SRC: 202 { accepted, duplicate, rejected }
  REL->>DB: poll outbox WHERE status=pending
  REL->>BUS: XADD stream * event (partition by partitionKey)
  REL->>DB: mark outbox published
  BUS-->>WRK: XREADGROUP (consumer group)
  WRK->>PRJ: apply(event) — idempotent upsert, checkpoint
  PRJ->>DB: UPSERT projection row (+derived_from)
  PRJ->>WS: emit change to org:{orgId}:… room
  WS-->>SRC: (client) live update ≤ 2s — NFR-LATENCY
```

**Why the outbox.** Publishing to Redis and writing the event are two systems; a crash between them
either loses an event or double-publishes. Writing the event **and** an `event_outbox` row in one Postgres
transaction makes the DB the single source of truth; a relay drains the outbox with at-least-once delivery.
The `EventBus` port means the relay's Redis Streams target swaps to Kafka topics later with zero change to
publishers or consumers (ADR-0005).

### 4.3 Nx boundaries

`@eos/events` sits in the `backend/infra` layer — depends only on `shared/*` + `backend/core`. Source
plans (`type:feature`) depend on the `SourceAdapter` **port**, not on each other. `apps/api` wires the
ingest controllers + outbox relay; `apps/worker` wires consumer groups + projection processors. `nx graph`
stays a DAG; `nx lint` fails CI on any cycle.

## 5. API & realtime surface

Ingest wire contracts are owned by [05 — API & Realtime §6](../05-api-and-realtime.md#6-ingest-endpoints);
this plan implements them. All shapes are zod schemas in `@eos/contracts`.

| Method + path | Auth | RBAC / guard | Purpose |
|---|---|---|---|
| `POST /api/v1/ingest/agent` | Device token | device→`(org,user)`; consent-gated per item | agent batch → normalize → ingest (`FR-AGENT-04`) |
| `POST /api/v1/webhooks/{provider}` | HMAC signature | signature verify (no JWT) | provider webhook → enqueue normalize job → `202` |
| `POST /api/v1/admin/events/replay` | Bearer JWT | `events:replay` (Owner/CTO) | operator replay/backfill a window into a consumer group |
| `GET /api/v1/admin/dlq` / `POST …/dlq/{id}/retry` | Bearer JWT | `events:dlq:manage` | inspect + requeue poison messages |

- Ingest handlers are **thin**: verify → (webhook) enqueue BullMQ normalize job → `202`; (agent) normalize
  inline → transactional insert → per-item outcome. Heavy work never blocks the caller
  ([API §6.2](../05-api-and-realtime.md#62-inbound-webhooks-github--jira--teams-fr-gh-06)).
- Both accept an `Idempotency-Key` (24h Redis dedup, [API §2.6](../05-api-and-realtime.md#26-idempotency-keys-for-writes)) as the
  **transport-level** guard; the `contentHash` unique index is the **durable** guard. Belt and suspenders.
- **Realtime fan-out** uses the WS envelope from [API §5.3](../05-api-and-realtime.md#53-event-message-schema):
  a projection change emits `{ type, room: "org:{orgId}:…", seq, occurredAt, correlationId, data }` to the
  RBAC-scoped room. WS is a **change signal**, not a durable log — clients resync via REST on a `seq` gap
  ([API §5.5](../05-api-and-realtime.md#55-reconnection--backpressure)).

## 6. AI involvement (if any)

N/A directly — the pipeline is source-agnostic infrastructure. It is the **substrate** AI agents subscribe
to: agents ([13](./13-ai-agents.md)) consume the same `EventBus`/projections and cite `derived_from` event
ids as evidence (`NFR-EXPLAIN`). No AI runs inside ingest or projection hot paths (keeps `NFR-LATENCY`).

## 7. Security, privacy & consent

Per [06 — Security, Privacy & Consent](../06-security-privacy-consent.md).

- **Consent at collection time** (`NFR-CONSENT`): the agent ingest path drops any item whose `signalType`
  lacks an active `consents` row **before persistence**, reporting it per-item as `rejected`. Nothing
  unconsented ever reaches `events` ([Data §8](../04-data-model.md#8-integration--consent-tables)).
- **Tenant isolation** (`NFR-ISO`): every event carries `organizationId`; the outbox `partitionKey` and WS
  room are prefixed `org:{orgId}`, so cross-tenant fan-out is structurally impossible. Replay/backfill
  endpoints are org-scoped by the caller's token — an operator cannot replay another tenant's log.
- **Sensitivity**: each event carries `P0..P4`; P3/P4 payload fields are encrypted at rest and never
  logged. Webhook **raw bodies** are read for HMAC before parse and are not persisted beyond the DLQ
  (where they are scrubbed of P3/P4 fields).
- **Audit** (`FR-ENT-01`): replay, backfill, and DLQ retry/discard write `audit_logs` rows (actor, window,
  consumer group, event count).

## 8. Implementation plan (phased tasks)

Each row is a small, reviewable PR.

| # | Task | Nx project | Acceptance |
|---|------|-----------|------------|
| 1 | `DomainEvent` envelope type + `contentHash` canonicalizer | `shared/{types,utils}` | pure unit tests; stable hash across key reorder |
| 2 | `events` table migration (partitioned, unique index) + repository | `@eos/database` | migration up/down; cross-tenant negative test |
| 3 | `SourceAdapter` + `EventBus` ports; Redis Streams `EventBus` impl | `@eos/events` | publish/subscribe integration test on Testcontainers Redis |
| 4 | `event_outbox` table + transactional `ingestEvents()` (insert event + outbox in one tx) | `@eos/database`, `@eos/events` | idempotency integration test (double insert → one row) |
| 5 | Outbox relay (poll → XADD → mark published; at-least-once) | `apps/api` (or worker) | crash-between-write-and-publish test → no loss |
| 6 | Consumer-group runtime + `consumer_checkpoints` + projection framework (`ProjectionBuilder` base) | `apps/worker` | apply/resume/checkpoint integration test |
| 7 | Idempotent projection upsert helper (`source_seq` guard, `derived_from`) | `@eos/events`, `apps/worker` | out-of-order + duplicate delivery → same final state |
| 8 | Agent ingest controller (consent-gated, per-item outcome) | `apps/api` | contract test; consent-drop test |
| 9 | Webhook ingest controllers (HMAC verify → enqueue normalize job) | `apps/api` | bad-signature `401`; redelivery harmless |
| 10 | DLQ + poison-message handling (max attempts → quarantine) | `apps/worker` | poison event → DLQ, group not stalled |
| 11 | Replay / backfill command + admin endpoints (`events:replay`) | `apps/api`, `apps/worker` | projection rebuild-from-log e2e |
| 12 | WS/SSE fan-out on projection change (`seq`, room scoping) | `apps/api` | latency test p95 ≤ 2s |
| 13 | Metrics/traces/alerts wiring | all | dashboards live (see §10) |

## 9. Testing (`unit` / `integration` / `e2e`)

Per [09 — Testing Strategy](../09-testing-strategy.md). Idempotency and rebuild are **integration**
guarantees proven against real Postgres/Redis via **Testcontainers** (never SQLite).

**Unit**
- `normalize()` for each stub adapter: raw → deterministic `DomainEvent[]`; malformed raw → typed error.
- `contentHash` canonicalizer: key reordering / whitespace yields identical hash; semantic change differs.
- Projection `apply()` pure reducers: `(state, event) → state'` is deterministic and order-tolerant.

**Integration** (Testcontainers PG + Redis)
- **Idempotency** (`FR-EVT-02`): ingest the same event twice (and via concurrent inserts) → exactly one
  `events` row, one outbox row, projection counted once. Webhook redelivery + agent buffer-replay both covered.
- **Transactional outbox**: kill the process between event-insert and publish → on restart the relay
  publishes exactly once; no event is lost and none is double-projected (checkpoint dedups).
- **Projection rebuild-from-log** (`NFR-EXPLAIN`): seed N events, build projection, **truncate** the read
  model, run replay for the org/window, assert the rebuilt projection is byte-identical (incl. `derived_from`).
- **Ordering / partitioning**: events with the same `partitionKey` (e.g., a PR's lifecycle
  `correlationId`) are delivered in `occurred_at` order to one consumer; out-of-order arrivals still
  converge via `source_seq` guard.
- **DLQ / poison**: an event whose handler always throws is quarantined after `maxAttempts`; the consumer
  group keeps making progress on the rest of the stream; DLQ retry after "fix" succeeds.
- **Tenant isolation** (`NFR-ISO`): a consumer/replay for org A never observes org B's stream; cross-tenant
  negative test on the events repository.

**E2E**
- **Latency** (`NFR-LATENCY`, `FR-EVT-04`): post an ingest, assert a subscribed WS client receives the
  projection update with **p95 ≤ 2s** over a burst; assert a `seq` gap triggers REST resync.
- Full journey: webhook → normalize → project → WS push visible in the seeded web app.

**Must-have negative/security**: bad HMAC → `401`+dropped; unconsented signal → `rejected`, never
persisted; cross-tenant replay attempt → `404`/`403`.

## 10. Observability

Per [deployment/03 — Observability](../deployment/03-observability.md). Metrics carry `org`, `source`,
`stream`, `consumer_group`, `event_type` labels.

| Signal | Type | Alert |
|--------|------|-------|
| `ingest_events_total{outcome=accepted\|duplicate\|rejected}` | counter | rejected-rate spike |
| `outbox_pending_gauge`, `outbox_relay_lag_seconds` | gauge | pending > 1k or lag > 30s |
| `consumer_lag_events{group,stream}` | gauge | lag > threshold (fan-out falling behind) |
| `projection_apply_duration_ms` | histogram | p95 regression |
| `ingest_to_ws_latency_ms` | histogram | **p95 > 2s → page** (`NFR-LATENCY`) |
| `dlq_size{group}` | gauge | any non-zero → warn; growing → page |
| `event_replay_total` / `replay_duration` | counter/histogram | operator visibility |

- **Logs**: one structured line per ingest batch and per projection apply, carrying `correlationId`
  (propagated from the request onto the event and every downstream job — [API §11](../05-api-and-realtime.md#11-api-observability-nfr-obs)),
  never P3/P4 payload fields.
- **Traces**: one OpenTelemetry trace spans `request → outbox → bus → consumer → projection → WS emit`, so a
  UI number traces back to the exact event ids.

## 11. Acceptance criteria

- [ ] Every source produces canonical `DomainEvent`s via a `SourceAdapter`; projections never branch on `source`. → `FR-EVT-01`
- [ ] Re-ingesting the same signal (webhook redelivery, agent replay, concurrent insert) yields exactly one persisted event and no double-counting. → `FR-EVT-02`
- [ ] Events are persisted and published in one unit of work (outbox); no crash window loses or double-publishes an event. → `FR-EVT-02`, `FR-EVT-03`
- [ ] The pipeline fans each event to persistence, projections, and the agent-subscribable bus. → `FR-EVT-03`
- [ ] Any projection can be rebuilt from `events` to a byte-identical state, with `derived_from` populated. → `NFR-EXPLAIN`, `FR-EVT-03`
- [ ] A poison message is quarantined to the DLQ without stalling its consumer group; it is replayable after a fix. → `FR-EVT-03`
- [ ] A projection change reaches a subscribed WS client with **p95 ≤ 2s** of ingestion. → `FR-EVT-04`, `NFR-LATENCY`
- [ ] Unconsented signals are dropped before persistence; cross-tenant replay/fan-out is impossible. → `NFR-CONSENT`, `NFR-ISO`

## 12. Risks & open questions

| Risk / question | Mitigation / status |
|---|---|
| Redis Streams is not a durable Kafka; consumer restarts / trims could lose in-flight messages | Postgres `events` is the source of truth + `consumer_checkpoints`; a group can always replay from the log. WS is only a change signal. |
| Ordering across partitions is not global | We only guarantee **per-partition** order (partition by `correlationId`/subject). Projections are commutative or `source_seq`-guarded so global order isn't required. |
| Outbox relay is a single point of throughput | Relay is horizontally shardable by `partitionKey` range; `SELECT … FOR UPDATE SKIP LOCKED` lets multiple relays drain safely. |
| Projection version bump requires a full replay | `projection_version` column + online rebuild into a shadow table, then atomic swap — no downtime. Backfill throttled to respect `NFR-COST`. |
| `contentHash` must be stable across adapter refactors | Canonicalizer is versioned + unit-pinned; changing it is a deliberate migration, not incidental. |
| **Open:** do we need per-org stream isolation on Redis, or is one stream with `org` in the key enough for MVP? | Default to shared streams + `org`-prefixed partition keys; revisit if a noisy tenant starves others (`NFR-SCALE`). |

---

_Next: [06 — GitHub Integration](./06-github-integration.md) · Related: [12 — Daily Timeline](./12-daily-timeline.md)_
