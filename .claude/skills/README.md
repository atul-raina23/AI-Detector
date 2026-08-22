# EngineeringOS — Project Skills

Reusable, repo-specific skills that encode **how we build things here** so every contributor (human or
AI) produces clean, consistent, cycle-free code. Each skill is a short checklist that points at the
authoritative doc in [`docs/`](../../docs/).

| Skill | Use it when… |
|-------|--------------|
| [`clean-code`](./clean-code/SKILL.md) | Writing or reviewing any TypeScript — small files, thin layers, no magic strings, no cross-boundary imports |
| [`nx-library`](./nx-library/SKILL.md) | Creating a new Nx lib — correct layer, tags, path mapping, zero circular-dep risk |
| [`nest-module`](./nest-module/SKILL.md) | Adding a backend feature — thin controller/service/repository, tenant scope, RBAC |
| [`sequelize-migration`](./sequelize-migration/SKILL.md) | Changing the DB schema — migration + model + repository, org-scoped, indexed |
| [`integration-adapter`](./integration-adapter/SKILL.md) | Integrating a new external source — normalize to canonical `DomainEvent`s |
| [`ai-agent`](./ai-agent/SKILL.md) | Adding an AI agent — scoped data, cited evidence, model routing, guardrails |
| [`react-feature`](./react-feature/SKILL.md) | Adding a frontend page — Query hooks, `@eos/ui` tokens, light/dark, responsive |

## Principles baked into all of them

1. **Small, single-purpose files.** Readability over cleverness.
2. **Depend on interfaces, not implementations** — the reason our modules stay decoupled.
3. **Never cross a boundary** (`shared` ↮ `backend`/`frontend`; features ↮ features). Run `nx lint`
   and `madge --circular` before every push.
4. **Tenant-scoped + consent-gated + explainable** by construction.
5. **Tests are part of "done"** — unit, integration (incl. tenant-isolation), e2e.

> These complement, not replace, the docs. When a skill and a doc disagree, the doc wins — update the skill.
