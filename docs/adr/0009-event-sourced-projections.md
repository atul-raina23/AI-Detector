# ADR-0009 — Append-only event log + rebuildable projections

**Status:** Accepted

## Context

The product's core promise is **explainability**: for every metric and recommendation we
must answer *"why is this number what it is"* (`NFR-EXPLAIN`,
[03 §5](../03-system-architecture.md)). That requires the raw inputs behind every derived
value to be durable and reconstructable. A pure CRUD model destroys history — an
overwritten row can't explain itself. At the other extreme, a full CQRS/event-sourcing
**framework** (aggregates, command handlers, event-store tooling, sagas) brings ceremony
and operational weight we can't justify on a single VM at MVP.

## Decision

Adopt a **pragmatic middle**: an **append-only `events` table** (the canonical `DomainEvent`,
[04 §5](../04-data-model.md)) is the source of truth; **projections** (`timeline_entries`,
`pr_metrics`, `dora_metrics`, …) are **read models built by idempotent worker consumers and
fully rebuildable from the log** ([04 §6](../04-data-model.md)). Projections and config use
**plain Sequelize models** — no event-store framework, no aggregate/command layer. Each
projection row carries `derived_from` (event ids / query descriptor) so the UI can show the
evidence. Recommendations store `evidence` the same way.

## Consequences

**Good**

- Any metric is reproducible and auditable from the log → `NFR-EXPLAIN` is structural, not bolted on.
- Projections are disposable: fix a bug in the logic, replay, get correct read models — no migration.
- `events` partitioned by month makes retention a partition drop ([04 §11](../04-data-model.md)).
- Keeps ordinary Sequelize ergonomics for reads/config — no framework tax on the hot path.

**Bad**

- Storage grows with the log; we lean on partitioning + retention to keep it cheap.
- Eventual consistency: projections lag ingest; the UI must tolerate brief staleness.
- We hand-roll replay/rebuild tooling and idempotency instead of getting it from a framework.
- No aggregate-level invariants/optimistic concurrency — we don't get ES's write-side guarantees.

## Alternatives considered

- **Full CQRS/ES framework** (e.g. EventStoreDB, Marten-style) — strongest guarantees and
  tooling, but operational and cognitive weight far beyond a one-VM MVP. Rejected as premature.
- **CRUD-only** — simplest to build, but overwrites history and makes `NFR-EXPLAIN` impossible.
  Rejected: it defeats the product's core promise.
- **Log everything as an audit table alongside CRUD** — duplicate writes that drift; the log
  isn't the source of truth so projections can't be trusted rebuilds. Rejected.
