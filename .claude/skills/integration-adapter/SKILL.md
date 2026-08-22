---
name: integration-adapter
description: Add a new external data source (GitHub/Jira/Teams/calendar/AI-tool/etc.) as a SourceAdapter that normalizes raw payloads into canonical DomainEvents, without changing anything downstream. Use when integrating a new provider.
---

# New Integration Source Adapter

References: [docs/03 architecture §8](../../../docs/03-system-architecture.md),
[docs/04 data model §5 Event](../../../docs/04-data-model.md),
[docs/07 AI](../../../docs/07-ai-architecture.md). The whole point: downstream (projections, agents,
timeline) only ever sees **canonical `DomainEvent`s**, so a new source is additive.

## The contract (port)

Implement the `SourceAdapter` port — do not leak provider shapes past it:

```ts
interface SourceAdapter<Raw = unknown> {
  provider: IntegrationProvider;                 // @eos/shared-enums
  normalize(raw: Raw, ctx: TenantContext): DomainEvent[]; // pure, deterministic
  verifySignature?(req: IncomingWebhook): boolean;        // for webhook sources
}
```

## Steps

1. **Enum first:** add the provider to `IntegrationProvider` and any new `EventType` values (e.g.
   `jira.issue.reopened`) to `@eos/shared-enums`. Add the payload type to the `DomainEvent` discriminated
   union in `@eos/shared-types`.
2. **Adapter lib:** create `libs/backend/integrations/<provider>` (see `nx-library` skill,
   `scope:backend,type:feature`). Implement `normalize()` as a **pure function** — easy to unit-test with
   recorded fixtures, no I/O.
3. **Ingress:**
   - *Webhook* sources: add a route in `apps/api` that verifies the signature (`verifySignature`), then
     hands raw payloads to the ingest service. Never trust unsigned webhooks (doc 06).
   - *Polling* sources: add a BullMQ scheduled job in `apps/worker` that fetches deltas (respect provider
     rate limits; store cursors) and feeds the ingest service.
4. **Idempotent ingest:** the shared ingest service dedups by `(source, externalId, contentHash)` and
   persists + publishes to the event bus in one transaction (outbox). You do **not** write projections
   here — existing consumers pick up the canonical events.
5. **OAuth/tokens:** store provider tokens encrypted (P4) in `oauth_tokens`; refresh via the auth lib.
6. **Consent:** gate collection on the relevant `signal_type` consent (`NFR-CONSENT`); drop events with
   no active consent.

## Tests

- Unit: feed recorded raw payloads → assert exact `DomainEvent[]` (fixtures, no network).
- Integration: post a signed webhook → assert one event persisted; post it twice → still one (idempotency).
- Contract: nock/recorded fixtures for the provider API; never hit the real service in CI.

## Checklist

- [ ] Provider + event types in shared enums; payload in the union type.
- [ ] `normalize()` pure and fixture-tested; signature verified for webhooks.
- [ ] Rate limits + cursors respected for pollers.
- [ ] Idempotent ingest; no downstream/projection code changed.
- [ ] Tokens encrypted; consent-gated. `nx lint` + `madge --circular` clean.
