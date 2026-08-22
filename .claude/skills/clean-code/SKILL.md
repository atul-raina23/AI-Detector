---
name: clean-code
description: Apply EngineeringOS clean-code standards when writing or reviewing any TypeScript in this repo — small focused files, thin layers, no magic strings, no cross-boundary/circular imports. Use before adding code and during code review.
---

# Clean Code (EngineeringOS)

Authoritative reference: [docs/08-coding-standards.md](../../../docs/08-coding-standards.md). This skill
is the fast checklist. **Readability first. Small files. No cleverness.**

## Hard limits (SHOULD; justify any exception in the PR)

- **File ≤ ~200 lines.** If it grows, split by responsibility. One primary export per file.
- **Function ≤ ~40 lines**, ≤ 4 params (use an options object beyond that).
- **No `any`.** Use `unknown` + narrowing. `strict` is on.
- **No magic strings/numbers.** Enums → `@eos/shared-enums`; constants → `@eos/shared-constants`.
- **Validate at boundaries** with zod schemas from `@eos/contracts`.

## Layering (keeps files small + prevents cycles)

- **Controller** → validates input, calls a service, maps to DTO. No business logic. No DB.
- **Service** → orchestrates domain logic. Depends on repository/port **interfaces**, never on models
  or other feature modules directly.
- **Repository** → owns persistence (Sequelize). Always tenant-scoped. Returns domain types.
- **React component** → presentation + hooks only. Data via TanStack Query hooks in `@eos/frontend-data`.
  No business logic, no direct fetch.

## Imports & boundaries (prevents circular deps that break deploys)

- Import shared code via `@eos/*` path aliases only.
- `shared/*` imports nothing internal (it's the leaf). `frontend/*` ↮ `backend/*` (meet at `@eos/contracts`).
- A feature module never imports another feature module or its model. Shared needs go **down** a layer.
- Avoid barrel files that mix runtime + types across boundaries — a common cycle source. Prefer direct
  file imports. Run `nx lint` (enforces `@nx/enforce-module-boundaries`) and `npx madge --circular` before pushing.

## Do / Don't

| Do | Don't |
|----|-------|
| `if (status === EventStatus.Blocked)` | `if (status === 'blocked')` |
| Inject `PrRepository` interface | `import { PrModel }` in a service |
| Split a 300-line service by use-case | One god-service |
| `assertNever(x)` in a `switch` default | silent fallthrough |
| Throw typed errors; map at the edge | leak stack/DB errors to clients |

## Before you finish

- [ ] File(s) under the size target; single responsibility.
- [ ] No `any`, no magic literals, inputs validated with zod.
- [ ] No cross-boundary import; `nx lint` + `madge --circular` clean.
- [ ] Tests added (see the `testing` skill / [docs/09](../../../docs/09-testing-strategy.md)).
- [ ] Names read like prose; comments explain **why**, not what.
