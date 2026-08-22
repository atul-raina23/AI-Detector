# Plan NN — <Module Name>

> One-paragraph summary of what this module does and why it exists, in plain language.

| | |
|---|---|
| **Status** | Draft v1 |
| **Phase** | Phase N (see [Roadmap](./00-roadmap-and-phasing.md)) |
| **Owner** | <team/role> |
| **Satisfies** | `FR-XXX-01`, `FR-XXX-02`, … (from [PRD](../01-product-requirements.md)) |
| **Depends on** | Plans / libs this needs (e.g. [05 — Event Pipeline](./05-event-pipeline.md)) |
| **Nx projects** | libs/apps this touches, with their boundary tags (see [10 — Boundaries](../10-shared-packages-and-boundaries.md)) |

---

## 1. Goal & scope

- **In scope:** bullet list of what this plan delivers.
- **Out of scope:** explicit non-goals (prevents scope creep; note what a later phase covers).
- **Anti-goals:** anything that would violate [Vision §4](../00-vision-and-scope.md#4-what-we-are-not-building-anti-goals).

## 2. User stories

`As a <persona>, I want <capability>, so that <outcome>.` — 3–8 stories tagged with the persona from
[02 — Personas](../02-personas-and-rbac.md) and the `FR-*` they realize.

## 3. Domain model

New/changed entities (extend [04 — Data Model](../04-data-model.md)). Table of tables/columns, or an
ERD (mermaid). Note tenant scoping, sensitivity classification (P0–P4), and any new `EventType`s added
to `@eos/shared-enums`.

## 4. Architecture & flow

How it fits the [event-first architecture](../03-system-architecture.md). Sequence/flow diagram
(mermaid). Name the **ports/interfaces** introduced (adapter contracts) and where the concrete impls
live. Call out the Nx projects and confirm no cross-boundary/cyclic deps.

## 5. API & realtime surface

Endpoints (method + path under `/api/v1`), request/response contract (reference `@eos/contracts` zod
schemas), and any WS events. Follow [05 — API & Realtime](../05-api-and-realtime.md). Note RBAC
permission required per endpoint.

## 6. AI involvement (if any)

Which agent(s) touch this (see [07 — AI Architecture](../07-ai-architecture.md)); what evidence they
cite; human-approval gates for any outward action.

## 7. Security, privacy & consent

Signal types collected and their consent requirement (`NFR-CONSENT`); RBAC scope; data sensitivity;
audit points. Reference [06 — Security](../06-security-privacy-consent.md).

## 8. Implementation plan (phased tasks)

Ordered, reviewable increments (each a small PR). For each: what, which Nx project, acceptance.
Keep tasks small enough that files stay clean (see [08 — Coding Standards](../08-coding-standards.md)).

## 9. Testing (`unit` / `integration` / `e2e`)

Per [09 — Testing Strategy](../09-testing-strategy.md): key unit tests, integration tests (incl. tenant
isolation + idempotency where relevant), and e2e journeys. List the must-have negative/security tests.

## 10. Observability

Metrics, logs, and alerts this module emits (see [deployment/03](../deployment/03-observability.md)).

## 11. Acceptance criteria

Checklist of testable conditions that mean "done." Each maps to a `FR-*`.

## 12. Risks & open questions

Known risks (rate limits, provider quirks, cost) + mitigations, and decisions still open.

---

_Template version 1. Keep sections; delete a section only with a one-line "N/A because …"._
