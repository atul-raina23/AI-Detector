# ADR-0001 — Nx monorepo

**Status:** Accepted

## Context

EngineeringOS AI is TypeScript end-to-end: React SPA (`web`), NestJS `api` and `worker`,
and a fleet of shared libraries. The single most valuable property of this stack is that
the `DomainEvent` contract, `EventType`/`EventSource` enums, and API/WS DTOs are authored
**once** and consumed by frontend, API, and worker (see
[04 — Data Model §5](../04-data-model.md)). A polyrepo would force us to publish and
version those contracts as npm packages — friction that guarantees drift. We also need
**structurally enforced** module boundaries so the modular monolith
([03 §7](../03-system-architecture.md)) can't rot into a big ball of mud.

## Decision

Use an **Nx monorepo** (npm workspaces) with `apps/*` + `libs/*`, `@eos/*` path mappings
in `tsconfig.base.json`, project `tags`, and the `@nx/enforce-module-boundaries` ESLint
rule. `nx affected` scopes CI to changed projects; `nx graph` visualizes the DAG. The Rust
desktop agent lives in `apps/desktop-agent` but builds outside the JS graph.

## Consequences

**Good**

- Shared types are a plain import (`@eos/shared-types`); refactors are atomic across FE/BE.
- Boundary tags MUST fail `nx lint` (and CI) on a violation — cycles never reach `main`.
- `nx affected` + computation caching keeps CI fast despite one large repo.
- One PR can change a contract and every consumer together — no version-skew window.

**Bad**

- Nx has a real learning curve (executors, generators, tags) and its own upgrade treadmill.
- One repo means coarse-grained access control; we can't hand out repo access per team.
- Cold cache CI and local graph computation are heavier than a small single-purpose repo.

## Alternatives considered

- **Polyrepo** — clean ownership boundaries, but contract sharing via published packages
  causes drift and slow cross-cutting changes. Rejected: contract sharing is our whole point.
- **Turborepo + npm workspaces** — great task caching, but no first-class enforced module
  boundaries or dependency-graph constraints. Nx's `enforce-module-boundaries` is the
  feature we're actually buying.
- **Lerna / raw workspaces** — task orchestration only; no boundary enforcement. Rejected.
