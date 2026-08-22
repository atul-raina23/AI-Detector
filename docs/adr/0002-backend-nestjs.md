# ADR-0002 — NestJS for the backend

**Status:** Accepted

## Context

The backend is a **modular monolith** ([03 §2](../03-system-architecture.md)): one `api`
app and one `worker` app composed of well-bounded modules that must be extractable into
services later **without changing callers**. That demands callers depend on **ports**
(interfaces) — `SourceAdapter`, `EventBus`, `NotificationChannel`, `XRepository` — with
concrete adapters wired only at the composition root. This ports/adapters style needs a
first-class dependency-injection container, request-scoped context (for `TenantContext`,
[04 §5](../04-data-model.md)), and a consistent module system across HTTP, WS, and BullMQ
workers. Building that on raw Express/Fastify means hand-rolling DI, lifecycle, and
guards — reinventing a framework badly.

## Decision

Use **NestJS** for both `api` and `worker`. Its module system maps to our Nx boundaries;
its DI container wires ports to adapters at the composition root; guards/interceptors carry
cross-cutting concerns (RBAC, tenant scope, correlation IDs, error shape). The `worker` is
a headless Nest app reusing the same modules and providers. Nest sits on Express/Fastify,
so we keep Node's HTTP ecosystem.

## Consequences

**Good**

- DI makes ports/adapters and testable-by-fakes the path of least resistance.
- Request-scoped providers give us clean `TenantContext` propagation.
- Guards/interceptors/pipes standardize RBAC, validation, and the canonical error shape.
- Same framework for HTTP, WebSocket, and BullMQ processors — one mental model.

**Bad**

- Heavier and more opinionated than raw Express; decorators + DI add conceptual overhead.
- Startup and per-request overhead is higher than minimal Fastify (irrelevant at our scale).
- Team must know Nest idioms; misuse of request-scoped providers can leak memory/perf.

## Alternatives considered

- **Raw Express/Fastify** — minimal and fast, but we'd hand-build DI, module wiring, and
  guards. The ports/adapters architecture would be convention, not structure. Rejected.
- **Fastify + tsyringe/awilix** — lighter DI, but no cohesive module system spanning HTTP
  and workers; more glue to maintain. Rejected for a small team.
- **tRPC-first** — great DX for a monolith, but couples FE↔BE tightly and fights our
  multi-transport (REST + WS + SSE + webhooks) surface. Rejected.
