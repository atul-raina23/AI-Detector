# ADR-0003 — React + Vite SPA

**Status:** Accepted

## Context

The `web` app is an **authenticated internal dashboard**: dashboards, daily timeline,
Manager Copilot, admin ([03 §4](../03-system-architecture.md)). There is no anonymous,
SEO-relevant, or first-paint-critical surface — every route sits behind login and RBAC.
Data is realtime (WebSocket/SSE) and read via TanStack Query. The team is React-first, and
the frontend MUST share the same `@eos/shared-types`/`@eos/contracts` as the backend
inside the Nx graph.

## Decision

Build `web` as a **React 19 + Vite SPA** (TypeScript, Tailwind, shadcn/ui, TanStack Query,
Zustand). Vite for dev server + build; the SPA compiles to static assets served by
Caddy/the API in production ([03 §4 note](../03-system-architecture.md)), so it is not a
long-running container.

## Consequences

**Good**

- No SSR runtime to operate — one fewer moving part on the single VM ([ADR-0008](./0008-deploy-single-vm-compose.md)).
- Vite gives near-instant HMR and simple, fast builds; trivial to slot into Nx.
- Static output deploys behind any CDN/reverse proxy; cache-and-forget.
- Shared contracts import directly from `@eos/*` — no duplicated types.

**Bad**

- No SSR/SSG: worse cold first paint and no meaningful SEO (acceptable — authed app).
- Client-side data fetching means we own loading/skeleton and auth-redirect UX ourselves.
- Larger initial JS bundle; we mitigate with route-level code-splitting (`feature-*` libs).

## Alternatives considered

- **Next.js** — SSR/SSG, file routing, RSC. But SSR buys nothing for an authed dashboard
  while adding a Node render server to run, a heavier deploy, and RSC/data-fetching
  complexity. Rejected: paying operational cost for capability we don't need.
- **Remix / TanStack Start** — nice data loading, same "run a server" cost as Next. Rejected.
- **Angular / Vue** — capable, but the team is React-native and shadcn/ui targets React. Rejected.
