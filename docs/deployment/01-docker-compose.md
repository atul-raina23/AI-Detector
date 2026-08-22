# 01 — Docker & Docker Compose

How we containerize the Nx apps and run the whole stack on a single GCP VM with Docker Compose.
Read [00 — GCP VM Deployment](./00-gcp-vm-deployment.md) for the host itself, and
[../03 — System Architecture](../03-system-architecture.md) for the container topology this
implements. CI/CD that builds and ships these images is in [02 — CI/CD](./02-cicd.md).

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used per [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Design goals

| Goal | How we get there |
|------|------------------|
| **Small final images** | Multi-stage builds; prune to a single Nx app's build output; `node:22-alpine` runtime; no dev deps in the final layer |
| **Build once per commit** | One `deps` + `build` stage feeds all app images; Nx cache + BuildKit layer cache keep it fast |
| **Least privilege** | Every runtime stage runs as a **non-root** user; read-only root FS where possible |
| **Self-healing** | Every long-running service has a `HEALTHCHECK`; `depends_on: condition: service_healthy` sequences startup |
| **Fits a 2–4 GB VM** | Per-service `mem_limit`/`cpus`; web is static (served by Caddy), not a Node process |
| **Private by default** | DB/Redis/Qdrant/MinIO are on an **internal** network and NOT published to the host |

> The single-VM footprint is deliberate (`NFR-COST`, architecture §2). The same images run unchanged
> when we later split services across hosts — only the Compose file (or a future orchestrator) changes.

---

## 2. Multi-stage Dockerfiles for Nx apps

Nx builds every app into `dist/apps/<app>`. The pattern for the Node apps (`api`, `worker`) is
identical: **deps → build → prune → runtime**. We pass `--build-arg APP=<name>` so one Dockerfile
serves both backend apps.

### 2.1 NestJS `api` / `worker` — `apps/api/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7
# Build args select which Nx app this image is for.
ARG NODE_VERSION=22.11-alpine
ARG APP=api

# ---------- 1. deps: install ALL deps once, cache-friendly ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace
# Only the manifests first → this layer only busts when deps change.
COPY package.json package-lock.json nx.json tsconfig.base.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------- 2. build: compile the Nx app ----------
FROM deps AS build
ARG APP
ENV NX_DAEMON=false
COPY . .
# nx build produces dist/apps/$APP with a generated package.json listing prod deps only.
RUN --mount=type=cache,target=/workspace/.nx/cache \
    npx nx build ${APP} --configuration=production

# ---------- 3. prune: install ONLY the built app's prod deps ----------
FROM node:${NODE_VERSION} AS prune
ARG APP
WORKDIR /app
# Nx (@nx/webpack / @nx/esbuild) emits a trimmed package.json next to the bundle.
COPY --from=build /workspace/dist/apps/${APP}/package.json ./
COPY --from=build /workspace/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ---------- 4. runtime: tiny, non-root ----------
FROM node:${NODE_VERSION} AS runtime
ARG APP
ENV NODE_ENV=production \
    PORT=3000 \
    APP=${APP}
# tini for correct signal handling / zombie reaping; curl for the healthcheck.
RUN apk add --no-cache tini curl
WORKDIR /app
# node:alpine ships an unprivileged `node` user (uid 1000). Use it.
COPY --chown=node:node --from=prune /app/node_modules ./node_modules
COPY --chown=node:node --from=build  /workspace/dist/apps/${APP} ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD curl -fsS http://localhost:${PORT}/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "main.js"]
```

Notes:

- **Prune step is the payoff.** Nx's generated `dist/apps/<app>/package.json` lists only the deps that
  app actually imports (traced from the graph), so `npm ci --omit=dev` yields a `node_modules` a
  fraction of the monorepo's size. Final images land ~150–250 MB vs. ~1.5 GB for a naive copy.
- `worker` reuses this exact file: `--build-arg APP=worker`. It has no HTTP port, so its healthcheck
  probes a lightweight readiness endpoint the worker exposes on `PORT` (or a `node healthcheck.js`
  script). Keep the interface identical so Compose stays uniform.
- BuildKit `--mount=type=cache` keeps the npm cache and Nx cache **across CI runs** (see
  [02 — CI/CD §5](./02-cicd.md)), so unaffected builds are near-instant.

### 2.2 React `web` — `apps/web/Dockerfile`

The SPA is built to static assets and served by **Caddy**. No Node runtime in the final image.

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22.11-alpine
ARG CADDY_VERSION=2.8-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace
COPY package.json package-lock.json nx.json tsconfig.base.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS build
ENV NX_DAEMON=false
# Vite bakes VITE_* vars at build time; pass the API origin in.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
COPY . .
RUN --mount=type=cache,target=/workspace/.nx/cache \
    npx nx build web --configuration=production
# → dist/apps/web (index.html + hashed assets)

# ---------- runtime: static files behind Caddy ----------
FROM caddy:${CADDY_VERSION} AS runtime
COPY --from=build /workspace/dist/apps/web /srv
COPY deployment/caddy/web.Caddyfile /etc/caddy/Caddyfile
# caddy:alpine already runs healthy as root-capable but drops privs for workers.
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -q --spider http://localhost:8080/ || exit 1
```

> In production we usually let the **edge Caddy** (see §4) serve the SPA and reverse-proxy `/api`,
> making a separate `web` container optional. We keep the `web` image because it lets us serve the
> SPA from a CDN or a second host later with zero changes. Pick one; don't run both for the same route.

### 2.3 `.dockerignore` (repo root) — MANDATORY

Without this the build context is gigabytes and layer cache is useless.

```gitignore
node_modules
dist
tmp
.nx/cache
.git
**/*.log
**/.env*
coverage
```

---

## 3. `docker-compose.yml` — production topology

This is the file deployed to the VM. It references images by tag (set by CI, see §6) and reads
secrets from `env_file`, never inline. Ports for datastores are **not** published.

```yaml
# docker-compose.yml — production (single GCP VM)
name: eos

x-logging: &default-logging      # cap log growth on a small disk
  driver: json-file
  options: { max-size: "10m", max-file: "3" }

networks:
  edge:      # public-facing (only caddy binds host ports)
    driver: bridge
  internal:  # app ↔ datastores; NOT reachable from the host
    driver: bridge
    internal: true

volumes:
  pg-data:
  redis-data:
  qdrant-data:
  minio-data:
  caddy-data:
  caddy-config:

services:
  # ---------------- edge / reverse proxy ----------------
  caddy:
    image: caddy:2.8-alpine
    restart: unless-stopped
    depends_on:
      api: { condition: service_healthy }
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deployment/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks: [edge, internal]
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "0.50", memory: 128M } }

  # ---------------- application ----------------
  api:
    image: ghcr.io/eos/api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file: [./.env]
    environment:
      NODE_ENV: production
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
      qdrant:   { condition: service_healthy }
      minio:    { condition: service_healthy }
    networks: [internal]        # reached only via caddy
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/health"]
      interval: 15s
      timeout: 3s
      retries: 5
      start_period: 30s
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "1.0", memory: 768M } }

  worker:
    image: ghcr.io/eos/worker:${IMAGE_TAG:-latest}
    restart: unless-stopped
    env_file: [./.env]
    environment:
      NODE_ENV: production
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
      qdrant:   { condition: service_healthy }
    networks: [internal]
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 20s
      timeout: 3s
      retries: 5
      start_period: 30s
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "0.75", memory: 640M } }

  # ---------------- datastores (internal only) ----------------
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: [./.env]           # POSTGRES_USER / _PASSWORD / _DB
    volumes:
      - pg-data:/var/lib/postgresql/data
    networks: [internal]         # note: NO `ports:` — not published
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "0.75", memory: 512M } }

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "256mb", "--maxmemory-policy", "noeviction"]
    volumes:
      - redis-data:/data
    networks: [internal]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "0.50", memory: 320M } }

  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    volumes:
      - qdrant-data:/qdrant/storage
    networks: [internal]
    healthcheck:
      # qdrant image has no curl; use its TCP readiness via the bundled probe.
      test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/localhost/6333' || exit 1"]
      interval: 15s
      timeout: 3s
      retries: 5
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "0.50", memory: 512M } }

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    env_file: [./.env]           # MINIO_ROOT_USER / _PASSWORD
    volumes:
      - minio-data:/data
    networks: [internal]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 15s
      timeout: 5s
      retries: 5
    logging: *default-logging
    deploy:
      resources: { limits: { cpus: "0.50", memory: 384M } }

  # ---------------- one-shot migration runner (see §5) ----------------
  migrate:
    image: ghcr.io/eos/api:${IMAGE_TAG:-latest}
    profiles: ["tools"]          # never starts with `up`; run explicitly
    env_file: [./.env]
    depends_on:
      postgres: { condition: service_healthy }
    networks: [internal]
    restart: "no"
    command: ["node", "main.js", "--migrate"]   # or: npx sequelize-cli db:migrate
```

### 3.1 Why these choices

- **Two networks.** Only `caddy` sits on `edge` and binds host `80/443`. Everything else is on
  `internal: true`, which Docker makes non-routable from the host — so `postgres`/`redis`/`qdrant`/
  `minio` have **no** `ports:` and cannot be reached from outside the VM. This is the primary network
  control referenced in [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md).
- **Named volumes**, not bind mounts, for all state → survive `down`/`up`, easy to snapshot, correct
  ownership. Back them up per [00 §backups](./00-gcp-vm-deployment.md).
- **`deploy.resources.limits`** are honored by `docker compose up` (Compose v2). The sum below leaves
  headroom on a 4 GB VM; drop `worker`/`qdrant` limits if you target 2 GB.
- **`redis` `noeviction`** because it backs BullMQ — silently evicting job data is worse than an error.
- **`$$`** escapes `$` so the value is expanded inside the container (by `pg_isready`), not by Compose.

**Rough memory budget (4 GB VM):**

| Service | Limit | Service | Limit |
|---------|-------|---------|-------|
| api | 768M | qdrant | 512M |
| worker | 640M | minio | 384M |
| postgres | 512M | caddy | 128M |
| redis | 320M | **Σ** | **~3.3G** (leaves ~700M for host/OS) |

---

## 4. Edge Caddy config

`deployment/caddy/Caddyfile` terminates TLS (auto Let's Encrypt), serves the SPA, and proxies the API.

```caddyfile
{$EOS_DOMAIN} {
    encode zstd gzip
    # API + realtime (WS/SSE) → api service on the internal network
    handle /api/* {
        reverse_proxy api:3000
    }
    handle /health {
        reverse_proxy api:3000
    }
    # Everything else = the SPA (served from the web image or a mounted dist)
    handle {
        reverse_proxy web:8080
    }
}
```

TLS certs persist in the `caddy-data` volume. Point DNS at the VM and Caddy provisions HTTPS on boot.

---

## 5. Database migrations — one-shot, not on boot

Migrations MUST run as a discrete step, **before** the new `api`/`worker` start serving, and MUST NOT
run automatically inside the app's `CMD` (that races across replicas and hides failures). We use the
`migrate` service (§3, `profiles: ["tools"]`, `restart: "no"`) built from the **same image** as `api`,
so the migration code always matches the deployed code.

```bash
# Run migrations once; exits 0 on success, non-zero on failure.
docker compose --profile tools run --rm migrate
```

CI runs exactly this between `pull` and the rolling `up` (see [02 — CI/CD §4](./02-cicd.md)). Because
migrations are **forward-only and additive** (expand/contract), the old image keeps working against the
new schema, which is what makes the rollback in §6 safe.

---

## 6. Image tagging strategy

Every image is tagged with the **immutable git SHA** and a **moving `latest`** (per default branch).
CI builds `ghcr.io/eos/<app>:<sha>` and also pushes `:latest`. Deploys pin a specific `IMAGE_TAG`
(the SHA) so a host restart can never silently pull newer code.

| Tag | Meaning | Used for |
|-----|---------|----------|
| `:<git-sha>` | Exact commit; immutable | What the VM actually runs (`IMAGE_TAG` in `.env`) |
| `:latest` | Tip of `main` | Convenience / manual pulls only |
| `:pr-<n>` (optional) | PR preview build | Ephemeral env, GC'd on merge |

Deploy flow on the VM (driven by CI over SSH — full workflow in [02 — CI/CD](./02-cicd.md)):

```bash
export IMAGE_TAG=$GIT_SHA            # written into .env by the deploy job
docker compose pull                  # fetch the pinned SHA tags
docker compose --profile tools run --rm migrate
docker compose up -d --remove-orphans
# health gate; on failure, roll back to the previous SHA (see 02 §4)
```

> `IMAGE_TAG` is stored in `.env` alongside secrets and is the single source of truth for "what's
> deployed." Keep the **previous** value in `.env.previous` so rollback is one variable swap.

---

## 7. `docker-compose.override.yml` — local development

Compose auto-merges `docker-compose.override.yml` on top of the base file for **local dev only** (it is
git-ignored on the server). It swaps images for bind-mounted source with hot reload, **exposes** ports
for debugging, and adds **MailHog** for email testing.

```yaml
# docker-compose.override.yml — LOCAL DEV ONLY (never deployed)
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: build          # stop at the build stage; run nx serve instead
      args: { APP: api }
    command: ["npx", "nx", "serve", "api", "--host", "0.0.0.0"]
    environment:
      NODE_ENV: development
      NX_DAEMON: "true"      # daemon ON locally for fast rebuilds
    volumes:
      - ./:/workspace         # live source
      - /workspace/node_modules
    ports:
      - "3000:3000"           # expose for local curl / debugger
    deploy: {}                # drop prod resource limits

  worker:
    build: { context: ., dockerfile: apps/api/Dockerfile, target: build, args: { APP: worker } }
    command: ["npx", "nx", "serve", "worker"]
    volumes: ["./:/workspace", "/workspace/node_modules"]

  web:
    build: { context: ., dockerfile: apps/web/Dockerfile, target: build }
    command: ["npx", "nx", "serve", "web", "--host", "0.0.0.0"]
    volumes: ["./:/workspace", "/workspace/node_modules"]
    ports: ["4200:4200"]

  # Expose datastores locally so you can inspect them from the host.
  postgres:
    ports: ["5432:5432"]
  redis:
    ports: ["6379:6379"]
  qdrant:
    ports: ["6333:6333"]
  minio:
    ports: ["9000:9000", "9001:9001"]   # API + console

  # Catch outbound email in dev.
  mailhog:
    image: mailhog/mailhog:latest
    ports: ["1025:1025", "8025:8025"]    # SMTP + web UI
    networks: [internal]
```

```bash
docker compose up            # base + override merged automatically
docker compose -f docker-compose.yml up   # base ONLY = production-like
```

> Publishing datastore ports is fine on a laptop; it MUST NOT happen on the VM. That is exactly why the
> `ports:` for datastores live only in the override file, which never reaches the server.

---

## 8. Nx build behavior in containers & CI

- **`NX_DAEMON=false`** in every build stage and in CI. The daemon caches nothing useful in a one-shot
  container and can hang the build; turn it off. (Local dev keeps it on — §7.)
- **Cache the Nx cache**, not just `node_modules`. The `--mount=type=cache,target=/workspace/.nx/cache`
  in the build stages, plus the GitHub Actions Nx cache in [02 §5](./02-cicd.md), mean an unaffected
  app rebuilds from cache in seconds.
- **`nx affected` decides what to build.** CI only builds the apps a commit actually touched (via the
  Nx project graph). The Dockerfiles above are invoked once per affected app with the right `APP` arg.
- **Determinism.** Pin base image tags to a minor (`node:22.11-alpine`), commit `package-lock.json`,
  and use `npm ci` (never `npm install`) so image contents are reproducible for a given SHA.

---

## 9. Operational cheatsheet

```bash
# What's running + health
docker compose ps
docker compose logs -f api worker            # tail app logs

# Apply a new release (normally CI does this)
export IMAGE_TAG=<git-sha>
docker compose pull && docker compose --profile tools run --rm migrate && docker compose up -d

# Roll back to the previous image
export IMAGE_TAG=$(grep -E '^IMAGE_TAG=' .env.previous | cut -d= -f2)
docker compose up -d

# Back up Postgres volume (see 00 for the scheduled version)
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > pg-$(date +%F).sql.gz

# Reclaim space after many deploys
docker image prune -f
```

---

## 10. Checklist before first deploy

- [ ] `.dockerignore` present; build context < ~50 MB.
- [ ] `.env` on the VM has all required keys (config module fails fast if not — architecture §9).
- [ ] Datastore services have **no** `ports:` in `docker-compose.yml`.
- [ ] Every service has a `HEALTHCHECK` and appropriate `deploy.resources.limits`.
- [ ] `migrate` runs green before the first `up`.
- [ ] Caddy `EOS_DOMAIN` set and DNS points at the VM (TLS auto-provisions).
- [ ] Log rotation (`max-size`/`max-file`) applied so the disk can't fill.

---

_Next: [02 — CI/CD](./02-cicd.md) · Related: [00 — GCP VM Deployment](./00-gcp-vm-deployment.md),
[03 — Observability](./03-observability.md), [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md),
[../09 — Testing Strategy](../09-testing-strategy.md)_
