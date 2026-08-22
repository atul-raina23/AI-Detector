# 00 — Vision & Scope

## 1. The one-sentence version

> EngineeringOS AI turns the raw signals of software work — commits, PRs, sprint tickets, standups,
> calendars, IDE activity, AI-tool usage — into a **live, explainable picture of engineering
> execution**, so leaders can remove blockers instead of guessing.

## 2. The problem

Engineering leaders are flying with instruments that lag reality by days or weeks:

- **Status is stale.** Standups and Jira boards describe intentions, not what actually happened. By
  the time a sprint report says "at risk," the risk already materialized.
- **Bottlenecks are invisible until they hurt.** A PR sitting 72 hours, a single overloaded reviewer,
  a blocked task waiting on an un-deployed API — these are knowable *today* but nobody is watching
  all the signals at once.
- **The data is fragmented.** GitHub knows about PRs, Jira knows about tickets, Teams knows about
  standups, the calendar knows about meeting load, and none of them talk to each other or to a human
  who can act.
- **AI adoption is a black box.** Teams are spending real money and time on Claude, Copilot, Cursor,
  etc., but nobody can say whether it's helping, on what, or how much.

Existing tools split into two camps, both wrong for this job:

1. **Surveillance/"bossware"** — screenshots, keystroke logging, activity scores. Toxic, low-trust,
   and measures the wrong thing (presence, not progress).
2. **Single-source dashboards** — a DORA dashboard, or a Jira velocity chart. Accurate but narrow;
   they show *what* but never *why*, and never across sources.

## 3. The product thesis

**Correlate every engineering signal into one timeline per person and per team, then put agentic AI
on top of it to explain and recommend.**

Three beliefs drive the design:

1. **Execution is a flow, not a snapshot.** The unit of truth is the **event** (a commit, a review, a
   focus block). Everything else — dashboards, metrics, reports — is a *projection* of the event
   stream. This is why the architecture is event-sourced at its core (see
   [03 — System Architecture](./03-system-architecture.md)).
2. **A metric without a "why" is noise.** Every number the platform shows must be traceable to the
   events that produced it, and every AI recommendation must cite the evidence and reasoning that led
   to it. Explainability is a first-class requirement (`NFR-EXPLAIN`), not a nice-to-have.
3. **Trust is the product.** Because we collect sensitive signals, consent, transparency, and
   data-minimization are *features*, not compliance chores. An employee can always see exactly what is
   collected about them and why. See [06 — Security, Privacy & Consent](./06-security-privacy-consent.md).

## 4. What we are NOT building (anti-goals)

This is the most important section. These are hard boundaries.

- ❌ **No screen recording, no screenshots, no keystroke logging.** Ever.
- ❌ **No individual "productivity score" or ranking of employees.** We measure *flow and blockers*,
  not people. Metrics roll up to teams and processes.
- ❌ **No covert collection.** The desktop agent is opt-in, visible, pausable, and shows the employee
  their own data first.
- ❌ **No punitive tooling.** Nothing in the product is designed to discipline or rank individuals.
  Manager views emphasize *what is blocking the team* over *who is slow*.
- ❌ **Prompt content logging is OFF by default** and requires an explicit org-level policy toggle with
  audit + employee notice before it can be enabled.

If a proposed feature can only be used to police individuals, it is out of scope by definition.

## 5. Target users & buyers

| | Who | Primary job-to-be-done |
|---|-----|------------------------|
| **Buyer / champion** | CTO, VP Engineering, Founder | "Show me where delivery is actually at, and where it's stuck." |
| **Daily manager user** | Engineering Manager, Team Lead | "What's blocked, who's overloaded, what should I unblock today." |
| **Individual user** | Software/QA/DevOps Engineer, Designer, PM | "Auto-draft my EOD, show my own day, keep me out of status meetings." |

Full personas in [02 — Personas & RBAC](./02-personas-and-rbac.md).

## 6. Scope — MVP vs. Full

We phase deliberately. The full brief is large; the MVP proves the core thesis (correlated timeline +
one high-value AI insight) end-to-end.

### In scope for MVP (Phase 1–2)

- Multi-tenant org model, auth (email + Google/GitHub OAuth), RBAC.
- **GitHub integration** (the highest-signal, lowest-friction source) with PR/review bottleneck
  detection + basic DORA.
- **Jira/Linear sprint integration** (read-only) with velocity/burndown.
- **Event pipeline** + per-person **Daily Timeline** from GitHub/Jira events (no desktop agent yet).
- **Manager Copilot** (RAG + agent) answering NL questions over the org's own data.
- **Recommendations engine** producing a handful of explainable, high-precision recommendations.
- Employee + Manager dashboards.
- Single-VM GCP deployment.

### In scope for Full product (Phase 3+)

- **Desktop agent** (Rust) for local activity, focus time, app/IDE signals.
- **Teams SOD/EOD**, calendar integration, IDE/browser analytics, AI-usage analytics.
- Full agent fleet (Risk, Sprint, Review, Meeting, Knowledge, AI-Usage agents).
- Full report suite, notifications across channels, webhooks + plugin SDK + public API.
- Advanced enterprise controls (retention policies, data-residency, SSO/SCIM).

### Explicitly out of scope (for now)

- On-prem/self-hosted distribution (cloud SaaS first).
- Non-engineering departments (sales, support) — the model is engineering-specific.
- Mobile native apps (responsive web only).
- Real-time video/meeting transcription capture (we consume calendar + optional summaries, we don't record).

## 7. Success metrics

The product succeeds if it changes leader behavior and improves flow.

**Product/usage (leading):**
- ≥ 60% of managers open the platform ≥ 3×/week by week 4.
- ≥ 50% of AI recommendations marked "useful" or acted upon.
- ≥ 70% of engineers post an AI-drafted EOD with ≤ 1 edit (once Teams integration ships).

**Engineering outcomes (lagging, the real goal):**
- Median PR **review wait time** ↓ measurably within 6 weeks of a team onboarding.
- Reduction in **stale PRs** (> 48h idle) and blocked-task age.
- Improved **sprint completion predictability** (forecast error ↓).

**Trust (guardrail):**
- Zero features that individually rank employees.
- 100% of collected signal types visible to the employee they concern.
- Consent coverage = 100% of active agents (no collection without recorded consent).

## 8. Guiding principles for every decision downstream

1. **Event-first.** If it can be an event, it's an event.
2. **Explainable-by-construction.** Store the "why" alongside every derived number and recommendation.
3. **Consent-gated.** No collector runs without a recorded, revocable consent for that signal type.
4. **Team-over-individual.** Default all rollups and alerts to team/process framing.
5. **Boring infra, sharp AI.** Keep the platform simple to run (single VM to start); spend the
   innovation budget on the intelligence layer, not on premature Kubernetes.
6. **Extensible by contract.** New integrations and agents plug into stable interfaces (see the
   plugin SDK, [plan 19](./plans/19-enterprise-platform.md)) — no core rewrites to add a source.

---

_Next: [01 — Product Requirements](./01-product-requirements.md)_
