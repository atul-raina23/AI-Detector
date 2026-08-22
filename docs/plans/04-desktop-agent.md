# Plan 04 — Desktop Agent

> A lightweight, cross-platform (Windows/macOS/Linux) **Rust** agent that collects *opt-in, per-signal*
> engineering work events — active app, IDE/terminal/git/build activity, browser **domains**, idle,
> meeting status, focus time — buffers them locally, and syncs them to EngineeringOS with a
> device-scoped token. It is **not** surveillance: it never captures screens, screenshots, or
> keystrokes, it is pausable at any moment, and it shows the employee exactly what is queued **before**
> it leaves the device.

| | |
|---|---|
| **Status** | Draft v1 |
| **Phase** | Phase 3 — Reach (see [Roadmap](./00-roadmap-and-phasing.md)) |
| **Owner** | Platform Eng — Desktop |
| **Satisfies** | `FR-AGENT-01`, `FR-AGENT-02`, `FR-AGENT-03`, `FR-AGENT-04`, `FR-AGENT-05`, `FR-AGENT-06` |
| **Depends on** | [Plan 05 — Event Pipeline](./05-event-pipeline.md) (ingest), [Plan 01 — Auth](./01-authentication.md) (device tokens), [Plan 19 — Enterprise](./19-enterprise-platform.md) (consent/retention UI); foundations [../04 Data Model](../04-data-model.md), [../05 API](../05-api-and-realtime.md), [../06 Security](../06-security-privacy-consent.md) |
| **Nx projects** | **None.** The agent is a standalone **Cargo workspace** at `apps/desktop-agent/`, **outside the Nx JS graph**. It consumes only the wire contract in `@eos/contracts` ([../05 §6.1](../05-api-and-realtime.md#61-desktop-agent-sync-fr-agent-04-fr-evt-02)), mirrored as Rust structs and pinned by a contract test (§9). It ships no code back into the Nx graph. |

---

## 1. Goal & scope

- **In scope:**
  - A single Rust binary + tray/menubar UI per OS that registers a device, enforces consent locally, runs
    only the collectors the employee opted into, and syncs to `POST /api/v1/ingest/agent`.
  - **Collectors** (`FR-AGENT-01`), each individually opt-in: active app, VS Code/IntelliJ/terminal
    activity, browser **domain-only**, git activity, build execution, idle time, meeting status, focus time,
    login/logout.
  - **Local event buffer** (embedded SQLite) with batched + near-real-time sync, retry, and offline
    resilience (`FR-AGENT-04`).
  - **Device auth** via a device-scoped token with remote revocation (`FR-AGENT-05`).
  - **Local transparency view** — the employee sees exactly what is queued before upload (`FR-AGENT-06`).
  - **Pause** (global + per-signal), auto-update, and signed/notarized packaging per OS.
- **Out of scope:**
  - Server-side ingest, normalization, dedup, and consent *store* — owned by [Plan 05](./05-event-pipeline.md)
    and the `consents` table ([../04 §8](../04-data-model.md#8-integration--consent-tables)). The agent is a
    *producer* and a *local enforcer*, not the system of record.
  - Deep IDE analytics semantics ([Plan 10](./10-ide-browser-analytics.md)) and AI-usage attribution
    ([Plan 11](./11-ai-usage-analytics.md)) — the agent only emits the raw signals those plans project.
  - Mobile (per [../00 §6](../00-vision-and-scope.md#6-scope--mvp-vs-full)).
- **Anti-goals** (hard boundaries from [../00 §4](../00-vision-and-scope.md#4-what-we-are-not-building-anti-goals)):
  - ❌ **NO screen capture, NO screenshots, NO keystroke logging.** Not a setting — **not compiled in**.
  - ❌ No covert collection: every running collector is visible and pausable; nothing runs without consent.
  - ❌ No individual productivity score computed on-device; the agent emits flow signals, never rankings.
  - ❌ No full-URL browser capture — **domain only** (`FR-BR-01`).

## 2. User stories

- **As an Individual Contributor**, I want to enable *only* focus-time and git-activity tracking and leave
  browser and app tracking off, so that I share what I'm comfortable with. (`FR-AGENT-01/02`)
- **As an Individual Contributor**, I want a one-click **Pause** in the menubar that stops all collection
  immediately, so that I control my machine during personal time. (`FR-AGENT-02`)
- **As an Individual Contributor**, I want to open a **"What's queued"** window and read the exact events
  waiting to upload, so that nothing leaves my device unseen. (`FR-AGENT-06`)
- **As an Individual Contributor**, I want the agent to keep working on a plane and sync later without
  losing or duplicating events, so that offline time is invisible. (`FR-AGENT-04`)
- **As a security-conscious Engineer**, I want proof the binary *cannot* screenshot or log keystrokes, so
  that I trust it. (`FR-AGENT-03`)
- **As an Owner/Admin**, I want to **revoke** a lost laptop's agent remotely so its token stops working and
  buffered data can't be flushed. (`FR-AGENT-05`)
- **As an Admin**, I want agents to **auto-update** to patched builds without re-provisioning fleets, so
  that security fixes land fast. (`NFR-SEC`)

## 3. Domain model

The agent produces **`DomainEvent`s** ([../04 §5](../04-data-model.md#5-the-canonical-event-fr-evt-01)) with
`source: 'agent'`. It adds **no server tables of its own** beyond the existing
`device_agents` and `consents` ([../04 §8](../04-data-model.md#8-integration--consent-tables)). New
`EventType`s below are added to **`@eos/shared-enums`** so pipeline/timeline share one source of truth.

| `EventType` (new) | Signal type (consent key) | Sensitivity | Payload (minimized) |
|---|---|---|---|
| `agent.session.login` / `.logout` | `session` | P2 | `{ os, at }` |
| `agent.app.active` | `app_usage` | P3 | `{ appName, durationSec }` — name only, no window title |
| `agent.ide.activity` | `ide_activity` | P3 | `{ ide: 'vscode'\|'intellij', project?, languages[], durationSec }` |
| `agent.terminal.activity` | `terminal_activity` | P3 | `{ shell, durationSec }` — **no command text** |
| `agent.browser.domain` | `browser_domains` | P3 | `{ domain, durationSec }` — **domain only, never full URL** |
| `agent.git.activity` | `git_activity` | P2 | `{ repo, action: 'commit'\|'push'\|'branch', sha?, branch? }` |
| `agent.build.executed` | `build_execution` | P2 | `{ tool, exitCode, durationSec }` |
| `agent.idle.started` / `.ended` | `idle_time` | P3 | `{ at }` — input *presence*, never *content* |
| `agent.meeting.status` | `meeting_status` | P3 | `{ inMeeting: bool, source: 'app_heuristic' }` |
| `agent.focus.started` / `.ended` | `focus_time` | P3 | `{ app?, durationSec }` |

Client-side, each buffered row also carries a `clientId`, `contentHash` (sha256 of normalized payload, for
idempotent ingest per `FR-EVT-02`), and `signalType`. Sensitivity is assigned server-side at ingest and
**MUST NOT** be downgraded ([../06 §1](../06-security-privacy-consent.md#1-data-classification-p0p4)); the
agent tags it advisorily so the transparency view can show it.

## 4. Architecture & flow

Crate layout — a Cargo workspace, one library crate per concern plus one binary:

```
apps/desktop-agent/            # Cargo workspace (NOT an Nx project)
├─ Cargo.toml                  # [workspace] members
├─ crates/
│  ├─ agent-core/              # orchestrator: consent gate, scheduler, pause state machine
│  ├─ agent-collectors/        # trait Collector + per-signal impls (feature-gated per OS)
│  ├─ agent-buffer/            # SQLite (rusqlite) event buffer + outbox
│  ├─ agent-sync/              # HTTP client, batching, retry/backoff, device-token auth
│  ├─ agent-platform/          # OS abstraction: win/mac/linux impls behind one trait
│  ├─ agent-contract/          # Rust mirror of @eos/contracts ingest schema (pinned by test)
│  └─ agent-ui/                # tray/menubar + transparency window (Tauri)
└─ src-tauri (in agent-ui)     # packaging, updater, signing config
```

Ports (traits) — concrete impls injected at startup so `agent-core` is testable with fakes:

| Trait | Responsibility | Concrete impls |
|---|---|---|
| `Collector` | `poll() -> Vec<RawSignal>`; declares its `signal_type` | one per collector, OS-feature-gated |
| `PlatformApi` | active window, idle time, running processes, meeting hints | `WinPlatform` / `MacPlatform` / `LinuxPlatform` |
| `EventBuffer` | append, list-queued, mark-synced, prune | `SqliteBuffer` |
| `IngestClient` | flush a batch, honor `Retry-After`, surface revocation | `HttpIngestClient` |
| `ConsentManifest` | is `signal_type` allowed *right now*? | `LocalConsentStore` (synced from server) |

```rust
// agent-collectors — the whole collector surface is one small trait
#[async_trait]
pub trait Collector: Send + Sync {
    fn signal_type(&self) -> SignalType;      // consent key
    async fn poll(&mut self) -> Vec<RawSignal>; // may return empty; never blocks the loop
}
```

Runtime flow — consent is enforced **twice**: locally before buffering, and again server-side at ingest.

```mermaid
sequenceDiagram
  participant Col as Collector (opt-in only)
  participant Core as agent-core (consent + pause gate)
  participant Buf as SQLite buffer (outbox)
  participant Sync as agent-sync
  participant API as /api/v1/ingest/agent
  participant UI as Transparency view
  Col->>Core: RawSignal
  Core->>Core: paused? OR consent revoked? → DROP
  Core->>Buf: enqueue (clientId, contentHash, signalType)
  UI->>Buf: read queued (employee inspects BEFORE upload)
  loop batch tick / realtime threshold
    Sync->>Buf: pull unsynced batch
    Sync->>API: POST batch (device token, Idempotency-Key)
    API-->>Sync: {accepted, duplicate, rejected[consent_required]}
    Sync->>Buf: mark accepted+duplicate synced; drop rejected
  end
```

The agent fits the [event-first architecture](../03-system-architecture.md) as a **producer** into the same
`/api/v1/ingest/agent` endpoint the pipeline already owns; it introduces **no new server surface**.

## 5. API & realtime surface

The agent is a **client** of the existing ingest contract — no new endpoints are defined here.

| Endpoint | Method | Auth | Contract | Notes |
|---|---|---|---|---|
| `/api/v1/ingest/agent` | `POST` | Device token | [../05 §6.1](../05-api-and-realtime.md#61-desktop-agent-sync-fr-agent-04-fr-evt-02) | batch flush; `Idempotency-Key` per batch; per-item `accepted`/`duplicate`/`rejected` |
| `/api/v1/agent/register` | `POST` | Access JWT (user, during setup) | `@eos/contracts` `AgentRegister` | one-time; exchanges a short-lived enrolment code for a device token; creates a `device_agents` row |
| `/api/v1/agent/manifest` | `GET` | Device token | `AgentManifest` | poll: active consents per `signalType`, pause flag, policy version, revoked flag |

- **RBAC:** registration requires the employee's own authenticated session (self-scope). Ingest and manifest
  authorize purely on the device token, which resolves to `(orgId, userId, deviceId)`
  ([../05 §6.1](../05-api-and-realtime.md#61-desktop-agent-sync-fr-agent-04-fr-evt-02)).
- **Consent at ingest** is authoritative: items whose `signalType` lacks an active consent are returned in
  `rejected` and **never persisted** (`NFR-CONSENT`).
- **Idempotency:** each batch carries an `Idempotency-Key`; server dedups on
  `(organizationId, source, externalId, contentHash)`, so offline retry is safe (`FR-EVT-02`).
- **Revocation:** a revoked device token returns `401 unauthenticated`; the manifest also carries a
  `revoked: true` flag so a still-authenticated poll can trigger local wipe of the buffer (§7).
- **Realtime:** the agent does **not** join the WS surface ([../05 §5](../05-api-and-realtime.md#5-realtime--websocket-socketio)); "near-real-time" is a short batch tick, not a socket.

## 6. AI involvement (if any)

**N/A** on-device — the agent runs **no AI/LLM** locally and makes no inferences beyond simple heuristics
(e.g., "a conferencing app is foreground" → `meeting_status`). Downstream, the Activity/Meeting agents
([../07](../07-ai-architecture.md)) consume these events, but that is out of scope here. Keeping AI off the
device is deliberate: it bounds the binary's capabilities to *collect the consented signal and nothing more*.

## 7. Security, privacy & consent

This section is the crux; it operationalizes [../06 §4.4](../06-security-privacy-consent.md#44-desktop-agent-fr-agent-020306).

- **No screenshots / no keystrokes (`FR-AGENT-03`).** The binary links **no** screen-capture or global
  input-hook APIs. `agent-platform` exposes only: foreground *process name*, idle *duration*, and running
  *process list* — never window contents, never key events. A CI capability-audit (§9) greps the dependency
  tree and fails the build if a forbidden API (e.g. `CGDisplayCreateImage`, `SetWindowsHookEx`,
  `XRecord`, `BitBlt`) is reachable.
- **Opt-in per signal (`FR-AGENT-02`, `NFR-CONSENT`).** A collector **MUST NOT** be constructed unless its
  `signal_type` is granted in the local `ConsentManifest`. Default state is **all-off** until the employee
  opts in via the setup UI, which writes a `consents` row server-side.
- **Local consent enforcement + fast revocation.** The agent polls `GET /agent/manifest` on a short interval
  and also refreshes on wake; a revoked/paused signal **stops its collector within seconds**, comfortably
  under the 1-minute `NFR-CONSENT` ceiling. Offline, the last-known manifest applies; on flush the server
  re-checks and drops anything newly un-consented.
- **Pause (`FR-AGENT-02`).** A global pause and per-signal toggles live in `agent-core`'s state machine.
  Pausing halts collectors immediately and is reflected server-side on the next manifest sync; queued-but-
  unsent events remain visible in the transparency view and the employee may **purge** them.
- **Transparency view (`FR-AGENT-06`).** A local window renders the exact rows in the outbox — `type`,
  `signalType`, sensitivity, payload, `occurredAt`, and sync status — **before** they upload, with a
  **"purge selected / purge all"** control. This is the on-device half of the employee self-view in
  [../06 §4.3](../06-security-privacy-consent.md#43-the-employee-see-exactly-whats-collected-about-me-view).
- **Device auth (`FR-AGENT-05`).** The device token is generated server-side at registration; only its
  **hash** is stored (`device_agents.token_hash`, P4). On-device it is held in the **OS keychain**
  (Keychain / Credential Manager / Secret Service), never in plaintext config. Remote revocation flips
  `device_agents.revoked`; the agent then fails ingest (`401`) and, on the next manifest poll, wipes its
  local buffer and clears the keychain entry.
- **Data minimization.** Browser = **domain only**; terminal = *activity presence*, never command text;
  IDE = language/project metadata, never file contents; idle = input *presence*, never *content*. Payloads
  are trimmed at the collector, so unminimized data never reaches the buffer.
- **Sensitivity & audit.** Emitted signals are P2–P3 ([../06 §1](../06-security-privacy-consent.md#1-data-classification-p0p4)); the device token is P4. Registration and revocation are audited server-side (`FR-ENT-01`).

## 8. Implementation plan (phased tasks)

Each row is a small, reviewable PR. All land in `apps/desktop-agent/` (Cargo workspace).

| # | Task | Crate | Acceptance |
|---|---|---|---|
| 1 | Workspace scaffold, CI (`cargo test`/`clippy`/`fmt`) for all 3 OSes | workspace | green matrix build on win/mac/linux |
| 2 | `PlatformApi` trait + three impls (foreground process, idle duration, process list) | `agent-platform` | returns real values per OS; **no** capture APIs linked |
| 3 | `EventBuffer` on SQLite (append/list/mark-synced/prune) + outbox schema | `agent-buffer` | survives restart; unit + integration tests pass |
| 4 | `agent-contract` Rust mirror of ingest schema + fixtures | `agent-contract` | round-trips the `@eos/contracts` sample |
| 5 | `IngestClient` with batching, `Idempotency-Key`, backoff honoring `Retry-After`, `401`→revoked | `agent-sync` | replays are dedup-safe; offline→online drains cleanly |
| 6 | `agent-core` orchestrator: consent gate, pause state machine, scheduler | `agent-core` | paused/un-consented signals never buffered |
| 7 | Collectors behind `Collector` trait, feature-gated per OS + per signal | `agent-collectors` | each opt-in independently; off by default |
| 8 | Registration + device-token keychain storage + manifest polling | `agent-sync`,`agent-core` | token never on disk in plaintext; revocation wipes buffer |
| 9 | Tray/menubar UI + **transparency window** + pause controls (Tauri) | `agent-ui` | queued events visible & purgeable before upload (`FR-AGENT-06`) |
| 10 | Auto-updater (signed manifest) + per-OS packaging & signing | `agent-ui` | notarized `.dmg`/signed `.msi`/`.deb`+`.AppImage`; update verifies signature |
| 11 | Capability-audit CI gate (forbidden-API grep) + signed-payload contract test | CI | build fails if a screenshot/keylog API is reachable |

Keep files clean per [../08 Coding Standards](../08-coding-standards.md): one collector per file, no
collector larger than ~150 lines, platform `#[cfg]` splits isolated in `agent-platform`.

## 9. Testing (`unit` / `integration` / `e2e`)

Per [../09 Testing Strategy](../09-testing-strategy.md), adapted for Rust (`cargo test`). Ports make fakes
honest: `agent-core` tests inject fake `Collector`/`EventBuffer`/`IngestClient`.

**Unit (`cargo test`, mocks/fakes):**
- Consent gate drops a signal whose `signal_type` is not in the manifest (default-deny).
- Pause state machine: paused ⇒ collectors produce nothing; resume ⇒ collection restarts.
- Each collector's `normalize()` trims to the minimized payload (browser → domain only; terminal → no
  command text; IDE → no file contents).
- `contentHash` is stable for identical normalized payloads and differs on change.

**Integration (`cargo test`, real SQLite + mock HTTP server):**
- Buffer survives process restart; unsynced rows re-flush without loss.
- **Offline resilience:** enqueue while the mock server is down, bring it up, assert exactly-once delivery
  (dedup by `contentHash`), no duplicates, no drops.
- Backoff honors a `429 Retry-After`; a `401` marks the device revoked and wipes the buffer.
- Server `rejected: consent_required` items are dropped locally and not retried.

**Contract & security (must-have negatives):**
- **Signed-payload contract test:** serialize a batch from `agent-contract` and assert it validates against
  the committed `@eos/contracts` ingest zod schema (shared JSON fixtures); a schema change breaks this test.
  Send it to a stub ingest to confirm the device-token header + `Idempotency-Key` shape are accepted.
- **Capability audit (fails the build):** a test/CI step asserts no screenshot or keystroke-hook symbol is
  reachable in the dependency graph (`FR-AGENT-03`).
- **No-consent negative:** with an empty manifest, no collector is constructed and the buffer stays empty.

**e2e (per OS, thin):** launch the packaged agent, opt into one signal, generate activity, confirm the event
appears in the transparency view **and** at the ingest stub; then pause and confirm collection stops.

## 10. Observability

- **Local diagnostics (privacy-safe):** structured logs (`tracing`) of *counts and states* only — buffer
  depth, last-sync time, retry count, manifest version, paused/consented flags. **No event payloads, no
  P3/P4 fields** are ever logged ([../06 §5](../06-security-privacy-consent.md#5-privacy-engineering-nfr-privacy)).
- **Server-side signals** (owned by [Plan 05](./05-event-pipeline.md)/[deployment/03](../deployment/03-observability.md)):
  `ingest.agent.batch.accepted|duplicate|rejected`, `ingest.dropped.no_consent{signalType}`, agent
  `last_seen` freshness (stale-agent alert), and per-device error rate.
- **Health:** an in-app "Agent status" panel shows connected/paused/offline, queued count, and last sync —
  the employee's own diagnostics, no server round-trip needed.

## 11. Acceptance criteria

- [ ] Agent runs on Windows, macOS, and Linux from one Cargo workspace. (`FR-AGENT-01`)
- [ ] Every signal type is **independently opt-in**, **off by default**, and **pausable**; a paused/un-
      consented collector produces nothing within seconds. (`FR-AGENT-01/02`, `NFR-CONSENT`)
- [ ] The binary contains **no** screen-capture or keystroke-hook capability; CI capability-audit enforces
      it. (`FR-AGENT-03`)
- [ ] Events buffer to SQLite and sync in batches / near-real-time, surviving offline periods with
      exactly-once delivery via `Idempotency-Key` + `contentHash`. (`FR-AGENT-04`, `FR-EVT-02`)
- [ ] The agent authenticates with a device-scoped token stored in the OS keychain; remote revocation stops
      ingest and wipes the local buffer. (`FR-AGENT-05`)
- [ ] The employee can inspect and **purge** the exact queued events before upload. (`FR-AGENT-06`)
- [ ] Browser capture is **domain-only**; terminal/IDE payloads carry no command or file content.
      (`FR-BR-01`, `NFR-PRIVACY`)
- [ ] Signed-payload contract test passes against `@eos/contracts`; packages are signed/notarized per OS.

## 12. Risks & open questions

| Risk / question | Mitigation / decision |
|---|---|
| **Perceived as spyware** despite anti-goals | Ship transparency view first-run, off-by-default, open the payload shape; capability-audit result is publishable. |
| **Meeting status** without calendar/mic access is heuristic | Emit `source: 'app_heuristic'`, mark low-confidence; prefer calendar ([Plan 09](./09-calendar-integration.md)) when available. Keep off by default. |
| **macOS permissions** — Accessibility API for foreground app | Request minimal permission with clear copy; degrade gracefully (skip `app_usage`) if denied, never block other collectors. |
| **Linux fragmentation** (X11 vs Wayland idle/active-window) | Feature-detect; Wayland idle via `ext-idle-notify`/logind, X11 via `XScreenSaver`; document unsupported combos. |
| **Auto-update supply-chain** | Signed update manifests, signature verified before apply, staged rollout; updater cannot fetch unsigned binaries. |
| **Buffer growth** during long offline | Cap buffer size + oldest-first prune with a visible warning; retention aligns with server policy ([../06 §9.3](../06-security-privacy-consent.md#93-data-residency--retention)). |
| **Open:** near-real-time vs pure batch default tick | Start batch (e.g. 60s); revisit if timeline latency needs tighter (`NFR-LATENCY` is a server-projection SLA, not an agent one). |
| **Open:** IDE signal source — agent process-watch vs first-party IDE extension | Phase-3 uses process/heuristic; richer IDE analytics may move to an extension in [Plan 10](./10-ide-browser-analytics.md). |

---

_Template version 1. NO screen capture, NO keystroke logging — restated by design, not by policy._
