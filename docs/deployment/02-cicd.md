# 02 — CI/CD (GitHub Actions → GHCR → GCP VM)

The pipeline that gets code from a pull request to running on the VM. It builds the images defined in
[01 — Docker & Docker Compose](./01-docker-compose.md), pushes them to **GHCR**, and deploys over SSH.
Secrets and the GCP trust model are in [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md);
the host and rollback mechanics are in [00 — GCP VM Deployment](./00-gcp-vm-deployment.md).

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used per [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

---

## 1. Pipeline at a glance

```
 PR opened ─────────────► ci.yml (gate)
                          nx affected: lint · typecheck · test+coverage · build
                          + security scan (deps, containers)
                          required checks MUST pass → merge allowed
                                   │
 merge to main ────────────────────▼──► release.yml
                          build & push images :sha + :latest (GHCR)
                                   │
                          ┌────────┴─────────┐
                       staging            (manual approval gate)
                       auto-deploy             prod deploy
                          │                        │
                    ssh: pull → migrate → up -d → health-check → (rollback on fail)
```

Two workflows, two triggers:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | `pull_request` | Fast, read-only quality gate. No secrets that can write anywhere. |
| `release.yml` | `push` to `main` (+ `workflow_dispatch`) | Build/push images, deploy staging then (gated) prod. |

Principle: **the PR workflow proves the change is safe; the release workflow ships it.** They never share
deploy credentials — `ci.yml` has none.

---

## 2. PR workflow — `.github/workflows/ci.yml`

Uses `nx affected` so only projects impacted by the diff run. `nx-set-shas` derives the correct base
SHA (last successful `main` commit) so "affected" is accurate.

```yaml
name: ci
on:
  pull_request:
    branches: [main]

# Cancel superseded runs on the same PR.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read          # least privilege; no packages/id-token here

env:
  NX_DAEMON: false        # daemon off in CI (see 01 §8)
  NX_BRANCH: ${{ github.event.number }}
  HUSKY: 0

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # full history so nx affected can diff base..head

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm            # caches ~/.npm keyed on package-lock.json

      - name: Install deps
        run: npm ci --no-audit --no-fund

      # Restore the Nx computation cache across runs.
      - name: Nx cache
        uses: actions/cache@v4
        with:
          path: .nx/cache
          key: nx-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ github.sha }}
          restore-keys: |
            nx-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
            nx-${{ runner.os }}-

      # Compute base/head SHAs for `nx affected`.
      - uses: nrwl/nx-set-shas@v4

      - name: Lint (incl. module-boundary rules)
        run: npx nx affected -t lint --parallel=3

      - name: Typecheck
        run: npx nx affected -t typecheck --parallel=3

      - name: Test with coverage
        run: npx nx affected -t test --parallel=2 --coverage --coverageReporters=lcov

      - name: Build (verifies prod build compiles)
        run: npx nx affected -t build --parallel=2 --configuration=production

      # Coverage gate — fails the job below the threshold.
      - name: Coverage gate
        uses: VeryGoodOpenSource/very_good_coverage@v3
        with:
          path: coverage/lcov.info
          min_coverage: 80

  security:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
      security-events: write   # upload SARIF to the Security tab
    steps:
      - uses: actions/checkout@v4
      - name: Dependency audit (fail on high+)
        run: npm audit --audit-level=high
        continue-on-error: false
      - name: Filesystem & dependency scan (Trivy)
        uses: aquasecurity/trivy-action@0.24.0
        with:
          scan-type: fs
          scan-ref: .
          severity: CRITICAL,HIGH
          exit-code: '1'
          format: sarif
          output: trivy.sarif
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: trivy.sarif }
```

Why this shape:

- **Module-boundary lint is the cheapest guardrail we have.** The `@nx/enforce-module-boundaries` rule
  (architecture §7) runs inside `lint` and fails the PR on any illegal cross-layer import or dependency
  cycle — the class of bug that "works locally, breaks in Docker." A cycle can never reach `main`.
- **`nx affected` + parallelism + Nx cache** keeps a typical PR under a few minutes; a docs-only change
  runs almost nothing.
- **Two jobs** so a slow security scan never blocks the fast validate feedback, and each gets only the
  permissions it needs (`security-events: write` is isolated to `security`).
- The `build` target here is a **compile check only** — it does not produce release images. Images are
  built once, on `main`, in `release.yml`.

---

## 3. Main-branch workflow — `.github/workflows/release.yml`

Builds and pushes images, then deploys. Authenticates to GCP via **OIDC** (no long-lived JSON key) and
to GHCR via the ephemeral `GITHUB_TOKEN`.

```yaml
name: release
on:
  push:
    branches: [main]
  workflow_dispatch: {}        # allow manual re-deploy of a chosen SHA

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false    # NEVER cancel a deploy mid-flight

permissions:
  contents: read
  packages: write              # push to GHCR
  id-token: write              # OIDC → GCP

env:
  REGISTRY: ghcr.io
  IMAGE_PREFIX: ghcr.io/${{ github.repository_owner }}/eos
  NX_DAEMON: false

jobs:
  # ---------- 1. build & push affected app images ----------
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    outputs:
      sha: ${{ github.sha }}
    strategy:
      matrix:
        app: [api, worker, web]     # trimmed by the affected check below
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: nrwl/nx-set-shas@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci --no-audit --no-fund

      # Skip apps this commit didn't affect.
      - id: affected
        run: |
          if npx nx show projects --affected --type app | grep -qx "${{ matrix.app }}"; then
            echo "build=true" >> "$GITHUB_OUTPUT"
          else
            echo "build=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Log in to GHCR
        if: steps.affected.outputs.build == 'true'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3
        if: steps.affected.outputs.build == 'true'

      - name: Build & push ${{ matrix.app }}
        if: steps.affected.outputs.build == 'true'
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.app == 'web' && 'web' || 'api' }}/Dockerfile
          build-args: APP=${{ matrix.app }}
          push: true
          tags: |
            ${{ env.IMAGE_PREFIX }}/${{ matrix.app }}:${{ github.sha }}
            ${{ env.IMAGE_PREFIX }}/${{ matrix.app }}:latest
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}

      - name: Scan pushed image (Trivy)
        if: steps.affected.outputs.build == 'true'
        uses: aquasecurity/trivy-action@0.24.0
        with:
          image-ref: ${{ env.IMAGE_PREFIX }}/${{ matrix.app }}:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: '1'

  # ---------- 2. deploy to staging (auto) ----------
  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging          # GitHub Environment (rules + secrets)
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/deploy   # reusable composite (see §4)
        with:
          host: ${{ secrets.STAGING_HOST }}
          ssh_key: ${{ secrets.STAGING_SSH_KEY }}
          image_tag: ${{ github.sha }}

  # ---------- 3. deploy to prod (manual approval) ----------
  deploy-prod:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production        # REQUIRES a reviewer approval before it runs
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/deploy
        with:
          host: ${{ secrets.PROD_HOST }}
          ssh_key: ${{ secrets.PROD_SSH_KEY }}
          image_tag: ${{ github.sha }}
```

Notes:

- **Matrix + affected filter** builds only the apps a commit changed, each with its own Nx `--scope`d
  BuildKit cache (`type=gha`). Unchanged apps skip in seconds.
- **Push both tags** (`:sha` and `:latest`) per the strategy in [01 §6](./01-docker-compose.md). Deploys
  pin the immutable `:sha`.
- **`cancel-in-progress: false`** on release — cancelling a half-applied deploy is how you get a broken
  VM. PRs cancel freely; deploys do not.
- **Image scan gates the push result**: a CRITICAL/HIGH CVE fails the job before anything deploys.

---

## 4. The deploy step — SSH, migrate, health-check, rollback

Deployment is a reusable **composite action** (`.github/actions/deploy/action.yml`) so staging and prod
run identical logic. It SSHes to the VM, pins `IMAGE_TAG`, runs the one-shot migration, does a rolling
`up -d`, then **health-checks and rolls back to the previous SHA on failure**.

```yaml
# .github/actions/deploy/action.yml
name: deploy
description: Pull pinned images, migrate, roll out, verify, auto-rollback.
inputs:
  host:      { required: true }
  ssh_key:   { required: true }
  image_tag: { required: true }
runs:
  using: composite
  steps:
    - name: Deploy over SSH
      uses: appleboy/ssh-action@v1
      with:
        host: ${{ inputs.host }}
        username: deploy
        key: ${{ inputs.ssh_key }}
        command_timeout: 10m
        script: |
          set -euo pipefail
          cd /opt/eos

          # Remember the currently-deployed tag for rollback.
          PREV=$(grep -E '^IMAGE_TAG=' .env | cut -d= -f2 || echo latest)
          echo "IMAGE_TAG=${PREV}" > .env.previous

          # Pin the new tag and pull.
          sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${{ inputs.image_tag }}/" .env
          docker compose pull

          # Forward-only migration BEFORE swapping traffic.
          docker compose --profile tools run --rm migrate

          # Rolling update.
          docker compose up -d --remove-orphans

          # Health gate: poll /health for up to 60s.
          ok=0
          for i in $(seq 1 12); do
            if curl -fsS http://localhost/health >/dev/null; then ok=1; break; fi
            sleep 5
          done

          if [ "$ok" -ne 1 ]; then
            echo "::error::Health check failed — rolling back to ${PREV}"
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${PREV}/" .env
            docker compose pull
            docker compose up -d --remove-orphans
            exit 1
          fi
          echo "Deployed ${{ inputs.image_tag }} OK."
```

Rollback contract:

- Migrations are **forward-only / expand-contract** (see [01 §5](./01-docker-compose.md)), so the
  previous image runs fine against the new schema — rolling the image back is safe without a down-migration.
- Rollback restores the previous `:sha`; because tags are immutable, the previous image is guaranteed to
  still exist in GHCR (do not GC recent tags).
- A failed deploy exits non-zero → the workflow is marked failed → on-call is paged (see
  [03 — Observability](./03-observability.md)).

> **Alternative to `appleboy/ssh-action`:** authenticate with GCP via OIDC (`google-github-actions/auth`
> + `setup-gcloud`) and run `gcloud compute ssh eos-vm --command '…'`. Prefer this if you want IAP-guarded
> SSH with no key material at all; the in-container script is identical.

```yaml
# OIDC variant (no static SSH key)
- uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.GCP_WIF_PROVIDER }}
    service_account: ${{ secrets.GCP_DEPLOY_SA }}
- uses: google-github-actions/setup-gcloud@v2
- run: gcloud compute ssh deploy@eos-vm --zone "$ZONE" --tunnel-through-iap --command 'cd /opt/eos && ./deploy.sh ${{ github.sha }}'
```

---

## 5. Caching strategy

| Cache | Mechanism | Key | Payoff |
|-------|-----------|-----|--------|
| `node_modules` install | `actions/setup-node` `cache: npm` | `package-lock.json` hash | Skips re-download of the npm registry |
| Nx computation | `actions/cache` on `.nx/cache` | lock hash + SHA, restore-keys fall back | `nx affected` reuses prior task results |
| Docker layers | `cache-from/to: type=gha` per app scope | BuildKit content hash | Unchanged Dockerfile layers reused across runs |

Guidance: keep the Nx cache **read-write on `main`** (it seeds the shared baseline) and rely on
`restore-keys` for PRs so branches read a warm cache without polluting it. Nx Cloud is an option for
distributed caching later; the local `.nx/cache` + GHA cache is enough at one-VM scale.

---

## 6. Branch protection & required checks

Configure on `main` (Settings → Branches). These MUST be enabled before the pipeline is trusted:

- **Require a pull request** before merging; ≥1 approving review; dismiss stale approvals on new commits.
- **Require status checks to pass** and be up to date with `main`:
  - `ci / validate`
  - `ci / security`
- **Require conversation resolution** and **linear history** (squash or rebase merges only).
- **Require signed commits** (SHOULD) so provenance is verifiable.
- **Restrict who can push**; no force-push, no branch deletion. Admins included.
- **Require the CodeQL/Trivy SARIF** to be clean of new CRITICAL/HIGH before merge.

Because `nx affected` can legitimately skip a target, mark the **job** (`validate`) as required, not each
individual `nx run` — otherwise a PR that doesn't touch, say, `web` would wait forever on a check that
never runs.

---

## 7. GitHub Environments — staging & production

Model each deploy target as a GitHub **Environment**, which scopes secrets and adds deploy rules:

| Environment | Auto-deploy? | Protection | Secrets |
|-------------|--------------|------------|---------|
| `staging` | Yes, on every `main` push | none (or wait-timer) | `STAGING_HOST`, `STAGING_SSH_KEY` |
| `production` | No — **manual approval** | required reviewers; optionally restrict to `main` | `PROD_HOST`, `PROD_SSH_KEY` |

- **Manual approval gate:** the `production` environment lists required reviewers; the `deploy-prod` job
  pauses until one approves in the Actions UI. This is the human checkpoint between "staging is green"
  and "customers see it."
- **Environment-scoped secrets** mean a job can only read the secrets of the environment it declares —
  a staging job cannot read prod credentials.
- Add a wait-timer or a smoke-test job on staging before prod if you want a bake period.

---

## 8. Secrets & supply-chain hygiene

- Secrets live in **GitHub Actions secrets / Environments** or are minted at runtime via **OIDC → GCP
  Workload Identity Federation**. They MUST NOT be committed to the repo, baked into images, or echoed
  in logs. Full policy and the WIF trust setup: [../06 — Security, Privacy & Consent](../06-security-privacy-consent.md).
- Prefer **OIDC over static keys** for GCP; prefer the ephemeral `GITHUB_TOKEN` over PATs for GHCR.
- **Least-privilege `permissions:`** are set per-workflow and per-job (defaults to `contents: read`).
- **Pin actions** to a major tag at minimum; pin to a SHA for third-party actions in the deploy path.
- Images are **scanned with Trivy** both as filesystem (PR) and as pushed image (release); the app `.env`
  on the VM is `chmod 600`, owned by the `deploy` user.
- **Provenance:** the immutable `:sha` tag ties every running container back to an exact commit; combine
  with signed commits (§6) for an auditable chain.

---

## 9. Failure modes & responses

| Symptom | Likely cause | Response |
|---------|--------------|----------|
| `nx affected` builds everything | Shallow clone / wrong base SHA | Ensure `fetch-depth: 0` + `nx-set-shas` |
| Deploy hangs then times out | SSH unreachable / firewall | Check VM firewall + `command_timeout`; use IAP tunnel |
| Health check fails, auto-rollback fires | Bad release or failed migration | Inspect `docker compose logs`; the VM is already back on `PREV` |
| GHCR push denied | Missing `packages: write` | Add the permission to the `release` job |
| Migration errors | Non-additive change | Fix to expand/contract; never edit an applied migration |

---

## 10. Checklist

- [ ] `ci.yml` required on `main`; `validate` + `security` are required status checks.
- [ ] `release.yml` has `packages: write` + `id-token: write`, and `concurrency` non-cancelling.
- [ ] `production` Environment has required reviewers (manual approval gate).
- [ ] GCP WIF provider + deploy SA configured; no static JSON key in secrets.
- [ ] VM has `/opt/eos` with `.env`, `docker-compose.yml`, and a `deploy` user in the `docker` group.
- [ ] Previous `:sha` tags retained in GHCR long enough to roll back.
- [ ] Trivy image scan wired and failing on CRITICAL/HIGH.

---

_Prev: [01 — Docker & Docker Compose](./01-docker-compose.md) · Related:
[00 — GCP VM Deployment](./00-gcp-vm-deployment.md), [03 — Observability](./03-observability.md),
[../06 — Security, Privacy & Consent](../06-security-privacy-consent.md),
[../09 — Testing Strategy](../09-testing-strategy.md)_
