---
name: react-feature
description: Scaffold a React feature (route) in apps/web the repo's way — thin components, TanStack Query data hooks, @eos/ui design-system components, contracts-typed API calls, light/dark + responsive. Use when adding any frontend feature/page.
---

# New React Feature

References: [docs/08 coding standards](../../../docs/08-coding-standards.md),
[docs/11 UI/UX design system](../../../docs/11-ui-ux-design-system.md),
[docs/05 API](../../../docs/05-api-and-realtime.md). Components stay presentational; data and business
logic live outside them.

## Layout

```
libs/frontend/feature-<name>/           # route-level feature lib (scope:frontend,type:feature)
├─ pages/<Name>Page.tsx                  # route entry; composes sections; no data logic
├─ components/                           # presentational pieces (props in, JSX out)
├─ hooks/                                # feature-local hooks (thin)
└─ *.spec.tsx                            # Testing Library
libs/frontend/data/src/<name>/           # @eos/frontend-data
└─ use<Name>.ts                          # TanStack Query hooks; the ONLY place that calls the API
```

## Rules

- **No fetch/axios in components.** All server state via **TanStack Query** hooks in `@eos/frontend-data`;
  request/response typed by `@eos/contracts` zod schemas (shared with the backend — no drift).
- **UI from `@eos/ui`** (shadcn/ui-based design system). Do not hand-roll buttons/inputs/cards or hardcode
  colors — use design tokens (CSS variables) so **light/dark themes** work automatically (doc 11).
- **Global UI state** (theme, sidebar, current org) via Zustand only; everything server-derived stays in
  Query cache, not Zustand.
- **Container/presentational split:** the page/container wires hooks → passes plain props to dumb
  components (easy to test, easy to reuse).
- **Responsive + accessible:** mobile-first, semantic HTML, keyboard nav, WCAG 2.1 AA (doc 11). Never rely
  on color alone to convey meaning.
- **RBAC in UI is cosmetic only** — hide what the user can't do, but the server still enforces (doc 02).

## Steps

1. Generate the feature lib (`nx-library` skill, `scope:frontend,type:feature`).
2. Add the API contract to `@eos/contracts` if new; add the Query hook to `@eos/frontend-data`.
3. Build the page from `@eos/ui` primitives + design tokens; wire the hook; handle loading/empty/error states.
4. Add the route in `apps/web` router; guard by permission.
5. Tests: component tests (Testing Library) for states; add the journey to the Playwright e2e (doc 09).

## Checklist

- [ ] No direct API calls in components; hooks in `@eos/frontend-data`, typed via `@eos/contracts`.
- [ ] Only `@eos/ui` + design tokens; light/dark + responsive verified; WCAG AA.
- [ ] Loading / empty / error states handled.
- [ ] Permission-guarded route; server still enforces.
- [ ] Component tests + e2e journey; `nx lint` clean (no backend import).
