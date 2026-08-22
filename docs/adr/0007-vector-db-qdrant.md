# ADR-0007 — Qdrant for RAG vectors

**Status:** Accepted

## Context

The RAG knowledge base ([14 — RAG](../plans/14-rag-knowledge.md), [04 §7](../04-data-model.md))
embeds `document_chunks` and retrieves them for cited Copilot answers. Two hard constraints:
(1) **tenant isolation** — a retrieval MUST NOT cross organizations (`NFR-ISO`), so we need
per-tenant collections or a mandatory `organization_id` payload filter plus RBAC `audience`
filtering; and (2) **self-hostable on the single VM** (`NFR-COST`) — no per-vector SaaS
bill, no data leaving our infra. We also want strong metadata filtering fused with vector
search, since retrieval is always scoped by tenant, audience, and often document/source.

## Decision

Use **Qdrant** as a Docker Compose service on the VM ([03 §4](../03-system-architecture.md)).
One **collection per tenant** (or a shared collection with a mandatory `organization_id`
payload filter), with `document_chunks.qdrant_point_id` linking chunks to points. Retrieval
always applies tenant + `audience` filters.

## Consequences

**Good**

- Self-hosted container — fits the single VM, no per-query SaaS cost, data stays in our infra.
- Rich payload filtering fused with ANN search — tenant + RBAC audience scoping is native.
- Per-tenant collections give a clean, provable isolation boundary for `NFR-ISO`.
- Good TS client and horizontal-scaling path (sharding/replication) if we outgrow the VM.

**Bad**

- Another stateful service to run, back up, and keep in sync with Postgres (the source of truth).
- Many-small-tenant collections have per-collection overhead; the shared-collection+filter
  mode trades some isolation strength for efficiency — a real tradeoff we pick per plan tier.
- Reindexing on embedding-model changes is a bulk operation we must budget for.

## Alternatives considered

- **pgvector** — one fewer service (lives in Postgres we already run), but filtering + ANN at
  scale and per-tenant isolation are weaker, and it competes with OLTP for DB resources.
  Reconsider if vector volume stays tiny. Rejected for now on isolation + scaling headroom.
- **Pinecone / managed** — zero ops, but a recurring SaaS bill against the $300 credit and
  tenant data leaving our VM. Rejected on `NFR-COST` and data residency.
- **Weaviate / Milvus** — capable, but heavier to operate; Qdrant is the lightest strong fit. Rejected.
