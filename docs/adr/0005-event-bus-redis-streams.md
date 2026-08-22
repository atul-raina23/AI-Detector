# ADR-0005 — Redis Streams as the MVP event bus

**Status:** Accepted

## Context

The core is event-first ([03 §5](../03-system-architecture.md)): normalized `Event`s are
appended to Postgres and published to a bus; worker consumers build projections and drive
AI agents. We need a durable, ordered, consumer-group-capable bus with at-least-once
delivery. We also run **everything on one VM** ([ADR-0008](./0008-deploy-single-vm-compose.md),
`NFR-COST`) and already require Redis for cache, rate limits, and BullMQ. Adding Kafka now
means ZooKeeper/KRaft, more RAM, and ops we can't justify at MVP scale — but we must not
paint ourselves into a corner if we later need Kafka's throughput and retention.

## Decision

Use **Redis Streams** as the MVP event bus, consumed via consumer groups (`XREADGROUP`,
explicit `XACK`). Publish through an **`EventBus` port** (`@eos/events`) with a Redis
Streams adapter; producers and consumers depend on the port, never on Redis. Events are
appended to Postgres and published in the same unit of work via a **transactional outbox**,
so persistence and publish don't diverge.

## Consequences

**Good**

- Zero extra containers — reuses the Redis we already run. Fits the single VM.
- Consumer groups + `XACK` give at-least-once delivery and per-group ordering.
- The `EventBus` port means switching to Kafka later is an adapter swap, no caller changes.
- Transactional outbox keeps the event log (source of truth) and the bus consistent.

**Bad**

- Redis Streams is memory-bound; long retention/replay is Postgres's job, not the stream's.
- Weaker partitioning/throughput ceiling and ecosystem than Kafka (fine for MVP, not infinite).
- At-least-once means consumers MUST be idempotent (keyed on `contentHash` — [04 §5](../04-data-model.md)).
- Redis durability (AOF/replication) must be configured deliberately or the buffer can be lost.

## Alternatives considered

- **Kafka now** — the right tool at scale (retention, partitions, throughput), but heavy to
  operate on one VM and premature. The port lets us adopt it later. Deferred, not rejected.
- **RabbitMQ / NATS** — capable brokers, but each is another container and neither is already
  in the stack. Rejected: Redis is a free reuse.
- **BullMQ as the bus** — already present, but it's a job queue, not a fan-out event log
  with replay; we keep it for jobs and use Streams for events. Rejected as the bus.
