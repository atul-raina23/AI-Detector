# 03 — Observability & Operations

How we see what EngineeringOS AI is doing in production, and what we do when it
misbehaves. Scope is the **single GCP VM / Docker Compose** MVP
(services: `web`, `api`, `worker`, `postgres`, `redis`, `qdrant`, `minio`, `caddy`)
but every choice here is picked to survive the move to multiple nodes.

Read first: [../03 — System Architecture §9](../03-system-architecture.md#9-cross-cutting-concerns)
(events, worker/queues, cross-cutting observability) and
[../01 — PRD §4](../01-product-requirements.md#4-non-functional-requirements)
(`NFR-OBS`, `NFR-LATENCY`, `NFR-AVAIL`).
Related: [00 — GCP VM Deployment](./00-gcp-vm-deployment.md),
[01 — Docker Compose](./01-docker-compose.md),
[00 — GCP VM Deployment › Backups](./00-gcp-vm-deployment.md#backups),
[../06 — Security, Privacy & Consent](../06-security-privacy-consent.md).

RFC-2119 keywords (MUST / SHOULD / MAY) are used deliberately.

---

## 1. Principles

- **`NFR-OBS` is non-negotiable:** every service emits structured logs, metrics, and
  traces, plus error tracking. A service with no `/metrics` endpoint MUST NOT ship.
- **Correlation over volume.** One `correlationId` threads a request or event through
  api → bus → worker → external call → back to the UI. It is the primary debugging key.
- **Explainability extends to ops.** Same instinct as `NFR-EXPLAIN`: we should always be
  able to answer "why is this number / this alert what it is" from stored signal.
- **Cheap first, portable always.** The stack runs in the VM's spare RAM today. Nothing
  here couples us to that: Loki/Prometheus/Sentry are swappable for GCP Cloud
  Ops (see §11) with no app-code change — instrumentation is vendor-neutral (OTel, pino,
  prom-client).
- **Privacy is an observability constraint, not an afterthought.** PII and secrets are
  **never** logged (§2.3, [../06](../06-security-privacy-consent.md)).

---

## 2. Pillar 1 — Logging

### 2.1 Format & transport

- Nest api and worker log via **pino** in **JSON** to `stdout`. Docker's `json-file`
  driver (or `local`) captures it; **Promtail** tails the container logs and ships to
  **Loki**; **Grafana** queries Loki.
- Logs MUST be one JSON object per line. No multi-line human formatting in production
  (`pino-pretty` is dev-only).

Baseline fields on every line:

| Field | Meaning |
|-------|---------|
| `time`, `level` | ISO ts, numeric+label level |
| `service` | `api` \| `worker` |
| `correlationId` | request/event trace key (§2.2) |
| `organizationId` | tenant scope (never the user's PII, just the id) |
| `userId` | actor id when authenticated |
| `route` / `job` | HTTP route or BullMQ job name |
| `msg`, `err` | message; serialized error (stack, type, code) |

### 2.2 Correlation id

- api generates a `correlationId` (UUIDv7) per inbound request if the client didn't send
  `X-Correlation-Id`, stores it in the request-scoped context, and returns it as a
  response header.
- When an event is published to the bus, the `correlationId` rides in the event envelope
  (see [../03 §5](../03-system-architecture.md#5-event-first-core)). Worker processors
  restore it into their logging context, so a projection log line can be traced back to the
  ingest request that caused it.
- The same id becomes the OTel trace's `trace_id` root attribute (§4) and the Sentry
  `transaction` tag (§5), so logs ⇄ traces ⇄ errors join on one key.

### 2.3 Levels & what we never log

| Level | Use |
|-------|-----|
| `error` | failed request/job after retries, unhandled exception → also to Sentry |
| `warn` | degraded but handled: retry, rate-limit backoff, circuit half-open |
| `info` | lifecycle: boot, job start/finish, integration sync summary |
| `debug` | dev / temporary prod diagnosis (gated by `LOG_LEVEL`, default `info`) |

- Default `LOG_LEVEL` is `info`. `debug` MAY be enabled per-service via env for a bounded
  window, then reverted.
- **MUST NOT** log: passwords, tokens, refresh/JWT contents, API keys, OAuth secrets, raw
  webhook bodies, agent event *payloads* containing activity detail, AI prompt/response
  content (`FR-AIU-02` keeps prompt content off by default). A pino **redaction** paths
  list enforces this (`authorization`, `*.password`, `*.token`, `set-cookie`, …). Redaction
  policy and the P0–P4 data classes live in
  [../06 — Security & Privacy](../06-security-privacy-consent.md).

---

## 3. Pillar 2 — Metrics

**Prometheus** scrapes `/metrics` on api and worker (exposed via **prom-client**).
We instrument to the **RED** method for request-driven surfaces (api, WS) and **USE**
for resources (VM, DB, Redis, queues).

- **RED** — Rate, Errors, Duration — for the api HTTP/WS layer and each BullMQ processor.
- **USE** — Utilization, Saturation, Errors — for CPU/RAM/disk, Postgres connections,
  Redis memory, queue depth.

### 3.1 Key application metrics

| Metric | Type | Notes / why |
|--------|------|-------------|
| `http_request_duration_seconds` | histogram | labels: `route`, `method`, `status`; source of API RED + p95 |
| `http_requests_total` | counter | 5xx rate = `NFR-AVAIL` signal |
| `ws_push_latency_seconds` | histogram | ingest→client push; **p95 target ≤ 2s** (`NFR-LATENCY`, `FR-EVT-04`) |
| `event_ingest_total` | counter | ingest rate by `source` (agent/github/jira/…) |
| `event_ingest_lag_seconds` | gauge | now − newest ingested event age; stalls if a source dies |
| `projection_lag_seconds` | gauge | now − timestamp of last event a projection consumed; the core "is the read model fresh" signal |
| `queue_depth` | gauge | waiting jobs per BullMQ queue |
| `queue_oldest_job_age_seconds` | gauge | age of oldest waiting job — backlog *severity*, better than depth alone |
| `job_duration_seconds` | histogram | per processor; worker RED-Duration |
| `job_failures_total` | counter | per processor; worker RED-Errors |
| `ai_token_spend_total` | counter | labels: `organizationId`, `model`; feeds AI cost dashboard + budget alerts (doc 07) |
| `external_api_ratelimit_remaining` | gauge | headroom from provider rate-limit headers (`github`, `jira`, calendars) |
| `external_api_requests_total` | counter | labels: `provider`, `status`; integration health |
| `db_pool_connections_in_use` / `_max` | gauge | Postgres saturation |
| `redis_stream_pending` | gauge | unacked Redis Streams entries per consumer group |

Node/process metrics (`process_*`, event-loop lag) come free from prom-client's default
registry and MUST stay enabled. Host metrics (CPU/RAM/disk) come from **node_exporter**;
container metrics from **cAdvisor**.

### 3.2 Scrape config

```yaml
# prometheus.yml (scrape section)
global:
  scrape_interval: 15s
  scrape_timeout: 10s
scrape_configs:
  - job_name: api
    metrics_path: /metrics
    static_configs: [{ targets: ["api:3000"] }]
  - job_name: worker
    metrics_path: /metrics
    static_configs: [{ targets: ["worker:3001"] }]
  - job_name: node
    static_configs: [{ targets: ["node-exporter:9100"] }]
  - job_name: cadvisor
    static_configs: [{ targets: ["cadvisor:8080"] }]
```

`/metrics` MUST be reachable only on the compose-internal network — never proxied through
Caddy to the public internet.

---

## 4. Pillar 3 — Tracing

**OpenTelemetry** (Node SDK) is initialized before the Nest app boots in both api and
worker. Auto-instrumentation covers HTTP, Sequelize/pg, Redis/ioredis, and BullMQ; we add
manual spans around **external integration calls** (GitHub/Jira/Teams/calendar) and **AI
model calls** (LangGraph nodes) because those are our tail-latency and cost hot spots.

- A trace spans **api request → event publish → worker projection/agent → external API →
  response**. Context propagates over the bus via the event envelope (same channel as
  `correlationId`, §2.2), so a trace does not break at the async boundary.
- Exporter: OTLP → a lightweight collector. MVP MAY export traces into **Grafana Tempo**
  (co-located) or sample into Cloud Trace. **Sampling** SHOULD be head-based ~10% in normal
  operation, 100% for errors, to keep VM cost down.

---

## 5. Error tracking — Sentry

Sentry (self-host is heavy; use **hosted Sentry free/team tier**) captures exceptions for
**api**, **worker**, and **web**.

- **Release tagging:** every deploy sets `SENTRY_RELEASE` to the git SHA (see
  [00 — GCP VM Deployment](./00-gcp-vm-deployment.md)); errors group by release so a
  regression points at the commit that introduced it.
- **Source maps:** web's Vite build uploads source maps to Sentry at build time and does
  **not** ship them to the browser — stack traces are readable in Sentry, not leaked to
  users.
- **Context, not PII:** attach `correlationId`, `organizationId`, `userId`, release, and
  `service`. Sentry's `beforeSend` scrubs the same redaction list as pino (§2.3).
- Errors above a threshold rate route to the same channels as alerts (§7).

---

## 6. Health & readiness

Two endpoints on api (and a minimal liveness on worker), built with `@nestjs/terminus`.

| Endpoint | Question | Checks | Consumers |
|----------|----------|--------|-----------|
| `/health` | "is the process alive?" | process up, event loop responsive | Docker `healthcheck`, Caddy, uptime pinger |
| `/ready`  | "can it serve traffic?" | Postgres `SELECT 1`, Redis `PING`, Qdrant readiness, MinIO reachable | compose start-order, load-shedding |

- `/health` MUST be cheap and dependency-free — a slow dependency MUST NOT fail liveness
  (that would cause a needless container kill/restart loop).
- `/ready` MAY return `503` when a dependency is down; the app stays *running* but signals
  "don't send me traffic yet." Caddy SHOULD gate on `/ready` before routing.

```ts
// api: health module (Nest + terminus), sketch
@Get('ready')
@HealthCheck()
ready() {
  return this.health.check([
    () => this.db.pingCheck('postgres', { timeout: 1000 }),
    () => this.redis.pingCheck('redis'),
    () => this.http.responseCheck('qdrant', `${QDRANT_URL}/readyz`, (r) => r.status === 200),
  ]);
}
```

Compose wiring (excerpt — full file in [01 — Docker Compose](./01-docker-compose.md)):

```yaml
# docker-compose.yml
services:
  api:
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/health"]
      interval: 15s
      timeout: 3s
      retries: 3
      start_period: 30s
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
```

---

## 7. Dashboards (Grafana)

Build these and keep them boring — a good dashboard is scannable in 10 seconds.

| # | Dashboard | Answers | Key panels |
|---|-----------|---------|------------|
| 1 | **System / USE** | Is the VM healthy? | CPU, RAM, disk % + free GB, load, per-container CPU/mem, network |
| 2 | **API RED** | Are we serving users well? | req rate, 5xx %, p50/p95/p99 latency by route, in-flight, WS connections |
| 3 | **Queue & Worker Health** | Is the worker keeping up? | queue depth, oldest-job age, job duration p95, failure rate, active/stalled jobs |
| 4 | **Event Pipeline Lag** | Is data fresh? | ingest rate by source, `event_ingest_lag`, `projection_lag`, `ws_push_latency` p95, Redis stream pending |
| 5 | **AI Cost** | Are we within budget? | token spend/hr by model & org, cumulative vs monthly cap, cost per insight (doc 07) |
| 6 | **Integrations** | Are external sources OK? | external req rate/errors by provider, rate-limit remaining, webhook lag |
| 7 | **DORA / Business** | Product-level signal | deployment freq, lead time, change-failure, MTTR (`FR-GH-04`), active orgs/users, recommendation action rate |

Dashboards 1–4 are the **on-call set** (linked from alerts). 5–7 are reviewed, not paged
on (except AI budget, §8). Every dashboard SHOULD template on `organizationId` where the
metric is tenant-labelled.

---

## 8. Alerting

Rules live in Prometheus / **Alertmanager**. Routing tiers:

- **PagerDuty-lite** (page a human): VM down, API hard-down, disk critical. On a solo/MVP
  team this MAY be **PagerDuty free**, **Opsgenie free**, or a phone-push via a dedicated
  Slack channel with sound.
- **Slack `#eos-alerts`** (default): everything warning/critical that isn't a hard page.
- **Email**: digest / low-urgency (cert expiry lead time, budget 80%).

| Alert | Condition (threshold) | Severity | Route |
|-------|-----------------------|----------|-------|
| API 5xx rate | 5xx / total > **2%** for 5m | critical | page + Slack |
| API p95 latency | route p95 > **1.5s** for 10m (dashboards ≤ 1.5s, `NFR-LATENCY`) | warning | Slack |
| WS push latency | `ws_push_latency` p95 > **2s** for 10m (`FR-EVT-04`) | warning | Slack |
| Queue backlog | `queue_oldest_job_age_seconds` > **300** for 10m | warning → critical @ 900 | Slack → page |
| Event ingest stalled | `event_ingest_lag_seconds` > **300** (any source) | critical | page + Slack |
| Projection lag | `projection_lag_seconds` > **120** for 10m | warning | Slack |
| Job failure spike | `rate(job_failures_total[5m])` > **0.1/s** | warning | Slack |
| Disk usage | filesystem used > **80%** | warning → critical @ 90% | Slack → page |
| DB connections | `in_use / max` > **80%** for 5m | warning | Slack |
| AI budget near cap | org spend ≥ **80%** of monthly cap | warning (email) / **95%** critical | Slack + email |
| External API rate-limit | `external_api_ratelimit_remaining` < **10%** | warning | Slack |
| TLS cert expiry | Caddy cert expires < **14d** | warning | email |
| VM / target down | uptime check fails **2** consecutive probes | critical | page |

Example rule:

```yaml
# alerts.yml
groups:
  - name: eos-api
    rules:
      - alert: ApiHigh5xxRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.02
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "API 5xx > 2% for 5m"
          runbook: "docs/deployment/03-observability.md#10-runbooks"
```

### 8.1 The VM is a SPOF

Prometheus and Alertmanager run **on the same VM** they watch — if the VM dies, they die
silently and no alert fires. Therefore an **external, off-box liveness probe is
mandatory**:

- A **GCP Cloud Monitoring uptime check** (or an external pinger such as UptimeRobot /
  Better Uptime) hits `https://<host>/health` every 60s from outside GCP and pages on
  failure. This is the *only* alert that can catch a full-VM outage, so it MUST route to
  the page tier and MUST NOT depend on anything running on the VM.
- Until we move off one node, this SPOF is the dominant risk to `NFR-AVAIL 99.5%` — call
  it out in the runbook and the scaling triggers (§11).

---

## 9. SLOs & error budgets

Measured over a rolling **28-day** window.

| SLO | Objective | Error budget | Measured by |
|-----|-----------|--------------|-------------|
| **API availability** | 99.5% of requests non-5xx (`NFR-AVAIL`) | 0.5% ≈ **3h 39m**/28d | `http_requests_total` |
| **Ingest → UI latency** | 95% of live updates ≤ 2s (`NFR-LATENCY`, `FR-EVT-04`) | 5% of pushes | `ws_push_latency_seconds` p95 |
| **Dashboard load** | 95% ≤ 1.5s (`NFR-LATENCY`) | 5% of loads | api route p95 for dashboard endpoints |
| **Event freshness** | `projection_lag` ≤ 60s, 99% of the time | 1% of samples | `projection_lag_seconds` |

Policy: when a monthly error budget is **>50% consumed**, feature-risky deploys pause and
reliability work takes priority until it recovers. Budget burn is a Grafana panel on
dashboard #2/#4.

---

## 10. Runbooks

Short, symptom-first. Each links to its on-call dashboard. Fuller recovery detail lives in
[00 — GCP VM Deployment › Backups](./00-gcp-vm-deployment.md#backups).

### 10.1 High queue backlog
- **Symptom:** `QueueBacklog` alert; oldest-job age climbing; UI data stale.
- **Diagnose:** Dashboard #3. Is it one queue or all? Check `job_failures_total`
  (poison-message retry loop?) and worker CPU/RAM (#1). Check Redis memory (#1).
- **Act:** If a single processor is failing → inspect the failing job's error in Sentry,
  fix or move it to the dead-letter set. If throughput-bound → **scale worker
  concurrency** (env) or add a second worker container (compose `--scale worker=2`; the
  bus is a consumer group, so this is safe). If Redis is saturated → free memory / raise
  `maxmemory`. Backfill catches up idempotently (`FR-EVT-02`).

### 10.2 Event ingest stalled
- **Symptom:** `EventIngestStalled`; `event_ingest_lag` high for one `source`.
- **Diagnose:** Dashboard #4 + #6. Is it one source (webhook/token issue) or all
  (bus/DB)? Check `external_api_*` for that provider; check the integration's last-sync log
  line by `correlationId`.
- **Act:** Per-source → re-validate webhook secret / OAuth token, replay missed webhooks
  via provider backfill (`FR-GH-06`). All sources → check Postgres write path and Redis
  Streams (`redis_stream_pending`); restart the ingest consumer. Confirm lag drains.

### 10.3 DB disk full
- **Symptom:** `DiskCritical`; Postgres write errors; api `/ready` failing on DB.
- **Diagnose:** `df -h`; largest tables/indexes; is it WAL, `events` growth, or logs? Check
  Loki/Prometheus local storage isn't the culprit.
- **Act:** Immediate — prune old container logs and rotate; drop retained Prometheus/Loki
  data past retention (§11). Structural — enforce **retention policies** on high-volume
  signal tables (`FR-ENT-02`), archive old events to MinIO/GCS, then **grow the persistent
  disk** (online resize on GCP). Never `DELETE` from the append-only `events` log without
  archiving first (breaks `NFR-EXPLAIN`).

### 10.4 External integration failing / rate-limited
- **Symptom:** `ExternalRateLimit` or provider 4xx/5xx spike; one source's data missing.
- **Diagnose:** Dashboard #6; `external_api_ratelimit_remaining`; provider status page.
- **Act:** Rate-limited → confirm token-bucket limiter is respecting `Retry-After`
  (per-org limiter, [../03 §9](../03-system-architecture.md#9-cross-cutting-concerns)),
  back off, prefer webhooks over polling. Auth failure → refresh/re-authorize the
  installation token. Provider outage → circuit-breaker opens, we degrade gracefully and
  reconcile via backfill when it recovers.

### 10.5 AI budget exhausted
- **Symptom:** `AiBudgetNearCap`/exhausted for an org; agents returning budget errors.
- **Diagnose:** Dashboard #5; per-org `ai_token_spend_total` vs cap; which model/agent
  dominates.
- **Act:** Model router should already down-route to cheaper models near the cap (doc 07);
  confirm it is. If a genuine cap → notify the org admin, and (per policy) pause
  non-essential agent runs while keeping user-facing Copilot on a cheap model. Investigate
  any spend anomaly (a loop / oversized RAG context) before raising the cap.

### 10.6 Restore from backup
- **Symptom:** data corruption, bad migration, or VM loss.
- **Diagnose:** Confirm scope (one tenant vs whole DB) and pick the latest **verified**
  backup point.
- **Act:** Follow [00 — GCP VM Deployment › Backups](./00-gcp-vm-deployment.md#backups): stop api/worker,
  restore Postgres dump + MinIO objects + Qdrant snapshot to a consistent timestamp, run
  migrations, replay/rebuild projections from the event log if needed (they are
  rebuildable by design, [../03 §5](../03-system-architecture.md#5-event-first-core)), then
  `/ready` → re-enable traffic. **Restores MUST be rehearsed** (§11), not first attempted
  during an incident.

---

## 11. Ops basics

### 11.1 Retention
- **Logs (Loki):** 14 days hot on-box; security/audit-relevant logs longer per
  [../06](../06-security-privacy-consent.md) (audit log is a DB concern, `FR-ENT-01`, not
  Loki).
- **Metrics (Prometheus):** 15 days local; downsample/long-term MAY go to Cloud Monitoring.
- **Traces (Tempo):** 3–7 days, sampled.
- These caps exist mainly to protect VM disk — retention is the first lever in the
  disk-full runbook (§10.3).

### 11.2 On-box stack vs offloading to GCP Cloud Ops
The self-hosted stack (Prometheus + Loki + Promtail + Grafana + Tempo) costs roughly
**0.7–1.2 GB RAM** on a VM whose main job is running the product. Trade-off:

| | Keep on-VM | Offload to GCP Cloud Monitoring/Logging |
|--|-----------|------------------------------------------|
| VM RAM | consumes ~1 GB we may need for api/worker | ~0, agents are thin |
| Cost | free (uses spare VM) | metered, but small at MVP volume; risks the `$300` credit (`NFR-COST`) |
| SPOF | **dies with the VM** (§8.1) | survives VM loss — better for outage alerting |
| Portability | fully ours, `NFR-PORT` | some GCP coupling |

**Recommendation:** MVP keeps **Grafana + Prometheus + Loki on-box** (cheap, rich, no
lock-in) **but** the uptime check and the paging alert live in **GCP Cloud Monitoring**
(§8.1) so a full-VM outage is still caught. If the VM gets RAM-starved before we scale
out, **offload logs first** (Promtail → Cloud Logging) since Loki is the heaviest tenant.

### 11.3 Backup verification
Backups that have never been restored are theatre. We **MUST**:
- Run daily automated backups (Postgres, MinIO, Qdrant) per
  [00 — GCP VM Deployment › Backups](./00-gcp-vm-deployment.md#backups).
- **Monthly**, restore the latest backup into a throwaway environment and assert row counts
  / a smoke query — a **restore drill**. A failed or skipped drill is a warning-level ops
  item.

### 11.4 Capacity signals — "time to scale off the single VM"
Any one sustained for a week is the trigger to plan the move to multiple nodes
(`NFR-SCALE` keeps this a config/topology change, not a rewrite):

- Host CPU > **70%** or RAM > **80%** sustained; swap in use.
- Worker cannot drain the queue at peak even at raised concurrency (§10.1 recurring).
- Postgres connection saturation or query p95 degrading with data growth.
- Disk growth curve hits the resize ceiling faster than retention can offset.
- Error budget (§9) chronically burning due to resource contention, not bugs.

First moves when triggered: split **worker** onto its own VM (bus is already a consumer
group), then **managed Postgres**, then put api behind >1 replica + a real load balancer —
at which point the VM-SPOF caveat (§8.1) is retired.

---

_See also: [00 — GCP VM Deployment](./00-gcp-vm-deployment.md) ·
[01 — Docker Compose](./01-docker-compose.md) ·
[00 — GCP VM Deployment › Backups](./00-gcp-vm-deployment.md#backups) ·
[../06 — Security, Privacy & Consent](../06-security-privacy-consent.md)_
