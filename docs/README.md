# EngineeringOS AI — Documentation

> **EngineeringOS AI** is an enterprise **Engineering Intelligence Platform**. It ingests engineering
> work signals (desktop activity, GitHub, Jira, Teams, calendars, AI-tool usage) and uses a fleet of
> specialized AI agents to explain **how engineering execution is actually progressing** — where the
> bottlenecks are, why a sprint is slipping, who is overloaded, and what to do about it.
>
> It is **not** an employee-surveillance product. Every metric and recommendation exists to help
> managers **remove blockers and improve delivery**, under explicit consent and privacy controls.

---

## How to read these docs

Read in this order. Foundational docs establish shared vocabulary and architecture that every
feature plan builds on.

### 1. Foundation (read first)

| # | Document | What it answers |
|---|----------|-----------------|
| 00 | [Vision & Scope](./00-vision-and-scope.md) | What is this product, who is it for, what is in/out of scope |
| 01 | [Product Requirements (PRD)](./01-product-requirements.md) | Functional + non-functional requirements, user stories, success metrics |
| 02 | [Personas & RBAC](./02-personas-and-rbac.md) | Users, roles, the permission model |
| 03 | [System Architecture](./03-system-architecture.md) | Monorepo layout, services, event flow, C4 diagrams |
| 04 | [Data Model & Multi-Tenancy](./04-data-model.md) | Core entities, tenant isolation, Sequelize conventions |
| 05 | [API & Realtime Design](./05-api-and-realtime.md) | REST conventions, WebSocket/SSE, versioning, errors |
| 06 | [Security, Privacy & Consent](./06-security-privacy-consent.md) | AuthN/Z, data classification, consent, audit, compliance |
| 07 | [AI Architecture (Agents & RAG)](./07-ai-architecture.md) | Agent orchestration, model routing, RAG, guardrails, cost |

### 2. Feature Plans (`./plans/`)

One detailed implementation plan per module. Each follows the same template
(see [`plans/_TEMPLATE.md`](./plans/_TEMPLATE.md)) and references the foundation docs above.

| # | Plan | Module |
|---|------|--------|
| 00 | [Roadmap & Phasing](./plans/00-roadmap-and-phasing.md) | Delivery phases, milestones, MVP cut line |
| 01 | [Authentication & Identity](./plans/01-authentication.md) | Email, OAuth (Google/MS/GitHub), JWT, MFA, sessions |
| 02 | [Multi-Tenancy & Org Hierarchy](./plans/02-multi-tenancy.md) | Org → Dept → Team → Project → Employee |
| 03 | [RBAC & Permissions](./plans/03-rbac.md) | Roles, configurable permissions, policy enforcement |
| 04 | [Desktop Agent](./plans/04-desktop-agent.md) | Rust cross-platform activity collector |
| 05 | [Realtime Event Pipeline](./plans/05-event-pipeline.md) | Ingestion, Kafka/Redis streams, workers |
| 06 | [GitHub Integration](./plans/06-github-integration.md) | PRs, reviews, DORA, bottleneck detection |
| 07 | [Jira / Sprint Integration](./plans/07-sprint-integration.md) | Sprints, estimates, velocity, burndown |
| 08 | [Microsoft Teams Integration](./plans/08-teams-integration.md) | SOD/EOD, task mapping |
| 09 | [Calendar Integration](./plans/09-calendar-integration.md) | Google/Outlook, focus vs meeting time |
| 10 | [IDE & Browser Analytics](./plans/10-ide-browser-analytics.md) | Coding time, languages, domain analytics |
| 11 | [AI Usage Analytics](./plans/11-ai-usage-analytics.md) | Claude/ChatGPT/Copilot/Cursor adoption |
| 12 | [Daily Timeline](./plans/12-daily-timeline.md) | Chronological activity replay |
| 13 | [AI Agents & Orchestration](./plans/13-ai-agents.md) | LangGraph agents, Manager Copilot |
| 14 | [RAG Knowledge Base](./plans/14-rag-knowledge.md) | Doc ingestion, Qdrant, cited answers |
| 15 | [Recommendations Engine](./plans/15-recommendations.md) | Actionable, explainable recommendations |
| 16 | [Dashboards](./plans/16-dashboards.md) | Employee / Manager / CTO dashboards |
| 17 | [Notifications](./plans/17-notifications.md) | Teams/Slack/Email/Push |
| 18 | [Reports](./plans/18-reports.md) | Daily → Executive summaries |
| 19 | [Enterprise & Platform](./plans/19-enterprise-platform.md) | Audit, retention, webhooks, plugin SDK, API |

### 3. Deployment (`./deployment/`)

| Document | What it covers |
|----------|----------------|
| [GCP Single-VM Deployment ($300 free tier)](./deployment/00-gcp-vm-deployment.md) | End-to-end: VM, SSH, Docker Compose, TLS, domain |
| [Docker & Compose Topology](./deployment/01-docker-compose.md) | Service images, compose file, env, volumes |
| [CI/CD (GitHub Actions)](./deployment/02-cicd.md) | Build, test, image push, SSH deploy |
| [Observability & Ops](./deployment/03-observability.md) | Logs, metrics, backups, runbooks |

### 4. Decision Records (`./adr/`)

Architecture Decision Records — one file per significant, hard-to-reverse choice.
See [`adr/README.md`](./adr/README.md).

---

## Tech stack (at a glance)

| Layer | Technology |
|-------|-----------|
| Monorepo | **Nx** (npm workspaces, `apps/*` + `libs/*`) |
| Frontend | **React 19 + Vite**, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand |
| Backend | **NestJS** (modular / DDD), TypeScript |
| ORM / DB | **Sequelize + PostgreSQL** |
| Cache / queues | **Redis** (BullMQ), **Kafka** (optional at scale; Redis Streams for MVP) |
| Realtime | **WebSocket (Socket.IO)** + Server-Sent Events |
| AI | **LangGraph.js**, Claude (Opus/Sonnet), OpenAI, Gemini — routed |
| Vector DB (RAG) | **Qdrant** |
| Object storage | **S3-compatible** (GCS / MinIO) |
| Desktop agent | **Rust** (cross-platform) |
| Infra | **Docker Compose** on a single GCP VM (MVP), Kubernetes-ready |
| CI/CD | **GitHub Actions** |
| Observability | Prometheus + Grafana, Loki, Sentry |

> See [ADR-0001](./adr/0001-monorepo-nx.md) … for the reasoning behind each choice, and
> [05 — Tech Decisions](./03-system-architecture.md#technology-decisions) for the summary.

---

## Conventions used across these docs

- **MUST / SHOULD / MAY** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) severity.
- Requirements are tagged `FR-xx` (functional) / `NFR-xx` (non-functional) for traceability.
- Every feature plan lists **acceptance criteria** and **out-of-scope** explicitly.
- Data-sensitivity is classified **P0 (public) → P4 (restricted)**; see doc 06.
- Diagrams are authored in [Mermaid](https://mermaid.js.org/) so they render in GitHub.

---

_Author: Platform Engineering. Status: Draft v1. Last structural update tracked in git._
