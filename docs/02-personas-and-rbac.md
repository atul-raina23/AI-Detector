# 02 — Personas & RBAC

Covers `FR-RBAC-*` and `FR-ORG-04`. The permission model here is the authority that
[plans/03 — RBAC](./plans/03-rbac.md) implements.

---

## 1. Personas

### 1.1 Individual Contributor (Engineer / QA / DevOps / Designer / PM)

- **Goals:** stay in flow, avoid status meetings, get credit for what they did, know what's blocking them.
- **Uses:** own Daily Timeline, own tasks/PRs, focus vs meeting time, own AI usage, AI-drafted EOD.
- **Sensitivities:** does not want to be surveilled or ranked. **Sees their own data first**; can pause
  the desktop agent; can see exactly what is collected.
- **Access:** own data only + team-shared views (e.g., team PR queue) that don't expose others' private signals.

### 1.2 Team Lead

- **Goals:** unblock the team today; balance review load; keep the sprint on track.
- **Uses:** team health, PR queue, blocked tasks, review load, meeting load, risk — **scoped to their team(s)**.
- **Access:** aggregate + per-member *work* views for their team; **not** raw private signals (e.g., not
  another person's browser domains) beyond what policy allows.

### 1.3 Engineering Manager

- Like Team Lead but across **multiple teams** in a department. Cares about cross-team dependencies and
  reviewer overload spanning teams.

### 1.4 CTO / VP Engineering / Founder

- **Goals:** org-wide delivery health, DORA, velocity trends, repo health, AI adoption ROI, risk.
- **Uses:** CTO dashboard, executive reports, org analytics. Rarely drills to individuals; mostly team/process.
- **Access:** org-wide aggregate; individual drilldown only where policy permits and via audited access.

### 1.5 HR

- **Goals:** aggregate wellbeing/overload signals (e.g., meeting overload, sustained overtime patterns
  at the *team* level) to inform policy — **not** to police individuals.
- **Access:** **aggregate-only**, policy-scoped. No individual activity drilldown, no timelines of a
  named person. This restriction is deliberate and enforced (see anti-goals, doc 00 §4).

### 1.6 Owner / Admin

- **Goals:** run the org: billing, integrations, RBAC config, privacy/consent policy, retention, SSO.
- **Access:** full org configuration. Configuration access is separated from *data* access — an Owner
  configures policy but individual-data reads still generate audit records.

### 1.7 Guest

- External stakeholder (e.g., a client PM) with a **read-only, narrowly-scoped** view (e.g., one
  project's delivery status). Time-boxed, no PII.

---

## 2. RBAC model

We use **RBAC with resource scoping** (roles → permissions), plus **ABAC-style guards** for ownership
and tenant scope. This keeps the common case simple (roles) while allowing per-resource checks.

### 2.1 Concepts

- **Permission** — a verb on a resource type: `pr:read`, `timeline:read:team`, `org:settings:write`,
  `consent:manage`, `recommendation:act`, `report:export`, etc. Format: `resource:action[:scope]`.
- **Role** — a named set of permissions, editable per org (`FR-RBAC-02`). Ships with sensible defaults.
- **Scope** — the breadth a permission applies to: `own` · `team` · `department` · `org` · `aggregate`.
- **Membership** — links a user to an org and to teams/projects, each carrying a role. A user MAY hold
  different roles in different teams (`FR-ORG-04`).

### 2.2 Default role → permission matrix (excerpt)

Scopes: `own` (self), `team`, `dept`, `org`, `agg` (aggregate-only, no individual identification).

| Permission (example) | Owner | CTO | Eng Mgr | Team Lead | HR | Employee | Guest |
|---|---|---|---|---|---|---|---|
| `org:settings:write` | ✅ org | – | – | – | – | – | – |
| `billing:manage` | ✅ | – | – | – | – | – | – |
| `rbac:manage` | ✅ | ✅ org | – | – | – | – | – |
| `integration:manage` | ✅ | ✅ | ✅ dept | – | – | – | – |
| `consent:manage` (policy) | ✅ | ✅ | – | – | – | – | – |
| `timeline:read` | – | ✅ org | ✅ dept | ✅ team | – | ✅ own | – |
| `pr:read` | ✅ org | ✅ org | ✅ dept | ✅ team | – | ✅ own+team | ✅ project |
| `sprint:read` | ✅ org | ✅ org | ✅ dept | ✅ team | – | ✅ team | ✅ project |
| `metrics:dora:read` | ✅ | ✅ | ✅ dept | ✅ team | – | – | – |
| `ai_usage:read` | ✅ agg | ✅ agg | ✅ agg | ✅ agg | ✅ agg | ✅ own | – |
| `wellbeing:read` | ✅ agg | ✅ agg | ✅ agg | ✅ agg | ✅ agg | ✅ own | – |
| `recommendation:read` | ✅ | ✅ | ✅ | ✅ | – | ✅ own | – |
| `recommendation:act` | ✅ | ✅ | ✅ | ✅ team | – | – | – |
| `report:export` | ✅ | ✅ | ✅ | ✅ team | ✅ agg | ✅ own | – |
| `audit:read` | ✅ | ✅ | – | – | – | – | – |
| `knowledge:read` (RAG) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | scoped |

Notes:
- **HR is aggregate-only** by construction: HR roles cannot be granted any `:own`/`:team` permission
  that identifies an individual's activity. The permission catalog marks such permissions as
  `hrForbidden: true` so the RBAC config UI won't let an admin grant them to HR.
- Individual drilldown of another person's timeline (`timeline:read:team`/`:dept`/`:org`) always
  produces an **audit record** (`FR-ENT-01`), even for CTO/Owner.

### 2.3 Enforcement (server-side, always)

Every request passes three gates (`FR-RBAC-03`):

1. **Tenant gate** — resolve `organizationId` from the auth context; every query is scoped to it
   (`NFR-ISO`). No endpoint trusts a client-supplied org id.
2. **Permission gate** — `@RequirePermission('pr:read')` guard checks the user's effective permissions
   (role ∪ membership) for the required verb + minimum scope.
3. **Resource/ownership gate** — for scoped reads, an ABAC policy verifies the target resource is within
   the caller's scope (own / their team / their dept). E.g., a Team Lead reading a PR must share a team
   with the PR's repo/project.

WebSocket subscriptions and background/report generation run through the **same** permission checks —
there is no privileged read path that bypasses RBAC.

### 2.4 Configurability (`FR-RBAC-02`)

- Orgs may clone a default role and edit its permission set within guardrails (cannot grant
  `hrForbidden` permissions to HR; cannot remove `org:settings:write` from Owner).
- Custom roles are allowed; the permission **catalog** is fixed (adding new permissions is a platform
  release), roles composed from it are org-editable.
- Changes to roles/permissions are audited.

---

## 3. Privacy interaction

RBAC decides *who may see what exists*; **consent** (doc 06) decides *whether a signal is collected at
all*. A manager with `timeline:read:team` still cannot see a signal type an employee has not consented
to collect, or one the org policy disabled. The two systems compose; the **more restrictive wins**.

---

_Next: [03 — System Architecture](./03-system-architecture.md)_
