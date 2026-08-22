# Phase 1 Implementation Guide — Project Setup, Docker & Auth

> This is a practical "what was actually built and how to run it" companion to
> [00 — Vision](./00-vision-and-scope.md), [plans/00 — Roadmap](./plans/00-roadmap-and-phasing.md),
> and [plans/01 — Authentication](./plans/01-authentication.md). Read those for the *why*; this
> doc is the *how*, as implemented.

---

## 1. What's built in Phase 1

- **Nx monorepo** with real apps: `apps/api` (NestJS), `apps/worker` (NestJS, stub), `apps/web`
  (React + Vite + Tailwind v4, self-hosted Inter/Manrope fonts).
- **Shared libraries** per [docs/10](./10-shared-packages-and-boundaries.md):
  `@eos/shared-{enums,types,constants,utils}`, `@eos/contracts` (zod schemas), `@eos/backend-core`
  (`ZodValidationPipe`), `@eos/database` (Sequelize models + repositories + migrations),
  `@eos/auth` (the auth feature).
- **Database**: PostgreSQL via `sequelize-typescript`, migrations run with **Umzug** (not
  `sequelize-cli` — see §4). Tables: `organizations`, `users`, `refresh_tokens`, `schema_migrations`.
- **Auth**: email/password signup + login, JWT access tokens, **opaque hashed refresh tokens with
  rotation and reuse detection**, logout. No OAuth/MFA yet (Phase 1.1 — see
  [plans/01](./plans/01-authentication.md)).
- **Docker**: multi-stage Dockerfiles for `api`/`worker`/`web`, `docker-compose.yml` (production
  topology) + `docker-compose.override.yml` (local dev), all pinned to specific image versions.
- **A minimal browser test page** (`apps/web`, `AuthTestPage`) to exercise signup/login/refresh/logout
  — not the final UI (see [docs/11](./11-ui-ux-design-system.md) for that), just a Phase 1 harness.

## 2. Running it locally

```bash
# 1. Install deps (root — npm workspaces cover apps/* and libs/**/*)
npm install

# 2. Environment — copy the example and fill in real values
cp .env.example .env
# generate real secrets rather than leaving placeholders:
#   openssl rand -base64 48   -> JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
#   openssl rand -base64 32   -> DATA_ENCRYPTION_KEY
#   openssl rand -hex 16      -> POSTGRES_PASSWORD
# then set DATABASE_URL=postgres://eos:<password>@postgres:5432/engineeringos (internal
# docker DNS name "postgres" — not localhost, that's only for host-side psql access).

# 3. Build images and start the datastore + apps
docker compose build
docker compose up -d postgres redis
docker compose run --rm migrate      # applies pending migrations, then exits
docker compose up -d api worker web

# 4. Or for fast frontend iteration, run the web app outside Docker:
npx nx serve web        # http://localhost:4200, talks to the dockerized api on :3000
```

> **Local port note:** `docker-compose.override.yml` maps postgres/redis to whatever host ports are
> free on your machine (defaults assume 5432/6379 might already be taken by other local projects —
> adjust if you hit `port is already allocated`). It also relaxes the `internal: true` flag on the
> `internal` network (docs/deployment/01 §1) so those ports can be published to `localhost` at all —
> production never loads this override file, so that isolation boundary stays intact there.

## 3. Trying the auth flow

Browser: open **http://localhost:4200**, use the Signup form once, then Login with the same
credentials (organization slug + email are the composite key — email is unique **per org**, not
globally, per [docs/04 §3](./04-data-model.md#3-organization-hierarchy-fr-org-02)).

curl:

```bash
curl -X POST http://localhost:3000/api/v1/auth/signup -H 'Content-Type: application/json' -d '{
  "organizationName": "Acme Inc", "organizationSlug": "acme-inc",
  "name": "Ada Lovelace", "email": "ada@acme.test", "password": "correct-horse-battery"
}'
curl -X POST http://localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' -d '{
  "organizationSlug": "acme-inc", "email": "ada@acme.test", "password": "correct-horse-battery"
}'
curl -X POST http://localhost:3000/api/v1/auth/refresh -H 'Content-Type: application/json' \
  -d '{"refreshToken": "<paste the refreshToken from login>"}'
curl -X POST http://localhost:3000/api/v1/auth/logout -H 'Content-Type: application/json' \
  -d '{"refreshToken": "<current refreshToken>"}'
```

## 4. How refresh-token rotation actually works

Implemented in `libs/backend/auth/src/auth.service.ts` + `libs/backend/database/src/repositories/refresh-token.repository.ts`.

1. **Never store the raw token.** Each refresh token is a 256-bit random value
   (`crypto.randomBytes(32)`, base64url); only its **SHA-256 hash** is persisted
   (`refresh_tokens.token_hash`, unique-indexed).
2. **Rotation.** Every successful `/auth/refresh` call: looks up the row by hash → issues a **new**
   token in the same `family_id` → marks the presented row `revoked_at` + `replaced_by_id` pointing
   at the new row. The client must always use the newest token; the old one is now dead.
3. **Reuse detection.** If a client (or an attacker who stole an old token) presents a token whose
   row is *already* `revoked_at` — the exact signal of a rotated-away token being replayed — the
   service revokes **every** row in that `family_id`, killing the whole session chain, not just the
   one bad token. This is the standard OWASP-recommended response to suspected token theft.
4. **Passwords** are hashed with **argon2id** (`libs/backend/auth/src/password.util.ts`), per
   [docs/06 §2](./06-security-privacy-consent.md).
5. Verified with real unit tests in `auth.service.spec.ts` (rotation chain, reuse triggers full-family
   revocation, unknown tokens rejected, hash-not-raw-value stored) — all passing.

Login/signup errors are intentionally **generic** ("Invalid organization, email, or password") for
every failure mode (unknown org, unknown user, OAuth-only account, wrong password) to avoid user
enumeration.

## 5. Notable build/tooling issues hit and fixed

These are recorded because they'd otherwise resurface identically for the next engineer — each was a
real, non-obvious failure during this build, not a hypothetical.

| Issue | Root cause | Fix |
|---|---|---|
| `@eos/auth` unresolved inside Docker | npm workspaces glob (`libs/backend/*`, `libs/shared/*`) needs every workspace's `package.json` present *at `npm ci` time* — the Dockerfile copied only root manifests first | Copy the full source tree before `npm ci` in the `deps` stage (see `apps/api/Dockerfile`) |
| Build "succeeded" but `dist/` missing in the image | Nx's local cache mount interaction with a hardlink-style restore didn't survive across an unrelated variable — see next row for the *actual* cause | Root-caused as the path bug below; the cache-mount was a red herring during debugging, ultimately removed anyway for simplicity |
| `COPY --from=build /workspace/dist/apps/api ...` → "not found" | This Nx workspace's per-app webpack config outputs to **`apps/<name>/dist`**, not the older `dist/apps/<name>` convention (confirmed via `output.path: join(__dirname, 'dist')`) | Dockerfiles copy from `apps/${APP}/dist`, matching the real output path |
| `worker:build` silently produced no `dist/` under `docker compose build` | Nx Cloud remote-cache reported a task as cached without the artifact actually materializing in the container's filesystem | Removed `nxCloudId` from `nx.json` — this workspace doesn't use Nx Cloud; `NX_NO_CLOUD=true` set in Dockerfiles as defense-in-depth |
| Traced `package.json` (`generatePackageJson: true`) listed `"@eos/auth": "*"` | Webpack resolves our own workspace libraries the same way it resolves real npm packages (both via `node_modules` symlinks), so Nx's dependency tracer can't tell them apart from real registry deps — `npm ci` can't install a local library at version `"*"` | Dropped the "prune to minimal deps" optimization entirely; the runtime image reuses the `build` stage's already-correct `node_modules` (see docs/deployment/01 — this trades some image size for correctness/simplicity) |
| `TypeError: Class constructor ... cannot be invoked without 'new'` (first from `passport`'s `PassportStrategy` mixin, then from `sequelize-typescript`'s `Model`) | `NxAppWebpackPlugin`'s `compiler: 'swc'` mode hardcodes swc-loader options with **no `jsc.target` set at all** (confirmed by reading `@nx/webpack`'s source) — no `.swcrc` file is read for this path — so SWC defaults to a pre-ES2015 target and down-levels our own `class X extends Y` into old `Y.call(this)`-style inheritance, which can't extend a genuine external ES6 class | Added `tools/webpack/fix-swc-target.plugin.js`, a small webpack plugin placed **after** `NxAppWebpackPlugin` in the `plugins` array (webpack applies plugins in order, so by the time ours runs the swc-loader rule already exists) that patches `jsc.target` to `es2022` directly on the injected rule. Also removed the `passport`/`passport-jwt`/`@nestjs/passport` dependency entirely in favor of a plain `JwtAuthGuard` using `@nestjs/jwt`'s `verifyAsync` — simpler, and removes one instance of the risky mixin-class pattern outright |
| Migration runner picked up its own type-helper file as a "migration" | Umzug's glob (`migrations/*.ts`) matched `migration.types.ts`, which has no `up`/`down` | Moved `migration.types.ts` up one directory, out of `migrations/` |
| Local port binding silently failed (`docker port` showed nothing) | The `internal` Docker network is deliberately marked `internal: true` in `docker-compose.yml` (a real prod isolation boundary) — Docker refuses to publish **any** port for a container whose only network is internal | `docker-compose.override.yml` sets `networks.internal.internal: false` for local dev only; production never loads that file |
| `pg_isready` health-check spam ("database eos does not exist") | `pg_isready -U eos` with no `-d` defaults the target database name to the username, not our actual DB (`engineeringos`) | Cosmetic only — the check still reports the server as healthy; harmless log noise, not a real failure |

## 6. What Phase 1 deliberately does NOT include

Per the [Roadmap](./plans/00-roadmap-and-phasing.md) MVP cut line — these are real Phase 1.1+ items,
not oversights:

- Google/Microsoft/GitHub OAuth, MFA (TOTP), password reset/email verification (`plans/01`).
- RBAC enforcement beyond "any authenticated user in their own org" (`plans/03`).
- The full org hierarchy (Department/Team/Project) — only `organizations` + `users` exist so far
  (`plans/02`).
- Refresh tokens are exchanged in the request body, not an httpOnly cookie — simpler to test end-to-end
  first; moving to cookies is a documented hardening step against XSS token theft.
- The Caddy edge/production topology in `docker-compose.yml` is untested end-to-end in this session —
  only the dev override path (`postgres`/`redis`/`api`/`worker` + Vite dev server) was verified live.

---

_Next: [plans/02 — Multi-Tenancy](./plans/02-multi-tenancy.md), [plans/03 — RBAC](./plans/03-rbac.md)._
