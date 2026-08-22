# syntax=docker/dockerfile:1.7
# Shared by api and worker: docker build --build-arg APP=worker -f apps/api/Dockerfile .
ARG NODE_VERSION=24-alpine
ARG APP=api

# ---------- 1. deps: install ALL deps once ----------
# npm workspaces are NESTED (libs/backend/*, libs/shared/*) — npm can only
# create the @eos/* workspace symlinks if every workspace package.json is
# present at `npm ci` time. So the full source tree is copied BEFORE
# `npm ci`, not after (a manifests-only layer would silently produce a
# node_modules with no @eos/* packages linked at all).
FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---------- 2. build: compile the Nx app ----------
# NOTE: this Nx workspace's per-app webpack config outputs to
# apps/<name>/dist (via `output.path: join(__dirname, 'dist')`), NOT the
# older dist/apps/<name> convention. Every path below reflects that.
FROM deps AS build
ARG APP
ENV NX_DAEMON=false NX_NO_CLOUD=true
RUN npx nx build ${APP} --configuration=production

# ---------- 3. runtime: non-root, reuses the full workspace node_modules ----------
# We deliberately do NOT prune to a per-app minimal node_modules: webpack
# resolves our own @eos/* workspace libraries the same way it resolves real
# npm packages (both live under node_modules via workspace symlinks), so
# Nx's traced "prod dependencies" package.json lists local libraries like
# "@eos/auth": "*" — a version npm can't resolve against the registry.
# Reusing the `deps` stage's already-correct node_modules avoids that whole
# class of bug. Trade-off: a larger image (includes devDependencies and
# workspace source) in exchange for a build that's simple and reliably
# correct — the right call for a single-VM MVP (see docs/deployment/01).
FROM node:${NODE_VERSION} AS runtime
ARG APP
ENV NODE_ENV=production \
    PORT=3000 \
    APP=${APP}
RUN apk add --no-cache tini curl
WORKDIR /app
COPY --chown=node:node --from=build /workspace/node_modules ./node_modules
COPY --chown=node:node --from=build /workspace/apps/${APP}/dist ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=5 \
  CMD curl -fsS http://localhost:${PORT}/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "main.js"]
