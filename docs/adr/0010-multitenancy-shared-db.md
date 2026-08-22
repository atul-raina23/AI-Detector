# ADR-0010 — Shared database with row-level tenant scoping

**Status:** Accepted

## Context

EngineeringOS is multi-tenant and MUST guarantee isolation (`NFR-ISO`) while running on a
single VM at MVP (`NFR-COST`) and still scaling (`NFR-SCALE`). The tenant-count profile is
many small/medium orgs, not a few whales. The three classic models — DB-per-tenant,
schema-per-tenant, and shared-schema-with-row-scoping — trade isolation strength against
cost and operational simplicity. On one Postgres instance, hundreds of schemas or databases
mean hundreds of connection pools, migration runs, and backup targets — untenable for a
small team on one VM. See [04 §1](../04-data-model.md).

## Decision

**Shared database, shared schema, row-level tenant scoping.** Every tenant table has a
non-null indexed **`organization_id`** (leading column of hot composite indexes). Isolation
is enforced in code by a **mandatory Sequelize scope** injected from `TenantContext` via the
repository layer ([ADR-0004](./0004-orm-sequelize-repository.md)) — application code cannot
build an unscoped query. **Defense in depth:** PostgreSQL **Row-Level Security** on the most
sensitive tables via a `SET app.current_org` session variable. **Escape hatch:** because all
access goes through repositories, a large customer can later be moved to a dedicated
schema/DB with **no feature-code changes**.

## Consequences

**Good**

- One DB, one migration run, one backup target — cheapest and simplest for the single VM (`NFR-COST`).
- Cross-tenant analytics/ops queries are trivial when needed (platform-level).
- RLS gives a database-enforced backstop so a missed scope still can't cross tenants (`NFR-ISO`).
- Repository seam makes the future move to per-tenant isolation contained (`NFR-SCALE`).

**Bad**

- Isolation is **logical, not physical** — a bug or a raw query that bypasses the repo is the
  worst-case blast radius; RLS narrows it but discipline + review remain load-bearing.
- **Noisy-neighbor** risk: one tenant's heavy load contends for shared DB resources.
- Per-tenant restore is awkward (row-level export/import, not a schema/DB restore).
- Every hot query and index must lead with `organization_id` or performance/isolation suffers.

## Alternatives considered

- **Schema-per-tenant** — stronger isolation and easy per-tenant restore, but N schemas × N
  migrations, and connection/pool pressure that doesn't fit one VM at scale. Kept as the
  **escape-hatch** target for large tenants, not the default. Deferred.
- **Database-per-tenant** — strongest isolation, but heaviest ops and cost; reserved for
  enterprise/regulated tenants later. Deferred.
- **Shared schema, no RLS** — cheapest, but relies solely on app scope with no DB backstop.
  Rejected: `NFR-ISO` warrants defense in depth on sensitive tables.
