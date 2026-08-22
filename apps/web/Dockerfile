# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24-alpine
ARG CADDY_VERSION=2.9-alpine

# npm workspaces are nested (libs/backend/*, libs/shared/*) — see the note
# in apps/api/Dockerfile. Full source must be present before `npm ci`.
FROM node:${NODE_VERSION} AS deps
WORKDIR /workspace
COPY . .
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# NOTE: Vite's outDir is relative to the Vite project root (apps/web), so
# the build lands in apps/web/dist, NOT dist/apps/web.
FROM deps AS build
ENV NX_DAEMON=false NX_NO_CLOUD=true
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npx nx build web --configuration=production

FROM caddy:${CADDY_VERSION} AS runtime
COPY --from=build /workspace/apps/web/dist /srv
COPY deployment/caddy/web.Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -q --spider http://localhost:8080/ || exit 1
