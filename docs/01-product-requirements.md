# 01 — Product Requirements Document (PRD)

Status: Draft v1 · Owner: Product + Platform Eng · Traceability IDs: `FR-*` / `NFR-*`

This PRD is the contract between "what the brief asks for" and "what each feature plan builds." Every
feature plan in [`./plans/`](./plans/) references the `FR-*` IDs it satisfies. Non-functional
requirements (`NFR-*`) apply platform-wide.

---

## 1. Product summary

An enterprise, multi-tenant SaaS **Engineering Intelligence Platform** that ingests engineering work
signals from many sources, correlates them into a per-person/per-team **event timeline**, and applies
a fleet of specialized AI agents to surface **explainable insights, bottlenecks, and recommendations**.
See [00 — Vision & Scope](./00-vision-and-scope.md) for the "why" and the anti-goals.

## 2. Personas (summary)

Full detail in [02 — Personas & RBAC](./02-personas-and-rbac.md).

- **Individual Contributor** (SWE, QA, DevOps, Designer, PM) — sees own timeline, tasks, PRs, focus
  time, AI usage; reviews AI-drafted EOD.
- **Team Lead / Engineering Manager** — sees team health, PR queue, blockers, review load, risk.
- **CTO / VP Eng / Founder** — sees org-wide KPIs, DORA, velocity, AI adoption, repo health.
- **HR** — limited, aggregate, policy-scoped views only (no individual activity drilldown).
- **Owner / Admin** — org configuration, billing, integrations, RBAC, privacy policy.

## 3. Functional requirements

Grouped by module. Each maps to a feature plan.

### 3.1 Authentication & Identity — `plans/01`

- **FR-AUTH-01** Users MUST authenticate via email/password with secure hashing (argon2id).
- **FR-AUTH-02** Users MUST be able to sign in via **Google**, **Microsoft**, and **GitHub** OAuth 2.0 / OIDC.
- **FR-AUTH-03** The system MUST issue short-lived **access JWTs** and rotating **refresh tokens**.
- **FR-AUTH-04** Users MUST be able to enable **MFA (TOTP)**; org admins MAY enforce MFA org-wide.
- **FR-AUTH-05** The system MUST support **session management** (list/revoke active sessions per device).
- **FR-AUTH-06** The system MUST support **password reset** and email verification via signed tokens.
- **FR-AUTH-07** OAuth account linking MUST bind to a verified email to prevent account takeover.

### 3.2 Multi-Tenancy & Org Hierarchy — `plans/02`

- **FR-ORG-01** The system MUST support multiple isolated **organizations** (tenants).
- **FR-ORG-02** Each org MUST support the hierarchy **Org → Department → Team → Project → Employee**.
- **FR-ORG-03** All tenant data MUST be strictly isolated (no cross-tenant read paths). See `NFR-ISO`.
- **FR-ORG-04** An employee MAY belong to multiple teams/projects; membership carries a role.
- **FR-ORG-05** Admins MUST be able to invite, deactivate, and re-assign members.

### 3.3 RBAC & Permissions — `plans/03`

- **FR-RBAC-01** The system MUST ship default roles: Owner, CTO, Engineering Manager, Team Lead, HR, Employee, Guest.
- **FR-RBAC-02** Permissions MUST be **configurable** per org (roles map to permission sets).
- **FR-RBAC-03** Access checks MUST be enforced server-side on every API and WS event, scoped by tenant + role + resource ownership.
- **FR-RBAC-04** The system MUST support **scope-limited** views (e.g., a Team Lead sees only their team's members).

### 3.4 Desktop Agent — `plans/04`

- **FR-AGENT-01** A lightweight cross-platform (Win/macOS/Linux) agent MUST collect **configurable** work events: login/logout, active app, VS Code/IntelliJ/terminal activity, browser domains, git activity, build execution, idle time, meeting status, focus time.
- **FR-AGENT-02** Collection MUST be **opt-in per signal type**, visible to the employee, and **pausable** at any time.
- **FR-AGENT-03** The agent MUST **never** capture screens, screenshots, or keystrokes.
- **FR-AGENT-04** The agent MUST sync events in **real time or scheduled batches**, resilient to offline periods (local buffer + retry).
- **FR-AGENT-05** The agent MUST authenticate via a device-scoped token and support remote revocation.
- **FR-AGENT-06** The employee MUST be able to view exactly what the agent is sending, locally, before it leaves the device.

### 3.5 Realtime Event Pipeline — `plans/05`

- **FR-EVT-01** All signals (agent, GitHub, Jira, Teams, calendar) MUST be normalized into a canonical **Event** schema (see [04 — Data Model](./04-data-model.md)).
- **FR-EVT-02** Events MUST be ingested idempotently (dedup by source + external id + hash).
- **FR-EVT-03** The pipeline MUST fan events to: persistence, projections (timeline/metrics), and the agent layer.
- **FR-EVT-04** Live updates MUST reach the frontend via WebSocket/SSE within ~2s of ingestion (`NFR-LATENCY`).

### 3.6 GitHub Integration — `plans/06`

- **FR-GH-01** Connect an org's GitHub org/repos via **GitHub App** (installation tokens, least privilege).
- **FR-GH-02** Track: repositories, commits, branches, pushes, PRs, reviews, review comments, approvals, requested changes.
- **FR-GH-03** Compute PR analytics: review wait time, merge wait time, stale-PR detection, large-PR detection, code ownership, review participation/load, merge & deployment frequency.
- **FR-GH-04** Compute **DORA** metrics: deployment frequency, lead time for changes, change-failure rate, MTTR.
- **FR-GH-05** Detect bottlenecks: PR waiting > threshold, overloaded reviewer, inactive critical repo, large risky PR, missing reviewers — each with evidence.
- **FR-GH-06** Ingest via **webhooks** (real-time) with periodic **backfill/reconciliation**.

### 3.7 Jira / Azure DevOps / Linear — `plans/07`

- **FR-SPR-01** Sync sprints, epics, stories, tasks, bugs, estimates, actuals, dependencies, blocked tasks, reopened issues.
- **FR-SPR-02** Compute velocity, burndown, estimation accuracy, completion %.
- **FR-SPR-03** Map GitHub PRs/commits to tickets (by key in branch/PR/commit) to link code to work.
- **FR-SPR-04** Provider-agnostic adapter interface (Jira first; Linear/Azure DevOps behind same contract).

### 3.8 Microsoft Teams Integration — `plans/08`

- **FR-TEAMS-01** Ingest **SOD** (start-of-day) posts; AI parses tasks and maps them to Jira/GitHub items.
- **FR-TEAMS-02** AI estimates workload and predicts delivery for the day's tasks.
- **FR-TEAMS-03** At day end, AI **drafts an EOD** (completed / pending / blockers / tomorrow plan) from correlated events; the employee reviews and edits before posting.
- **FR-TEAMS-04** Support posting back to a Teams channel via bot.

### 3.9 Calendar Integration — `plans/09`

- **FR-CAL-01** Connect Google Calendar and Microsoft Outlook (read).
- **FR-CAL-02** Derive meeting time, deep-work/focus windows, interruptions, meeting overload.
- **FR-CAL-03** Feed focus vs meeting balance into the timeline and manager meeting-load views.

### 3.10 IDE & Browser Analytics — `plans/10`

- **FR-IDE-01** Track coding time, debugging, testing, build time, extensions, workspace, languages (from agent/IDE plugin signals).
- **FR-BR-01** Collect **domain-level** browser analytics by default (e.g., github.com, stackoverflow.com); finer tracking only if org explicitly enables.

### 3.11 AI Usage Analytics — `plans/11`

- **FR-AIU-01** Track usage across Claude, ChatGPT, Copilot, Cursor, Gemini, Windsurf: sessions, prompt counts, time spent, linked task, tool used.
- **FR-AIU-02** **Prompt-content logging MUST be OFF by default**; enabling requires an org policy toggle + audit + employee notice, with access controls.
- **FR-AIU-03** Produce AI-productivity/adoption reports (per person aggregate, per team, per tool) and an "estimated AI assistance %" heuristic with disclosed methodology.

### 3.12 Daily Timeline — `plans/12`

- **FR-TL-01** Render a chronological per-person timeline correlating all sources (login → SOD → coding → AI → commit → PR → review → meeting → EOD).
- **FR-TL-02** Managers MAY **replay** activity chronologically (scoped by RBAC).
- **FR-TL-03** Every timeline entry links back to its source event(s).

### 3.13 AI Agents & Orchestration — `plans/13`

- **FR-AI-01** Provide specialized agents: Activity, GitHub, Sprint, Review, Risk, AI-Usage, Knowledge, Meeting, Recommendation, and a **Manager Copilot**.
- **FR-AI-02** Agents MUST run over the org's own event/metric data and cite the evidence for conclusions.
- **FR-AI-03** **Manager Copilot** answers natural-language management questions with data-grounded answers + citations.
- **FR-AI-04** Agents that take actions (e.g., post EOD, notify) MUST support **human approval** gates (`FR-ENT-08`).

### 3.14 RAG Knowledge Base — `plans/14`

- **FR-RAG-01** Ingest PDF, DOCX, Markdown, Confluence, Notion; chunk + embed into Qdrant per tenant.
- **FR-RAG-02** Answer employee questions ("What is our deployment process?") **with citations** to source docs.
- **FR-RAG-03** Respect RBAC on documents (a doc's audience limits who can retrieve it).

### 3.15 Recommendations Engine — `plans/15`

- **FR-REC-01** Produce actionable recommendations (e.g., "Backend team has 14 pending reviews," "Sprint completion probability dropped to 63%").
- **FR-REC-02** Each recommendation MUST include **why** (the evidence + reasoning chain).
- **FR-REC-03** Recommendations are ranked by impact and de-duplicated; users can dismiss/act/snooze with feedback captured.

### 3.16 Dashboards — `plans/16`

- **FR-DASH-01** **Employee dashboard**: today's work, timeline, tasks, PRs, meetings, focus time, AI usage.
- **FR-DASH-02** **Manager dashboard**: team health, PR queue, sprint progress, blocked tasks, review load, meeting load, risk.
- **FR-DASH-03** **CTO dashboard**: engineering KPIs, velocity, repo health, deployment/DORA metrics, AI adoption, org analytics.

### 3.17 Notifications — `plans/17`

- **FR-NOT-01** Deliver notifications via Teams, Slack, Email, and Web Push.
- **FR-NOT-02** Triggers include: PR pending > 48h, task overdue, sprint risk, deployment failure, meeting reminder, review request.
- **FR-NOT-03** Users control channels + quiet hours + per-type opt-out.

### 3.18 Reports — `plans/18`

- **FR-RPT-01** Generate Daily, Weekly, Sprint, Monthly, Engineering-Health, AI-Adoption, Productivity, Review-Analytics reports, and an Executive Summary.
- **FR-RPT-02** Reports are exportable (PDF/CSV) and schedulable to email/Teams/Slack.

### 3.19 Enterprise & Platform — `plans/19`

- **FR-ENT-01** **Audit logs** for all sensitive reads/writes and admin actions.
- **FR-ENT-02** Configurable **data-retention policies** per signal type.
- **FR-ENT-03** Org settings, **privacy controls**, and **consent management** UI.
- **FR-ENT-04** **Webhook** support (outbound) and **public API** with scoped API keys.
- **FR-ENT-05** **Plugin SDK** for new integrations/agents without core changes.
- **FR-ENT-06** **Workflow automation** (trigger → condition → action).
- **FR-ENT-07** Data export + account/org deletion (GDPR right-to-erasure).
- **FR-ENT-08** **Human approval** required before AI takes any outward action.

## 4. Non-functional requirements

- **NFR-ISO** (Tenant isolation) Cross-tenant data access MUST be impossible via any code path; enforced at the query layer (mandatory `organizationId` scoping) + tested.
- **NFR-EXPLAIN** (Explainability) Every derived metric and AI recommendation MUST expose the events/inputs and reasoning that produced it.
- **NFR-CONSENT** (Consent) No collector MAY run without a recorded, revocable consent for that signal type; revocation stops collection within 1 minute.
- **NFR-PRIVACY** Data classified P0–P4 (doc 06); P3/P4 encrypted at rest with field-level controls; PII minimized.
- **NFR-LATENCY** Live updates reach the UI ≤ 2s p95 after ingestion; dashboards load ≤ 1.5s p95.
- **NFR-SCALE** Architecture MUST scale from 1 org / 20 users (single VM) to 100s of orgs without redesign (horizontal workers, partitioned event store).
- **NFR-AVAIL** Target 99.5% for MVP single-VM; design does not preclude HA later.
- **NFR-SEC** OWASP ASVS L2 baseline; secrets in a manager (not env files in repo); dependency scanning in CI.
- **NFR-COST** MVP MUST run within the GCP $300 free-tier credit (see [deployment](./deployment/00-gcp-vm-deployment.md)); AI spend is budgeted + capped per org (doc 07).
- **NFR-OBS** Structured logs, metrics, traces, and error tracking on every service.
- **NFR-A11Y** Frontend meets WCAG 2.1 AA.
- **NFR-I18N** UTC storage, locale-aware display; English-first, i18n-ready strings.
- **NFR-PORT** No hard cloud lock-in beyond object storage abstraction (S3-compatible) and managed-DB option.

## 5. Assumptions & constraints

- Team is TypeScript-strong; hence NestJS + React + Sequelize (one language across the stack).
- MVP deploys to a **single GCP e2 VM via SSH + Docker Compose** to stay in free credit; Kubernetes is a later, optional step (`NFR-SCALE` keeps the door open).
- Third-party rate limits (GitHub, Jira, calendars) constrain polling; prefer webhooks + backfill.
- LLM costs are the dominant variable cost; model routing + caching are mandatory (doc 07).

## 6. Success metrics

See [00 — Vision & Scope §7](./00-vision-and-scope.md#7-success-metrics). Summary: manager weekly
active use, recommendation usefulness rate, and measurable reductions in PR review-wait / stale-PR /
blocked-task age after onboarding.

## 7. Release phasing

Detailed in [plans/00 — Roadmap & Phasing](./plans/00-roadmap-and-phasing.md). Headline:

- **Phase 1 (Foundations):** monorepo, auth, multi-tenancy, RBAC, event pipeline, GitHub ingest, basic timeline + dashboards, single-VM deploy.
- **Phase 2 (Insight):** Jira/sprint, DORA + bottleneck detection, Manager Copilot + RAG, recommendations, notifications.
- **Phase 3 (Reach):** desktop agent, Teams SOD/EOD, calendar, IDE/browser + AI-usage analytics, full agent fleet, reports.
- **Phase 4 (Enterprise):** audit/retention/consent depth, webhooks, plugin SDK, public API, workflow automation, SSO/SCIM.

---

_Next: [02 — Personas & RBAC](./02-personas-and-rbac.md)_
