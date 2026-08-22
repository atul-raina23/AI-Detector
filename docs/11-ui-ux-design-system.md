# 11 — UI/UX Design System

Status: Draft v1 · Owner: Product Design + Frontend Platform · Applies to: every frontend app/lib in
the Nx monorepo. This is the **visual + interaction contract** for **EngineeringOS AI**. It is the
design half of what [08 — Coding Standards](./08-coding-standards.md) governs structurally, and it
satisfies **NFR-A11Y (WCAG 2.1 AA)** from [01 — Product Requirements](./01-product-requirements.md).

Stack: **React 19 + Vite**, **Tailwind CSS**, **shadcn/ui**, **TanStack Query**. Every design-system
primitive ships from **`@eos/ui`**; features consume `@eos/ui`, never raw shadcn or ad-hoc Tailwind
(doc 08 §6). RFC-2119 keywords (**MUST**, **SHOULD**, **MAY**) are used deliberately; **MUST** rules
are review-blocking.

> The product is an **Engineering Intelligence** dashboard — data-dense, calm, and explainable. The UI
> exists to make signals legible, not to decorate them. When a rule below fights clarity, clarity wins.

---

## 1. Design principles

| # | Principle | What it means in practice |
|---|-----------|---------------------------|
| 1 | **Clarity first** | The number, the status, the "what do I do next" is the loudest thing on screen. Chrome recedes. |
| 2 | **Maximize data-ink** | Every pixel earns its place. No decorative gradients, no drop-shadowed cards stacked on cards, no chartjunk. |
| 3 | **Calm, low-chrome** | Neutral canvas, one primary accent, restrained color. Color is a *signal*, spent only where it means something. |
| 4 | **Progressive disclosure** | Show the headline; put evidence one click away. Echoes **NFR-EXPLAIN** — every metric drills to its source events. |
| 5 | **Consistency** | One component, one behavior, everywhere. A status pill means the same thing on the timeline and the PR queue. |
| 6 | **Team-over-individual** | Framing defaults to team/process health, not surveillance. Individual data is opt-in, self-first, and RBAC-scoped (doc 02). Language and defaults reflect this ethos. |
| 7 | **Accessible by construction** | AA contrast, keyboard-first, never color-alone. Accessibility is a default token value, not a retrofit. |

---

## 2. Brand & color system

### 2.1 Brand hues — rationale

The brief bans the **cliché SaaS blue** and **dull/gold**. We choose a **teal + iris** pairing:

- **Primary — "Kelp Teal" `#0F766E`.** Teal reads as *instrumentation, telemetry, signal* — the
  oscilloscope-green-adjacent family engineers associate with monitoring and health, without being the
  overused product blue or an alarm green. It is confident and enterprise-serious.
- **Accent — "Iris" `#6E56CF`.** A refined violet-indigo reserved for **AI / intelligence** surfaces
  (the Copilot, AI-derived insights, "explain this") and for interactive emphasis. Violet is the
  cultural shorthand for "AI" and sits in perfect complementary tension with teal — distinctive,
  premium, and unmistakably *not* the default blue.

Teal carries the product; iris carries the *intelligence*. Everything else is neutral cool-slate so the
two brand hues never fight for attention.

### 2.2 Semantic tokens (CSS custom properties)

**Components never hardcode a hex.** They reference semantic tokens; the tokens carry both themes. This
is the single most important rule in this document.

| Token (CSS var) | Role | Light | Dark |
|---|---|---|---|
| `--eos-background` | App canvas | `#F6F8FA` | `#0B0F14` |
| `--eos-surface` | Card / panel base | `#FFFFFF` | `#111721` |
| `--eos-elevated` | Popover, modal, dropdown | `#FFFFFF` | `#1A2230` |
| `--eos-border` | Hairline dividers, card edges | `#E2E8F0` | `#222E3D` |
| `--eos-border-strong` | Input border, focus target edge | `#CBD5E1` | `#33475E` |
| `--eos-text` | Primary text | `#0F172A` | `#E6EDF3` |
| `--eos-text-secondary` | Secondary / labels | `#475569` | `#9BA8B7` |
| `--eos-text-muted` | Muted / metadata / placeholders | `#64748B` | `#7C8B9E` |
| `--eos-primary` | Brand primary (Kelp Teal) | `#0F766E` | `#2DD4BF` |
| `--eos-primary-foreground` | Text/icon on primary fill | `#FFFFFF` | `#04211D` |
| `--eos-accent` | AI / iris accent | `#6E56CF` | `#A78BFA` |
| `--eos-accent-foreground` | Text/icon on accent fill | `#FFFFFF` | `#1B1636` |
| `--eos-success` | Healthy / merged / passing | `#16A34A` | `#22C55E` |
| `--eos-warning` | At-risk / stale / attention | `#B45309` | `#FBBF24` |
| `--eos-danger` | Failed / blocked / critical | `#DC2626` | `#F87171` |
| `--eos-info` | Neutral informational | `#0284C7` | `#38BDF8` |
| `--eos-ring` | Focus ring | `#0F766E` | `#2DD4BF` |

Notes:
- **Semantic amber for `--warning` is a signal color, not a brand color** — the "no gold" ban applies to
  the brand identity, not to a universally-understood warning hue. On light surfaces `--warning` is
  amber-700 (`#B45309`) so *warning text* clears AA; the bright `#FBBF24` chip fill is dark-mode-only and
  always pairs with dark text + an icon (§9).
- **Elevation in dark mode is luminosity, not shadow**: `surface → elevated` gets *lighter*
  (`#111721 → #1A2230`). In light mode elevation is a shadow (§6.3), surfaces stay white.
- `--eos-info` is a semantic sky/cyan, deliberately distinct from the teal *brand* primary so an "info"
  chip never impersonates a primary action.

### 2.3 Token → Tailwind → shadcn wiring

Define tokens once on `:root` and re-declare the dark set under `[data-theme="dark"]`. Tailwind reads
them as color utilities; shadcn/ui components read the same variables through its own aliases.

```css
/* @eos/ui/src/styles/tokens.css */
:root {
  --eos-background: #F6F8FA;  --eos-surface: #FFFFFF;   --eos-text: #0F172A;
  --eos-primary: #0F766E;     --eos-primary-foreground: #FFFFFF;
  --eos-border: #E2E8F0;      --eos-ring: #0F766E;      /* …full set above… */

  /* shadcn/ui aliases point at EOS tokens — components stay theme-agnostic */
  --background: var(--eos-background); --foreground: var(--eos-text);
  --card: var(--eos-surface);          --popover: var(--eos-elevated);
  --primary: var(--eos-primary);       --primary-foreground: var(--eos-primary-foreground);
  --border: var(--eos-border);         --input: var(--eos-border-strong);
  --ring: var(--eos-ring);             --radius: 0.5rem;
}
:root[data-theme="dark"] {
  --eos-background: #0B0F14; --eos-surface: #111721; --eos-text: #E6EDF3;
  --eos-primary: #2DD4BF;    --eos-primary-foreground: #04211D;
  --eos-border: #222E3D;     --eos-ring: #2DD4BF;     /* …full dark set… */
}
```

```js
// tailwind.config.js — map utilities to the CSS vars (never to literal hex)
theme: { extend: { colors: {
  background: 'var(--eos-background)', surface: 'var(--eos-surface)',
  primary: { DEFAULT: 'var(--eos-primary)', foreground: 'var(--eos-primary-foreground)' },
  accent:  { DEFAULT: 'var(--eos-accent)',  foreground: 'var(--eos-accent-foreground)' },
  success: 'var(--eos-success)', warning: 'var(--eos-warning)',
  danger:  'var(--eos-danger)',  info: 'var(--eos-info)',
  border: 'var(--eos-border)', ring: 'var(--eos-ring)',
  'text-muted': 'var(--eos-text-muted)',
}}}
```

**DO** write `bg-surface text-foreground border-border`. **DON'T** write `bg-white dark:bg-slate-900` —
that hardcodes the theme into the component and defeats the token system.

### 2.4 Contrast — WCAG 2.1 AA (verified)

All body text MUST clear **4.5:1**; large text (≥ 18.66px bold / 24px regular) and UI/graphical objects
MUST clear **3:1**. Representative load-bearing pairs, measured:

| Foreground | Background | Ratio | Passes |
|---|---|---|---|
| `--text` `#0F172A` | light surface `#FFFFFF` | **16.8:1** | AA / AAA |
| `--text-secondary` `#475569` | light surface | **7.4:1** | AA / AAA |
| `--text-muted` `#64748B` | light surface | **4.76:1** | AA (normal) |
| white | `--primary` `#0F766E` (button) | **5.48:1** | AA |
| white | `--accent` `#6E56CF` (button) | **5.40:1** | AA |
| `--text` dark `#E6EDF3` | dark bg `#0B0F14` | **15.8:1** | AA / AAA |
| `--text-muted` dark `#7C8B9E` | dark bg | **5.54:1** | AA (normal) |
| `--primary` dark `#2DD4BF` (text/icon) | dark bg | **10.3:1** | AA / AAA |

Any new token pair **MUST** be checked before merge (Storybook a11y addon + axe in CI).

---

## 3. Data-visualization palette

This product is chart-heavy — burndown, DORA, review-load, velocity, AI-adoption. The chart palette is
**colorblind-safe, validated (not eyeballed), and defined for both themes.** It was validated with the
dataviz method (Machado-2009 CVD ΔE, OKLCH lightness band, chroma floor, surface contrast).

### 3.1 Categorical (series identity) — fixed order, never cycled

Lead hues are teal and iris to echo the brand; the full order was chosen to maximize the minimum
adjacent CVD separation.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | teal | `#1BAF7A` | `#199E70` |
| 2 | iris | `#4A3AA7` | `#9085E9` |
| 3 | orange | `#EB6834` | `#D95926` |
| 4 | blue | `#2A78D6` | `#3987E5` |
| 5 | magenta | `#E87BA4` | `#D55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | yellow | `#EDA100` | `#C98500` |
| 8 | red | `#E34948` | `#E66767` |

Validated: **light** worst adjacent CVD ΔE **24.2** (well clear of the ≥12 target); **dark** worst
**10.3** (floor band 8–12 — legal *only* with secondary encoding, so dark charts with 4+ series lean on
direct labels or texture). Three light slots (teal, magenta, yellow) sit below 3:1 on white — the
**relief rule** applies: ship visible direct labels or the table view. A **9th series is never a new
hue** — it folds into "Other," small multiples, or a composite encoding.

### 3.2 Sequential (magnitude) — single teal hue, light → dark

For heatmaps, choropleths, review-load density. Lightest = near-zero (may recede into the surface).

| 100 | 200 | 300 | 400 | 500 | 600 | 700 |
|---|---|---|---|---|---|---|
| `#CCFBEF` | `#99F6E0` | `#5EEAD4` | `#2DD4BF` | `#14B8A0` | `#0D9488` | `#0F766E` |

### 3.3 Diverging (polarity) — teal ↔ red, gray midpoint

For "above/below target" (e.g., velocity vs. commitment, DORA vs. benchmark). Teal (cool) and red
(warm) read as opposites; the midpoint is neutral gray (light `#EEF1F4`, dark `#2A2F38`) — **never a
hue at the midpoint**. Equal step count per arm.

### 3.4 Status (state) — reserved, never a series color

`success` / `warning` / `danger` / `info` (§2.2) are **reserved** — they never double as "series 4," and
they always ship with an **icon + label**, never color alone.

### 3.5 Chart DO / DON'T

| DO | DON'T |
|---|---|
| Assign categorical hues in fixed slot order (1→N). | Cycle or re-pick hues when a filter changes the series count — color follows the entity. |
| Direct-label lines/bars; keep a legend for ≥ 2 series. | Rely on color alone; put a number on every point. |
| Use one Y axis; split unlike measures into separate charts / index to a base. | Ever build a dual-axis (two Y-scale) chart. |
| Sequential = one hue light→dark; diverging = two hues + gray midpoint. | Rainbow ramps; a colored diverging midpoint. |
| Provide a **table view** toggle and texture fallback for CVD/print/forced-colors. | Encode a KPI in red/green only (colorblind users lose it). |
| Recessive gridlines/axes (hairline, muted); thin marks. | Heavy gridlines, 3-D bars, gradient fills, chartjunk. |

See [16 — Dashboards](./plans/16-dashboards.md) for which chart serves which metric.

---

## 4. Typography

### 4.1 Families & self-hosting

| Role | Typeface | Notes |
|---|---|---|
| UI / body | **Inter** | Modern dashboard standard; the closest self-hostable humanist-geometric match to Pingdom's clean sans. Base for all UI text, tables, forms. |
| Display / headings | **Manrope** | Slightly geometric, confident — used for H1–H4, hero KPIs, section titles. |
| Exact-Pingdom alternative | **Proxima Nova** (paid) / **Montserrat** (free) | Documented as the "match-Pingdom" swap; not the default. |
| Mono (code, IDs, hashes) | **JetBrains Mono** | PR hashes, correlation IDs, code snippets. |

**All fonts are self-hosted** (`@eos/ui/assets/fonts`, `woff2`, `font-display: swap`) — **no runtime CDN**.
This matches our CSP / privacy posture (doc 06): the app must render with zero third-party font requests.
Subset to Latin; preload the two most-used weights.

```css
@font-face { font-family: 'Inter'; src: url('/fonts/Inter-var.woff2') format('woff2');
  font-weight: 100 900; font-display: swap; font-style: normal; }
:root { --font-sans: 'Inter', system-ui, sans-serif; --font-display: 'Manrope', var(--font-sans);
        --font-mono: 'JetBrains Mono', ui-monospace, monospace; }
```

### 4.2 Type scale (modular, ~1.2)

| Token | Size / Line-height | Weight | Family | Use |
|---|---|---|---|---|
| `display` | 36 / 44 | 800 | Manrope | Marketing / empty-state hero only |
| `h1` | 30 / 38 | 700 | Manrope | Page title |
| `h2` | 24 / 32 | 700 | Manrope | Section title |
| `h3` | 20 / 28 | 600 | Manrope | Card / panel title |
| `h4` | 18 / 26 | 600 | Manrope | Sub-section, dialog title |
| `body-lg` | 16 / 26 | 400 | Inter | Comfortable reading, copilot answers |
| `body` | 14 / 22 | 400 | Inter | **Base** — tables, most UI |
| `body-sm` | 13 / 20 | 400 | Inter | Secondary rows, dense tables |
| `caption` | 12 / 16 | 500 | Inter | Metadata, timestamps, axis labels |
| `metric` | 32 / 36 | 700 | Manrope · `tabular-nums` | KPI / stat-tile value |
| `metric-sm` | 20 / 24 | 600 | Inter · `tabular-nums` | In-table numeric emphasis |

### 4.3 Usage guidance (dashboards)

- **Numbers are the product.** KPI values use `--font-display`, 700 weight, `font-variant-numeric:
  tabular-nums` so digits align and don't jitter on live update.
- **Tables and axis ticks MUST use `tabular-nums`** so columns align vertically; body prose uses default
  proportional figures.
- Line length for prose (copilot, docs) SHOULD cap at ~72ch. Dashboard labels stay terse.
- **DON'T** use more than two weights in one component; **DON'T** center-align long text or numeric
  columns (numbers are right-aligned, labels left).

---

## 5. Spacing, radius, elevation, grid

### 5.1 Spacing — 4px base scale

| Token | px | Typical use |
|---|---|---|
| `space-1` | 4 | Icon ↔ label gap |
| `space-2` | 8 | Compact padding, chip padding |
| `space-3` | 12 | Control padding, table cell Y |
| `space-4` | 16 | **Default** card / component padding |
| `space-5` | 20 | Card padding (comfortable) |
| `space-6` | 24 | Section gap |
| `space-8` | 32 | Between major blocks |
| `space-10` | 40 | Page gutters (desktop) |
| `space-12` | 48 | Hero / empty-state spacing |

Everything is a multiple of 4. **DON'T** invent one-off `13px`/`7px` values.

### 5.2 Radius

| Token | px | Use |
|---|---|---|
| `radius-sm` | 6 | Inputs, chips, badges |
| `radius-md` (`--radius`) | 8 | **Default** — buttons, cards |
| `radius-lg` | 12 | Panels, modals, popovers |
| `radius-xl` | 16 | Copilot panel, large sheets |
| `radius-full` | 9999 | Avatars, pills, toggles |

### 5.3 Elevation (shadow tokens)

Subtle in light (soft, low-opacity, cool-tinted); in dark, elevation is carried by **surface
luminosity** (§2.2) plus a faint 1px top highlight — heavy shadows disappear on dark and read as grime.

| Token | Light | Dark |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(15,23,42,.06)` | `0 1px 2px rgba(0,0,0,.4)` + lighter surface |
| `shadow-md` | `0 4px 12px rgba(15,23,42,.08)` | `0 4px 16px rgba(0,0,0,.5)` + lighter surface |
| `shadow-lg` | `0 12px 32px rgba(15,23,42,.12)` | `0 16px 40px rgba(0,0,0,.6)` + `inset 0 1px rgba(255,255,255,.05)` |

**DON'T** stack shadowed cards inside shadowed cards — pick one elevation per surface.

### 5.4 Grid & breakpoints (mobile-first)

12-column fluid grid, `--space-6` gutter (desktop), `--space-4` (mobile). Content max-width `1440px`;
the app shell is fluid.

| Breakpoint | Min-width | Layout behavior |
|---|---|---|
| base (mobile) | 0 | Single column; sidebar → drawer; tables → cards; 1 KPI per row → 2 |
| `sm` | 640 | 2-up stat tiles, still drawer nav |
| `md` | 768 | 2-col content; collapsible icon-rail sidebar appears |
| `lg` | 1024 | Full sidebar + topbar; 3–4-up KPI row; charts side-by-side |
| `xl` | 1280 | 12-col dashboards; copilot as docked right panel |
| `2xl` | 1536 | Wider gutters; max 4-up KPI; optional third column |

---

## 6. Core components (`@eos/ui`)

All below are shadcn/ui primitives themed with EOS tokens and exported from `@eos/ui`. One-line intent +
the key DO / DON'T for each.

| Component | Intent | DO | DON'T |
|---|---|---|---|
| **App Shell** | Sidebar + topbar frame, persona-aware nav (doc 02) | Collapse to icon-rail at `md`, drawer at mobile; persist collapse state | Deep-nest nav > 2 levels; hide the org switcher |
| **Sidebar / Nav** | Primary navigation, RBAC-filtered | Show only permitted routes; mark active with fill + weight, not color-only | Render links the user can't access |
| **Topbar** | Context: org switcher, search, theme toggle, notifications, avatar | Keep global search + copilot entry reachable everywhere | Overload with > 5 actions on mobile |
| **Card / Panel** | Content container, one elevation | Use `surface` + `border`; title in `h3` | Nest cards 3-deep; add gratuitous shadow |
| **Stat tile / KPI** | One headline number + delta + sparkline | Value in `metric` tabular-nums; delta with ↑/↓ **icon + color + sign** | Encode good/bad in color alone; cram 3 numbers into one tile |
| **Table (dense)** | Sortable, sticky-header, tenant-scoped rows | Sticky header; `tabular-nums`; row hover; zebra optional; virtualized for long lists | Wrap numeric cells; center numbers; use color-only status |
| **Chart** | Recharts/visx themed to §3 | Direct-label; legend for ≥2 series; table-view toggle; respect reduced-motion on animate-in | Dual-axis; rainbow; animate on every re-render |
| **Timeline** | Chronological per-person event stream (FR-TL-01) | Group by source with source icon; each entry links to its source event; lazy-load ranges | Show raw signals a viewer lacks consent/RBAC for (doc 02 §3) |
| **PR-queue list** | Reviewable PRs with wait-time + risk (FR-GH-03) | Surface stale/large flags as pills; sort by wait time; show reviewer load | Bury the "why it's stale" evidence |
| **Badge / Status pill** | Compact state label | Always **icon + text**, semantic token fill | Color-only pills; > 4 chars without a tooltip |
| **Button** | Action trigger | Variants below; one **primary** per view | Two primaries competing; icon-only without `aria-label` |
| **Form / Input** | Data entry, validation | Label always visible; error text + `aria-invalid`; `border-strong` at rest | Placeholder-as-label; validate on every keystroke |
| **Modal / Sheet** | Focused task / detail | Modal (desktop) ↔ bottom Sheet (mobile); trap focus; ESC closes | Modal-in-modal; block the whole app for a non-blocking task |
| **Toast** | Transient feedback | Top-right (desktop) / top (mobile); auto-dismiss non-critical; `role="status"` | Toast for errors that need action (use inline) |
| **Empty / Loading / Skeleton / Error** | Honest state feedback | Skeletons match final layout; empty states teach the next action; errors show a retry + `correlationId` | Spinners for > 400ms without skeleton; dead-end empty states |
| **AI Copilot panel** | Iris-accented Q&A over org data (FR-AI-03) | Use `--accent`; **cite evidence** on every answer; stream tokens; human-approval gate for actions (FR-ENT-08) | Present AI output as fact without citations; auto-execute actions |

### 6.1 Button variants

| Variant | Fill / border | Use |
|---|---|---|
| `primary` | `--primary` fill, `--primary-foreground` text | The one main action per view |
| `secondary` | `surface` fill, `border-strong` | Neutral secondary actions |
| `ghost` | transparent, hover wash | Toolbar / low-emphasis |
| `accent` | `--accent` fill | AI / copilot actions only |
| `destructive` | `--danger` fill | Delete, revoke, block |
| `link` | text-only, underline on hover | Inline navigation |

Min touch target **44×44px** (§8). Icon-only buttons **MUST** carry `aria-label`.

---

## 7. Theming implementation

- **Selector:** `data-theme="light" | "dark"` on `<html>` (the root). All tokens resolve from it. shadcn
  reads the same variables, so there is no per-component dark styling.
- **Default:** first visit follows `@media (prefers-color-scheme)`. An explicit user choice overrides the
  OS and is stored **per user** (server-side preference in the profile) + mirrored to `localStorage` for
  instant boot.
- **No flash of wrong theme (FOUC):** a tiny **blocking inline script in `<head>`** sets `data-theme`
  from `localStorage`/`prefers-color-scheme` *before* first paint. React hydrates into the already-correct
  theme; nothing flips.

```html
<!-- index.html <head>, before the app bundle -->
<script>
  (function () {
    var t = localStorage.getItem('eos-theme');
    if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  })();
</script>
```

- The theme toggle lives in a small **Zustand** store (global UI state — doc 08 §6), writes
  `localStorage` + `data-theme`, and fires a debounced mutation to persist the preference server-side.
- **DON'T** read `prefers-color-scheme` inside components; **DON'T** branch styles on it — tokens already
  encode both themes.

---

## 8. Responsiveness & layout (mobile-first)

- **Author mobile-first**: base styles are the phone layout; `md:`/`lg:` add complexity. Never the reverse.
- **Sidebar → drawer.** Below `md` the sidebar is an off-canvas Sheet opened from a topbar menu button;
  at `md` it is a collapsible icon-rail; at `lg`+ it is expanded.
- **Tables → cards.** Dense tables reflow to stacked cards below `md` (label:value pairs), preserving the
  same data and status pills. Horizontally-scrolling tables are a fallback, never the default, and MUST
  live in an `overflow-x:auto` container so the page never scrolls sideways.
- **Charts** drop to a single column and simplify (fewer ticks, legend below) on mobile.
- **Copilot** is a docked right panel at `xl`, a full-height Sheet on mobile.
- **Touch targets ≥ 44×44px**; spacing between tap targets ≥ `space-2`. Hover-only affordances MUST have
  a tap/focus equivalent.

---

## 9. Accessibility — WCAG 2.1 AA checklist (NFR-A11Y)

| Area | Requirement |
|---|---|
| **Contrast** | Text ≥ 4.5:1 (large ≥ 3:1); UI/graphical objects ≥ 3:1. Verified in §2.4; new pairs checked in CI (axe). |
| **Never color-alone** | Status = icon + text + color. Charts = direct labels + legend + optional texture. Deltas carry ↑/↓ and sign. |
| **Keyboard** | Every interactive element reachable and operable by keyboard; logical tab order; no keyboard traps; ESC closes overlays; roving-tabindex in menus/tabs. |
| **Focus ring** | Visible `--eos-ring` focus ring on every focusable element, ≥ 3:1 against its background; use `:focus-visible`. Never `outline: none` without a replacement. |
| **ARIA & semantics** | Prefer native elements; add `role`/`aria-*` only to fill gaps. Landmarks (`nav`/`main`/`aside`), labeled controls, `aria-live` for toasts + live metrics. |
| **Forms** | Persistent visible labels, programmatic label association, `aria-invalid` + `aria-describedby` for errors. |
| **Reduced motion** | Respect `prefers-reduced-motion`; disable non-essential animation and chart animate-in (§10). |
| **Targets & zoom** | 44px targets; layout survives 200% zoom and 320px width without loss of content/function. |
| **Screen reader** | Charts expose an accessible table alternative; icon-only buttons have `aria-label`; decorative icons are `aria-hidden`. |

---

## 10. Motion

Motion is **subtle and purposeful** — it explains a state change (a panel opening, a value updating),
never decorates. Duration/easing tokens:

| Token | Value | Use |
|---|---|---|
| `motion-fast` | 120ms · `cubic-bezier(.2,0,0,1)` | Hover, focus, small state |
| `motion-base` | 200ms · `cubic-bezier(.2,0,0,1)` | Dropdowns, toasts, tabs |
| `motion-slow` | 320ms · `cubic-bezier(.2,0,0,1)` | Sheets, modals, drawer |

- **Chart animate-in** ≤ 400ms, once per data load — **not** on every re-render.
- **`prefers-reduced-motion: reduce` MUST** cut transforms/animations to opacity-only or none.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; }
}
```

- **DON'T** animate layout-shifting properties on scroll; **DON'T** loop attention-grabbing motion in a
  data view.

---

## 11. Consolidated DO / DON'T

| DO | DON'T |
|---|---|
| Reference semantic tokens (`bg-surface`, `text-foreground`). | Hardcode hex or `dark:` color pairs in components. |
| Use `@eos/ui` primitives. | Hand-roll a styled `<button>` when `<Button>` exists (doc 08 §6). |
| Spend brand color as a *signal* — teal for product, iris for AI. | Flood the UI with the accent; use blue-brand or gold. |
| Pair every status with an icon + label. | Encode meaning in color alone. |
| Keep charts single-axis, direct-labeled, CVD-validated. | Ship dual-axis, rainbow, or unvalidated palettes. |
| Emphasize numbers with display font + `tabular-nums`. | Let live-updating digits jitter (proportional figures in tables). |
| Author mobile-first; reflow tables → cards, sidebar → drawer. | Design desktop-only and shrink it down. |
| Set theme before first paint; persist per user. | Cause a flash of wrong theme; read `prefers-color-scheme` in components. |
| Meet AA contrast + keyboard + focus-ring on everything. | `outline:none` without a visible replacement. |
| Respect `prefers-reduced-motion`; keep motion purposeful. | Animate for decoration or on every re-render. |
| Frame views as team/process health by default. | Surface individual data beyond RBAC + consent scope (doc 02 §3). |

---

_Related: [01 — Product Requirements](./01-product-requirements.md) ·
[02 — Personas & RBAC](./02-personas-and-rbac.md) ·
[08 — Coding Standards](./08-coding-standards.md) ·
[16 — Dashboards](./plans/16-dashboards.md)_
