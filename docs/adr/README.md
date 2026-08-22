# Architecture Decision Records

An **ADR** captures a single significant, hard-to-reverse architectural choice: the
context that forced the decision, the decision itself, and the consequences (good and
bad) we accept by making it. They are the "why" behind
[03 — System Architecture](../03-system-architecture.md) and
[04 — Data Model](../04-data-model.md); when a future engineer questions a choice, the
answer lives here.

Format: [MADR](https://adr.github.io/madr/). Status values: `Proposed` → `Accepted` →
`Superseded` (an ADR is never edited to reverse a decision — a new one supersedes it).
RFC-2119 keywords (MUST/SHOULD/MAY) carry their normal weight.

| # | Decision | Status |
|---|----------|--------|
| [0001](./0001-monorepo-nx.md) | Nx monorepo over polyrepo/Turborepo — shared types, enforced module boundaries, `nx affected` | Accepted |
| [0002](./0002-backend-nestjs.md) | NestJS over raw Express/Fastify — DI enables ports/adapters and a modular monolith | Accepted |
| [0003](./0003-frontend-react-vite.md) | React + Vite SPA over Next.js — no SSR needed for an authed dashboard | Accepted |
| [0004](./0004-orm-sequelize-repository.md) | Sequelize behind a repository layer — models don't leak, ORM swap is contained | Accepted |
| [0005](./0005-event-bus-redis-streams.md) | Redis Streams as MVP event bus behind an `EventBus` port — Kafka later, no caller changes | Accepted |
| [0006](./0006-ai-orchestration-langgraph.md) | LangGraph.js for stateful multi-agent orchestration in-language | Accepted |
| [0007](./0007-vector-db-qdrant.md) | Qdrant for RAG — self-hostable, per-tenant isolation, rich filtering | Accepted |
| [0008](./0008-deploy-single-vm-compose.md) | Single GCP VM + Docker Compose over Kubernetes for MVP — fits the $300 credit | Accepted |
| [0009](./0009-event-sourced-projections.md) | Append-only event log + rebuildable projections, not full CQRS/ES | Accepted |
| [0010](./0010-multitenancy-shared-db.md) | Shared DB + mandatory `organizationId` scope (+ optional RLS) over schema/DB-per-tenant | Accepted |
