# 00 — GCP Single-VM Deployment Runbook

Practical, copy-pasteable, end-to-end guide to run **EngineeringOS AI** on **one GCP VM** with
**Docker Compose**, inside the **$300 / 90-day free-trial credit** (`NFR-COST`). No Kubernetes, no
managed control plane — a modular monolith (`api` + `worker`) plus its datastores, all on a single
box, provisioned and deployed over SSH.

Container inventory comes from [03 — System Architecture §4](../03-system-architecture.md#4-c4--level-2-containers):
`web` (static build served by Caddy), `api` (NestJS), `worker` (NestJS headless), `postgres`,
`redis`, `qdrant`, `minio` (S3-compatible). LangGraph AI calls go **out** to external model APIs
(Claude / OpenAI / Gemini) — no GPU or model hosting on this VM.

> **Related docs:** [01 — Docker Compose](./01-docker-compose.md) · [02 — CI/CD](./02-cicd.md) ·
> [03 — Observability](./03-observability.md) · [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md)

This runbook uses **RFC 2119** keywords (MUST / SHOULD / MAY) for requirements.

---

## 1. Cost planning

The whole point of the single-VM shape is `NFR-COST`: MVP (1 org / ~20 users, `NFR-SCALE`) MUST fit
inside the free credit. The dominant *variable* cost is LLM spend (budgeted separately in doc 07);
this doc controls the *fixed* infra cost.

### 1.1 Why not "Always Free" e2-micro

GCP's Always Free tier includes one `e2-micro` (2 vCPU burst, **1 GB RAM**). We run **seven**
containers, three of which (Postgres, Qdrant, MinIO) are memory-hungry and one (NestJS worker running
LangGraph + BullMQ) is CPU-spiky. 1 GB will OOM-kill under any real load. It is unusable here — do not
try to save the credit on it. The credit exists precisely so we can size correctly for 90 days.

### 1.2 Recommended shape

Start on **`e2-medium`** (2 vCPU shared, **4 GB RAM**) for a demo/single-tenant MVP. Move to
**`e2-standard-2`** (2 vCPU, **8 GB RAM**) if the worker + Qdrant + Postgres working set gets tight
(watch `free -m` and swap usage; see §9). Resizing is a stop → change machine type → start, ~2 min.

| Item | Spec | ~ US region list price | In the $300 credit |
|------|------|------------------------|--------------------|
| VM `e2-medium` | 2 vCPU (shared) / 4 GB | ~$25 / mo | ✅ |
| VM `e2-standard-2` | 2 vCPU / 8 GB | ~$49 / mo | ✅ (still < $150/90d) |
| Boot + data disk | 50 GB balanced PD (pd-balanced) | ~$5 / mo | ✅ |
| Static external IP (in use) | 1 IPv4, attached | ~$3 / mo | ✅ |
| GCS backup bucket | Standard, single region, < 10 GB | ~$0.20 / mo | ✅ |
| Egress | Modest (webhooks, API responses) | a few $/mo | ✅ |
| **Total (e2-medium)** | | **~$35 / mo** | **~$105 over 90 days** |
| **Total (e2-standard-2)** | | **~$60 / mo** | **~$180 over 90 days** |

Either shape leaves comfortable headroom in $300 across the 90-day trial, with the rest reserved for
LLM API spend.

### 1.3 Avoiding surprise costs

- You **MUST** set a **budget alert** before creating anything (§1.4). The trial does not auto-charge,
  but alerts catch runaway egress or an accidental large disk.
- **Egress is the classic surprise.** Keep heavy services (Postgres, MinIO, Qdrant) **internal only**
  (§8) — no public data transfer. Serve only compressed API/JSON + the static SPA.
- Use **one static IP** and keep it **attached** — an *unattached* reserved IP is billed at a higher
  idle rate. Release it at teardown (§12).
- **Stop the VM when idle** during development. A **stopped** VM bills **$0 for compute**; you still
  pay for the persistent disk (~$5/mo) and the static IP. `gcloud compute instances stop eos-vm`.
- Snapshots/images accumulate — prune old ones.
- **MUST NOT** enable Cloud NAT, external load balancers, or Cloud SQL "just in case" — none are needed
  for a single VM and they bill hourly.

### 1.4 Budget alert (do this first)

```bash
# Find your billing account id
gcloud billing accounts list

# Create a $250 budget with alerts at 50/90/100% (email to the billing admins)
gcloud billing budgets create \
  --billing-account="0X0X0X-0X0X0X-0X0X0X" \
  --display-name="EngineeringOS free-trial guard" \
  --budget-amount=250USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

---

## 2. Provisioning the VM

Prereqs: `gcloud` CLI installed and `gcloud init` / `gcloud auth login` done, a project selected.

```bash
# 0. Set project + defaults (pick a region near your users; us-central1 is cheap)
export PROJECT_ID="engineeringos-mvp"
export REGION="us-central1"
export ZONE="us-central1-a"
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"
gcloud config set compute/zone "$ZONE"

# 1. Enable the APIs we use
gcloud services enable compute.googleapis.com storage.googleapis.com \
  secretmanager.googleapis.com iap.googleapis.com

# 2. Reserve a static external IP (attach it in step 4)
gcloud compute addresses create eos-ip --region="$REGION"
gcloud compute addresses describe eos-ip --region="$REGION" \
  --format='get(address)'   # <-- note this IP for DNS (§5)

# 3. Firewall: allow HTTP/HTTPS from the world; SSH only via IAP range
gcloud compute firewall-rules create eos-allow-web \
  --direction=INGRESS --action=ALLOW --rules=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0 --target-tags=eos-web

gcloud compute firewall-rules create eos-allow-ssh-iap \
  --direction=INGRESS --action=ALLOW --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags=eos-web
```

> **SSH via IAP** (`35.235.240.0/20` is Google's IAP TCP-forwarding range) means port 22 is **never
> exposed to the public internet** — you tunnel through Google's identity-aware proxy. If you prefer a
> plain key-based SSH from your office IP instead, replace the source range with `YOUR.IP.ADDR.0/32`.

```bash
# 4. Create the VM (Ubuntu 24.04 LTS, 50 GB balanced disk, static IP, web tag)
gcloud compute instances create eos-vm \
  --zone="$ZONE" \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-balanced \
  --address=eos-ip \
  --tags=eos-web \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring
```

The firewall targets the `eos-web` tag, so only tagged instances are reachable. Egress is
default-allow (fine — no NAT needed since the VM has an external IP for outbound model API calls).

---

## 3. First-time server setup (over SSH)

Connect through IAP (no public SSH port):

```bash
gcloud compute ssh eos-vm --zone="$ZONE" --tunnel-through-iap
```

Everything below runs **on the VM**. Do it once.

### 3.1 Base packages, swap, unattended upgrades

```bash
sudo apt-get update && sudo apt-get -y upgrade

# 4 GB swap — cheap insurance against OOM on e2-medium (see §9)
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf

# Automatic security patches
sudo apt-get -y install unattended-upgrades fail2ban
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
```

### 3.2 Install Docker Engine + Compose plugin

```bash
# Official Docker apt repo
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

docker --version && docker compose version
```

### 3.3 Create a non-root deploy user

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker,sudo deploy
# Reuse your SSH key for the deploy user (IAP maps your Google identity; this covers key-based too)
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys 2>/dev/null || true
sudo chown -R deploy:deploy /home/deploy/.ssh && sudo chmod 700 /home/deploy/.ssh
```

### 3.4 Harden SSH + host firewall

```bash
# SSH: key-only, no root, no passwords
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Host firewall (defence-in-depth behind the cloud firewall)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# fail2ban is already protecting sshd from its default jail
sudo systemctl enable --now fail2ban
```

> The cloud firewall (§2) already restricts 22 to the IAP range; ufw + fail2ban are belt-and-braces.
> Ports for Postgres/Redis/Qdrant/MinIO are **never** opened — they live on Docker's internal network
> only (§8).

---

## 4. Directory layout on the server

Reconnect as `deploy` and lay out `/opt/engineeringos`:

```bash
gcloud compute ssh deploy@eos-vm --zone="$ZONE" --tunnel-through-iap

sudo mkdir -p /opt/engineeringos && sudo chown deploy:deploy /opt/engineeringos
cd /opt/engineeringos
mkdir -p caddy/data caddy/config backups
```

```
/opt/engineeringos
├── compose.yaml        # the production stack (from deployment/01, pinned image tags)
├── Caddyfile           # reverse proxy + auto-TLS (§5)
├── .env                # secrets — NEVER in git (§6)
├── caddy/              # Caddy's persisted certs/state (a Docker volume mount)
├── backups/            # transient pg_dump output before GCS upload (§10)
└── scripts/
    ├── backup.sh
    └── restore.sh
```

The `compose.yaml` itself is maintained in the repo and documented in
[01 — Docker Compose](./01-docker-compose.md); CI builds and pushes the images. You place the
production copy here (via `git pull` of the ops repo, or `scp`).

---

## 5. Domain + TLS with Caddy

We front `api` and `web` with **Caddy** because it does **automatic Let's Encrypt** certificate
issuance and renewal with zero cron jobs. It is the only container that binds host ports 80/443.

### 5.1 DNS

Create an **A record** pointing your host at the static IP from §2:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `app.example.com` | `<eos-ip address>` | 300 |
| A | `api.example.com` | `<eos-ip address>` | 300 |

Wait for propagation (`dig +short app.example.com` should return the IP) **before** starting Caddy, or
the ACME challenge fails.

### 5.2 Caddyfile

`web` is a static SPA build; Caddy serves it directly from a mounted volume and reverse-proxies the
API. Adjust hostnames + upstream service names to match `compose.yaml`.

```caddyfile
# /opt/engineeringos/Caddyfile

app.example.com {
    encode zstd gzip
    root * /srv/web            # static SPA build, mounted from the web image/volume
    try_files {path} /index.html   # SPA history fallback
    file_server
}

api.example.com {
    encode zstd gzip
    reverse_proxy api:3000    # 'api' = compose service name on the internal network
    # WebSocket / SSE (FR-EVT-04) pass through reverse_proxy transparently
}
```

Caddy obtains and renews certs automatically for both hostnames. Point the ACME account at your email
via the compose env (`CADDY_ACME_EMAIL`) so you get expiry warnings.

### 5.3 CORS / host config

The API MUST restrict CORS to the SPA origin and trust the proxy headers:

```dotenv
# in .env (consumed by the api service)
APP_URL=https://app.example.com
API_URL=https://api.example.com
CORS_ORIGINS=https://app.example.com
TRUST_PROXY=1          # NestJS behind Caddy — honour X-Forwarded-* for correct client IPs / rate limits
COOKIE_DOMAIN=.example.com
```

---

## 6. Application deployment

### 6.1 Secrets: the `.env` file

Secrets **MUST NOT** live in git (`NFR-SEC`, and see [../06 — Security](../06-security-privacy-consent.md)).
Two acceptable ways to get `.env` onto the box:

**Option A — Secret Manager (preferred):** store the rendered env as a secret and pull it at deploy
time (the VM's service account needs `roles/secretmanager.secretAccessor`):

```bash
# One-time: create the secret from a local, git-ignored file
gcloud secrets create eos-env --data-file=./.env.production

# On the VM at deploy time:
gcloud secrets versions access latest --secret=eos-env > /opt/engineeringos/.env
chmod 600 /opt/engineeringos/.env
```

**Option B — scp once** (simpler, acceptable for a demo):

```bash
gcloud compute scp ./.env.production deploy@eos-vm:/opt/engineeringos/.env \
  --zone="$ZONE" --tunnel-through-iap
```

`.env` MUST contain the DB/Redis/MinIO credentials, JWT signing keys, OAuth client secrets, and the
**external model API keys** (Claude/OpenAI/Gemini). File perms MUST be `600`, owner `deploy`.

### 6.2 Pull images from GHCR and start

CI publishes tagged images to **GitHub Container Registry** (see [02 — CI/CD](./02-cicd.md)). The
production `compose.yaml` references immutable tags, e.g. `ghcr.io/<org>/eos-api:<git-sha>`, and reads
the tag from `.env` (`IMAGE_TAG=<git-sha>`).

```bash
cd /opt/engineeringos

# Log in to GHCR with a read-only PAT (or a deploy token from CI)
echo "$GHCR_TOKEN" | docker login ghcr.io -u <github-user> --password-stdin

docker compose pull
docker compose up -d
```

### 6.3 Database migrations (one-shot)

Run Sequelize migrations as a **one-off container** against the running Postgres, **before** the app
serves traffic. Never bake migrations into the app's startup path.

```bash
docker compose run --rm api node dist/apps/api/main.js migrate
# or, if migrations are a dedicated command:
docker compose run --rm api npx sequelize-cli db:migrate
```

### 6.4 Health checks

```bash
# Liveness/readiness endpoints exposed by the NestJS api
curl -fsS https://api.example.com/health/live
curl -fsS https://api.example.com/health/ready   # checks pg, redis, qdrant, minio

docker compose ps            # all services 'running (healthy)'
```

The `compose.yaml` SHOULD declare `healthcheck:` + `depends_on: condition: service_healthy` so
`api`/`worker` wait for `postgres`/`redis`/`qdrant` to be ready (detailed in
[01 — Docker Compose](./01-docker-compose.md)).

---

## 7. Zero-to-running checklist

Do these in order. Each links to its section.

1. [ ] Set a **budget alert** (§1.4).
2. [ ] `gcloud` project, region, zone, and APIs enabled (§2).
3. [ ] Reserve **static IP**; create **firewall rules** (80/443 public, 22 via IAP) (§2).
4. [ ] Create the **VM** (`e2-medium`, Ubuntu 24.04, 50 GB, `eos-web` tag) (§2).
5. [ ] SSH in; **swap**, **unattended-upgrades**, **fail2ban** (§3.1).
6. [ ] Install **Docker + Compose plugin** (§3.2).
7. [ ] Create **deploy user**; **harden SSH**; **ufw** (§3.3–3.4).
8. [ ] Create `/opt/engineeringos` **layout** (§4).
9. [ ] Add **DNS A records** → static IP; wait for propagation (§5.1).
10. [ ] Place **`Caddyfile`** and **`compose.yaml`** (§4–5).
11. [ ] Deliver **`.env`** via Secret Manager or scp; `chmod 600` (§6.1).
12. [ ] `docker login ghcr.io`; `docker compose pull` (§6.2).
13. [ ] `docker compose up -d` (§6.2).
14. [ ] Run **migrations** one-shot (§6.3).
15. [ ] Verify **health checks** + HTTPS certs issued (§6.4).
16. [ ] Configure **nightly backup** cron (§10).
17. [ ] Wire **monitoring/observability** ([03 — Observability](./03-observability.md)).

---

## 8. Security (single-VM baseline)

Aligns with `NFR-SEC` and [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md).

- **Firewall minimalism:** only **80/443** are public; **22** is IAP-only. Everything else is denied
  at both the cloud firewall and ufw.
- **Datastores are never exposed.** In `compose.yaml`, `postgres`, `redis`, `qdrant`, and `minio` MUST
  NOT publish host ports (`ports:`) — they communicate over a private Docker **bridge network** and are
  reachable only by `api`/`worker` by service name. Only `caddy` publishes `80:80` and `443:443`.
- **Secrets** live in `.env` (perms `600`) sourced from Secret Manager, never in git, never in the
  image. Rotate JWT keys and model API keys per the security doc.
- **Automatic updates:** `unattended-upgrades` patches the host; re-`pull` images to pick up rebuilt
  app/base layers (dependency scanning gates them in CI, [02 — CI/CD](./02-cicd.md)).
- **Least-privilege VM service account:** grant only `secretmanager.secretAccessor` and
  `storage.objectAdmin` (for backups), nothing else.
- **Shielded VM** (secure boot / vTPM) was enabled at creation.

Example of the *internal-only* pattern (full file in [01](./01-docker-compose.md)):

```yaml
services:
  postgres:
    image: postgres:16
    networks: [internal]     # no 'ports:' — not reachable from outside the host
    volumes: [pgdata:/var/lib/postgresql/data]
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]   # the ONLY public ports
    networks: [internal]
networks:
  internal:
    driver: bridge
```

---

## 9. Operations

### 9.1 Logs

```bash
cd /opt/engineeringos
docker compose logs -f api                 # follow one service
docker compose logs --since=1h worker      # last hour
docker compose logs -f api worker | grep '"level":"error"'   # structured JSON logs (NFR-OBS)
```

Ship logs/metrics/traces to the stack in [03 — Observability](./03-observability.md); this box only
holds the last N MB via Docker's `json-file` log rotation (`max-size` / `max-file` in compose).

### 9.2 Restart / update a service

```bash
docker compose restart api                 # restart in place
docker compose pull api && docker compose up -d api   # pull new tag + recreate
```

### 9.3 Roll back to a previous image tag

Because images are pinned by immutable `<git-sha>` tags, rollback is a one-line env change:

```bash
# .env: IMAGE_TAG=<previous-good-sha>
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<previous-good-sha>/' .env
docker compose pull && docker compose up -d
# If the bad release ran a forward-only migration, restore DB from backup first (§10.3).
```

Keep the last few known-good SHAs noted somewhere; don't rely on `:latest`.

### 9.4 Monitoring hookup

Health endpoints (§6.4) + structured logs feed the observability stack. Configure uptime checks,
dashboards, and alerting per [03 — Observability](./03-observability.md). At minimum, add a GCP uptime
check hitting `https://api.example.com/health/ready` and alert on disk > 80% and swap-in spikes.

### 9.5 When to move off the single VM (scale note)

Single VM targets `NFR-AVAIL` 99.5% for the MVP (~20 users). Migrate when you hit any of:

- Sustained CPU > 70% or RAM pressure that `e2-standard-2` can't absorb.
- More than a handful of tenants, or an availability target above 99.5% (a single VM cannot do HA —
  host maintenance = downtime).
- The worker needs to scale horizontally beyond one box.

The architecture was built for this: `api`/`worker` are stateless and the `EventBus`/repository ports
mean no caller changes (`NFR-SCALE`, [03 §2 & §10](../03-system-architecture.md#2-style-modular-monolith--services-when-needed)).
The forward path is managed Postgres/Redis + the same images on Kubernetes — same containers, new
substrate.

---

## 10. Backups

### 10.1 GCS bucket + service account

```bash
gcloud storage buckets create gs://eos-backups-$PROJECT_ID \
  --location="$REGION" --uniform-bucket-level-access

# Lifecycle: delete objects older than 30 days (retention)
cat > /tmp/lifecycle.json <<'JSON'
{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}
JSON
gcloud storage buckets update gs://eos-backups-$PROJECT_ID --lifecycle-file=/tmp/lifecycle.json
```

### 10.2 Nightly `pg_dump` script

`/opt/engineeringos/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/engineeringos
BUCKET="gs://eos-backups-engineeringos-mvp"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="backups/pg-${STAMP}.sql.gz"

# Dump from inside the running postgres container, gzip on the fly
docker compose exec -T postgres pg_dumpall -U "$POSTGRES_USER" | gzip > "$FILE"

# Upload, then remove local copy
gcloud storage cp "$FILE" "$BUCKET/postgres/"
rm -f "$FILE"
echo "backup ok: $BUCKET/postgres/$(basename "$FILE")"
```

Schedule it (as `deploy`, sourcing `.env` for `POSTGRES_USER`):

```bash
chmod +x /opt/engineeringos/scripts/backup.sh
( crontab -l 2>/dev/null; \
  echo "15 3 * * * set -a; . /opt/engineeringos/.env; /opt/engineeringos/scripts/backup.sh >> /opt/engineeringos/backups/backup.log 2>&1" \
) | crontab -
```

### 10.3 Restore procedure

```bash
# 1. Fetch the chosen dump
gcloud storage cp gs://eos-backups-$PROJECT_ID/postgres/pg-<STAMP>.sql.gz /tmp/

# 2. Stop app writers so nothing races the restore
docker compose stop api worker

# 3. Restore into Postgres (pg_dumpall output includes CREATE DATABASE/roles)
gunzip -c /tmp/pg-<STAMP>.sql.gz | \
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres

# 4. Bring the app back
docker compose start api worker
```

### 10.4 Volume / object backup note

Postgres is the source of truth, so `pg_dump` is the primary. **Qdrant** vectors are rebuildable by
re-embedding from Postgres/source docs (`NFR-EXPLAIN`, projections are replayable), so they are
lower-priority — but you SHOULD also snapshot the named volumes periodically:

```bash
# Ad-hoc: tar the qdrant + minio volumes to GCS (stop dependents briefly for consistency)
docker run --rm -v engineeringos_qdrant:/data -v /opt/engineeringos/backups:/out \
  alpine tar czf /out/qdrant-$(date -u +%Y%m%d).tgz -C /data .
gcloud storage cp /opt/engineeringos/backups/qdrant-*.tgz gs://eos-backups-$PROJECT_ID/qdrant/
```

For **MinIO** you MAY instead configure GCS as the durable backend, or `mc mirror` the bucket to GCS
on a schedule. Test a restore at least once — an untested backup is not a backup.

---

## 11. Cost/idle discipline (dev)

During development, **stop the VM overnight/weekends** to burn zero compute:

```bash
gcloud compute instances stop eos-vm --zone="$ZONE"    # $0 compute; disk + IP still billed
gcloud compute instances start eos-vm --zone="$ZONE"   # Compose auto-restarts if 'restart: unless-stopped'
```

Set `restart: unless-stopped` on all services so the stack comes back automatically after a
start/reboot without manual `up`.

---

## 12. Teardown (stop billing after the trial)

Reverse order. This removes all recurring charges.

```bash
# 1. (Optional) final backup before you delete anything
/opt/engineeringos/scripts/backup.sh

# 2. Delete the VM (also deletes its boot disk unless you kept a separate data disk)
gcloud compute instances delete eos-vm --zone="$ZONE" --quiet

# 3. Release the static IP (billed while reserved, even unattached)
gcloud compute addresses delete eos-ip --region="$REGION" --quiet

# 4. Remove firewall rules
gcloud compute firewall-rules delete eos-allow-web eos-allow-ssh-iap --quiet

# 5. Delete backups bucket if you no longer need the data
gcloud storage rm --recursive gs://eos-backups-$PROJECT_ID

# 6. Delete the secret
gcloud secrets delete eos-env --quiet
```

After this the project has no billable resources. You MAY also delete the whole project
(`gcloud projects delete "$PROJECT_ID"`) to be certain.

---

_See also: [01 — Docker Compose](./01-docker-compose.md) · [02 — CI/CD](./02-cicd.md) ·
[03 — Observability](./03-observability.md) · [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md)_
