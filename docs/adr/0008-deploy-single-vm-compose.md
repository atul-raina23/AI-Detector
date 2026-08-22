# ADR-0008 — Single GCP VM + Docker Compose

**Status:** Accepted

## Context

The MVP must run inside the **GCP $300 free credit** (`NFR-COST`) and be operable by a small
team. The workload is `web` (static), `api`, `worker`, `postgres`, `redis`, `qdrant`, and
`minio` ([03 §4](../03-system-architecture.md)) — a handful of containers with modest,
predictable load. Kubernetes would give us orchestration, autoscaling, and rolling deploys,
but a managed control plane (GKE) plus node pools burns the credit fast and adds operational
surface (manifests, ingress, secrets, RBAC) that one or two engineers can't justify at MVP.
We must, however, keep the door open: the architecture is already a modular monolith with
ports, so it is **Kubernetes-ready** when scale demands it.

## Decision

Deploy all services as **Docker Compose** on **one GCP VM**, with **CI/CD over SSH**
(build + push images in GitHub Actions, `docker compose pull && up -d` on the VM). Caddy
terminates TLS and serves the static `web` bundle. See
[deployment/00](../deployment/00-gcp-vm-deployment.md) and
[deployment/01](../deployment/01-docker-compose.md).

## Consequences

**Good**

- Cheapest possible footprint — one VM stays comfortably inside the $300 credit (`NFR-COST`).
- Simplest ops: `docker compose` is the whole orchestration story; anyone can read it.
- Fast, understandable deploys over SSH; trivial local parity with the same compose file.
- Modular-monolith + ports design means the lift to K8s later is repackaging, not rewriting.

**Bad**

- **Single point of failure** — one VM, no HA; a host failure is downtime until restore.
- No autoscaling and manual vertical scaling; deploys have a brief gap unless we add care.
- Stateful containers (postgres, qdrant, minio) on one host make backups/DR our explicit job
  ([deployment/03](../deployment/03-observability.md)).
- SSH-based deploy is less auditable/repeatable than a declarative control plane.

## Alternatives considered

- **Kubernetes (GKE)** — HA, autoscaling, rolling deploys, but control-plane + node cost eats
  the credit and adds ops weight that's premature at MVP. Deferred until scale/SLA demand it.
- **Serverless (Cloud Run + managed PG/Redis)** — no VM to babysit, but long-lived WS/SSE, the
  stateful `worker`, and self-hosted Qdrant fit awkwardly, and managed data services cost more.
  Rejected for MVP.
- **PaaS (Render/Railway/Fly)** — nice DX, but weaker cost control against the specific GCP
  credit and less control over the co-located stateful services. Rejected.
