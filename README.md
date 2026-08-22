# EngineeringOS AI

**An AI-powered Engineering Intelligence Platform** — it ingests engineering work signals (GitHub,
Jira, Teams, calendars, IDE/AI-tool usage, an optional desktop agent), correlates them into a live
per-person / per-team **event timeline**, and uses a fleet of specialized AI agents to explain **how
engineering execution is actually progressing** — bottlenecks, sprint risk, review overload, AI
adoption — with **cited evidence** and actionable recommendations.

> **Not surveillance.** No screenshots, no keystroke logging, no individual productivity scores.
> Every signal is consent-gated and every metric is explainable. See
> [docs/00 — Vision & Scope](./docs/00-vision-and-scope.md).

---

## 📚 Documentation

**Start here:** [`docs/README.md`](./docs/README.md) — the full documentation index.

- **Foundation:** [Vision](./docs/00-vision-and-scope.md) · [PRD](./docs/01-product-requirements.md) ·
  [Personas & RBAC](./docs/02-personas-and-rbac.md) · [Architecture](./docs/03-system-architecture.md) ·
  [Data Model](./docs/04-data-model.md) · [API & Realtime](./docs/05-api-and-realtime.md) ·
  [Security & Consent](./docs/06-security-privacy-consent.md) · [AI Architecture](./docs/07-ai-architecture.md)
- **Engineering standards:** [Coding Standards](./docs/08-coding-standards.md) ·
  [Testing Strategy](./docs/09-testing-strategy.md) ·
  [Shared Packages & Boundaries](./docs/10-shared-packages-and-boundaries.md) ·
  [UI/UX Design System](./docs/11-ui-ux-design-system.md)
- **Feature plans:** [`docs/plans/`](./docs/plans/) (one per module, incl. the
  [Roadmap](./docs/plans/00-roadmap-and-phasing.md))
- **Deployment:** [`docs/deployment/`](./docs/deployment/) (single GCP VM, $300 free tier)
- **Decisions:** [`docs/adr/`](./docs/adr/)

## 🧱 Tech stack

| Layer | Tech |
|-------|------|
| Monorepo | **Nx** (npm workspaces, `apps/*` + `libs/*`) |
| Frontend | **React 19 + Vite**, TypeScript, Tailwind, shadcn/ui, TanStack Query |
| Backend | **NestJS** (modular monolith + worker), TypeScript |
| ORM / DB | **Sequelize + PostgreSQL** |
| Cache / queues / bus | **Redis** (BullMQ + Streams) |
| AI | **LangGraph.js**, Claude / OpenAI / Gemini (routed) |
| RAG | **Qdrant** |
| Desktop agent | **Rust** (cross-platform, opt-in) |
| Infra | **Docker Compose** on one GCP VM (Kubernetes-ready) |

## 📂 Repository layout

```
apps/
  api/            NestJS HTTP + WebSocket app
  worker/         NestJS headless (BullMQ processors, projections, AI agents)
  web/            React + Vite SPA
  desktop-agent/  Rust cross-platform agent
libs/
  shared/         @eos/shared-{constants,enums,types,utils}, @eos/contracts  (leaf — no framework deps)
  backend/        @eos/{backend-core,database,events,auth,rbac,ai,integrations}
  frontend/       @eos/{ui,frontend-data,feature-*}
docs/             product + architecture + feature plans + deployment + ADRs
.claude/skills/   repo-specific skills (clean-code, nx-library, nest-module, …)
```

Dependency rule (enforced by Nx tags + `@nx/enforce-module-boundaries`): the graph is a **DAG** —
`shared/*` is the leaf, `frontend` and `backend` never import each other (they meet at `@eos/contracts`),
feature libs never import each other. See [docs/10](./docs/10-shared-packages-and-boundaries.md). This is
how we guarantee **no circular dependencies** (which otherwise break Docker/prod builds).

## 🚀 Getting started (local)

> The app scaffolding (apps/libs) is built out per the [Roadmap](./docs/plans/00-roadmap-and-phasing.md).
> This repo currently contains the Nx workspace + full design docs.

```bash
# 1. Install
npm install

# 2. Environment — copy the example and fill in real values (never commit .env)
cp .env.example .env

# 3. Start infra (Postgres, Redis, Qdrant, MinIO) for local dev
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d

# 4. Explore the workspace
npx nx graph            # visualize the dependency DAG
npx nx run-many -t lint test build
```

## 🔒 Security & secrets

- **Never commit secrets.** Only `.env.example` (placeholders) is tracked; `.env` and all key files are
  gitignored. See [docs/06](./docs/06-security-privacy-consent.md).
- Report vulnerabilities privately (see `SECURITY.md` once published).

## 🤝 Contributing

Read [docs/08 — Coding Standards](./docs/08-coding-standards.md) and the
[`.claude/skills/`](./.claude/skills/README.md) before writing code. Every PR must pass
`nx affected -t lint test build`, keep the dependency graph acyclic, and include tests
([docs/09](./docs/09-testing-strategy.md)).

---

_Built with Nx. License: proprietary (UNLICENSED)._
