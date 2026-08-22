# ADR-0004 — Sequelize behind a repository layer

**Status:** Accepted

## Context

The brief fixes **Sequelize + PostgreSQL** as the ORM ([README tech stack](../README.md)).
Sequelize's Active Record models are easy to leak: if feature code imports models and calls
`Model.findAll()` directly, two guarantees break — (1) mandatory `organizationId` tenant
scope ([04 §5](../04-data-model.md), `NFR-ISO`) becomes a habit instead of a property of
the code, and (2) a future ORM swap (or moving a large tenant to a separate DB) touches
every feature. We must contain the ORM.

## Decision

Wrap Sequelize in a **repository pattern**. Feature modules depend on `XRepository`
**interfaces** (in `@eos/backend-core` or the feature's port), never on Sequelize models.
Every tenant model extends a shared **`TenantModel`** base that injects the tenant scope
from `TenantContext`; repositories expose `findForTenant(...)`-style methods that cannot be
called without a tenant. Schema changes go through **migrations only** — never
`sequelize.sync()` above local scratch ([04 §9](../04-data-model.md)).

## Consequences

**Good**

- Tenant scoping is enforced at the seam — application code can't build an unscoped query.
- Business logic is testable with in-memory fake repositories (no DB in unit tests).
- Models stay out of feature code, so an ORM swap or per-tenant DB move is contained.
- No cross-module model imports → one fewer source of hidden coupling and circular deps.

**Bad**

- Extra indirection: every entity needs a repository interface + Sequelize implementation.
- Sequelize's TypeScript story is weaker than Prisma/Drizzle; typing repositories takes care.
- Discipline required — nothing stops a lazy import of a model except code review + lint.

## Alternatives considered

- **Prisma** — best-in-class types and DX, but off-brief, owns its own migration/engine
  model, and its client is awkward to hide behind a clean repository port. Rejected (brief).
- **TypeORM** — closest Sequelize substitute with decorators + a `Repository` abstraction,
  but historically shakier migrations/maintenance. Rejected (brief; no clear win).
- **Sequelize used directly in features** — least code now, but leaks the ORM and makes
  `NFR-ISO` a convention. Rejected: the whole point is containment.
