---
name: sequelize-migration
description: Create a Sequelize migration + model + tenant-scoped repository the repo's way — snake_case DB, camelCase TS, org-scoped, indexed, never sequelize.sync(). Use whenever the database schema changes.
---

# Sequelize Migration & Model

Reference: [docs/04 data model §9](../../../docs/04-data-model.md). Migrations are the **only** way the
schema changes in any shared environment.

## Rules

- **Migrations only** — never `sequelize.sync()` outside a local scratch DB. Migrations run in CI and on
  deploy (one-shot `migrate` service, see [deployment/01](../../../docs/deployment/01-docker-compose.md)).
- Every tenant table: non-null **`organization_id`** FK, indexed, and as the **leading column** of hot
  composite indexes. Consider a Postgres **RLS** policy on sensitive tables (defense in depth).
- **snake_case** columns in DB, **camelCase** in TS (`underscored: true`). UUID **v7** PKs.
  `timestamptz` UTC timestamps. Integers for money (cents) / durations (seconds). `jsonb` for flexible
  payloads — promote to a real column once it's filtered on.
- Reversible: implement both `up` and `down`. Additive, backward-compatible changes preferred (add
  column nullable → backfill → enforce) so deploys don't break the running app.
- Extend the shared **`TenantModel`** base for tenant tables (adds org scope + timestamps + default scope).

## Steps

1. Generate: `npx sequelize-cli migration:generate --name <verb>-<subject>` (into
   `libs/backend/database/migrations`). Name like `add-stale-flag-to-pr-metrics`.
2. Write `up`/`down` with explicit column types, FKs, and **indexes** (lead with `organization_id`).
3. Add/update the model under `libs/backend/database/src/models/` extending `TenantModel`; keep it small
   (columns + associations only, no business logic).
4. Expose access through a **repository** (interface + impl) — business code depends on the interface,
   never the model directly (prevents coupling/cycles).
5. Run locally: `npx sequelize-cli db:migrate` then `db:migrate:undo` to prove `down` works.
6. Add an **integration test** (Testcontainers Postgres) that runs the migration and verifies tenant
   scoping + the new index is used (`EXPLAIN`).

## Checklist

- [ ] `up` **and** `down` both correct; change is backward-compatible for zero-downtime deploy.
- [ ] `organization_id` present, indexed, leading composite column; RLS if sensitive.
- [ ] snake_case DB / camelCase TS; UUIDv7 PK; timestamptz.
- [ ] Model extends `TenantModel`, no logic; access via repository interface.
- [ ] Integration test (real Postgres) incl. tenant-isolation assertion.
