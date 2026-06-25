# Phase 1 — Browser Extension: Progress Report

**Status: in progress.** The MV3 build pipeline is green and a real (still UI-less) extension
loads in Chrome. The background layer — service worker lifecycle, typed storage, OTA selector
sync, and metadata-only telemetry — is implemented. **Not yet built:** the Gmail content-script
adapter that reads the DOM, the banner/pill UI, and the settings page wiring.

This document records what Phase 1 has built so far, sub-phase by sub-phase. Phase 0 (the pure
detection engine) is complete and reported separately in `phase0.md`.

---

## 1. Goal of Phase 1

Phase 0 proved the detection brain is trustworthy in isolation (0% FP, 100% catch on the corpus).
**Phase 1's job is to build the Chromium + Gmail extension around that brain** without compromising
the hard rules — privacy (no PII over the network), core purity (no DOM/`chrome.*` in `core/`), and
MV3 constraints (no `eval()`, a sleepable service worker, JSON-only OTA).

The extension package existed only as inert placeholders at the end of P0. Everything below was
built this phase.

> **North star is unchanged: precision is the product. Be silent when mail is safe.**

---

## 2. Sub-phase map

| Sub-phase | Scope | Status |
| :-- | :-- | :-- |
| **P1.1** | Build pipeline; blank extension loads in Chrome | ✅ done (`9fdfef9`) |
| **P1.2** | Background service worker, storage, OTA sync, telemetry | ✅ done (`d462a1f`) |
| **P1.3** | Gmail content-script adapter (DOM → `EmailData`) | ⬜ next |
| **P1.4** | Banner + pill UI (SUSPICIOUS / HIGH RISK only) | ⬜ pending |
| **P1.5** | Settings page; Report / Mark-Safe loop | ⬜ pending |

(P1.3+ scope is indicative — confirm against `docs/roadmap.md` before starting.)

---

## 3. P1.1 — Build pipeline & loadable shell

**Outcome:** `npm run build` produces a `dist/` that Chrome loads as an unpacked MV3 extension
(blank — no behavior yet, but alive).

### Manifest (`manifest.json`)
Authored the real MV3 manifest:
- `manifest_version: 3`, name "Cred Mail", version `0.0.0`.
- `background.service_worker: background.js`.
- One content script matched to `https://mail.google.com/*` → `content_gmail.js`.
- `permissions: ["storage", "alarms"]` — exactly what the background layer needs, nothing more.
- Icons 16/48/128.

### Webpack (`webpack.config.js`)
- **Mode** `production`; three entries → one bundle each:
  `background`, `content_gmail`, `settings`.
- **`devtool: 'cheap-module-source-map'`** — chosen deliberately because **MV3 bans `eval()`** and
  the default devtool is eval-based (would crash with a CSP error). Marked do-not-change.
- `ts-loader` for `.ts`, `node_modules` excluded.
- **Alias** `@credmail/core` → `../core/src/index.ts`: resolves the workspace source directly,
  because the `node_modules` symlink would be skipped by ts-loader's `node_modules` exclude.
- `CopyWebpackPlugin` copies `manifest.json` and `public/` (icons) into `dist/`.

### Package wiring (`packages/extension/package.json`)
- Added `build: webpack` script.
- Deps: `webextension-polyfill`; devDeps: `@types/chrome`, `@types/webextension-polyfill`,
  `copy-webpack-plugin`, `ts-loader`, `webpack`, `webpack-cli`.

---

## 4. P1.2 — Background service worker, storage, OTA, telemetry

**Outcome:** the background half of the extension is real. State survives the worker sleeping;
selectors arrive as data; telemetry is metadata-only. No DOM reading yet.

### 4.1 Service worker entry (`src/background/index.ts`)
Event-driven, designed for a worker that may sleep (~30s). **No persistent state in worker
globals** — it all lives in `chrome.storage.local`.
- `onInstalled` → `initState()` → first `runOtaSync()` → register a `chrome.alarms` job.
- **OTA refresh on a 12-hour alarm** (`OTA_PERIOD_MINUTES = 12 * 60`).
- `onMessage` telemetry listener **returns `false`** on purpose: an async listener returns a
  Promise that Chrome reads as "will respond," holding the channel open — a known MV3 foot-gun.
  Telemetry only logs, so no response is sent.

### 4.2 Typed storage (`src/storage/local-state.ts`)
Async-only typed wrapper over `chrome.storage.local` (the API is async; there are deliberately
**no synchronous getters**).
- `DEFAULTS: LocalState` — `user_tier: 'free'`, `auth_token: null`, `is_active: true`, empty
  whitelist/blocklist, empty `dom_selectors` (filled by first OTA), and `scoring_config`.
- `DEFAULT_SCORING_CONFIG` = `{ suspiciousThreshold: 30, highRiskThreshold: 70,
  weakCorroborationNeeded: 2 }` — a **bootstrap fallback** mirroring core's `DEFAULT_CONFIG`;
  OTA + the core scorer remain the real source of truth.
- `initState()` — idempotent; fills missing keys via `{ ...DEFAULTS, ...stored }` **without
  clobbering** existing user data. Safe on every install/update.
- `getState` / `setState` (shallow merge).
- Whitelist (domains) & blocklist (senders): `get` / `add` / `remove`, all run through
  `normalize()` (trim + lowercase, deduped via `Set`).
- `getDomSelectors` / `setDomSelectors`.

### 4.3 OTA selector sync (`src/background/ota-sync.ts` + `gmail-selectors.json`)
**Layer 1 of the self-healing extraction system** (`docs/dom-resilience.md`): DOM selectors live
as **data, not code**, so a Gmail UI change becomes a config update, not a store re-review.
- `runOtaSync()` writes the bundled selector map into storage via `setDomSelectors`.
- In P1 the config is **bundled locally**; P3 swaps in a Supabase fetch. Payload is **JSON
  selector strings only** — MV3 forbids remote code.
- `gmail-selectors.json` holds ordered fallback selector lists for `sender` / `subject` / `body`
  / `links`.
- `tsconfig.json` gained `resolveJsonModule: true` and `*.json` in `include` to import the JSON.

### 4.4 Telemetry (`src/background/telemetry.ts`)
**Privacy hard rule:** metadata only — never `bodyText`/`subject`/sender or any PII, never URLs
with query strings.
- `TelemetryMessage` = `{ type: 'parser_fallback' | 'extraction_low_confidence', client: string }`.
- `isTelemetryMessage()` type guard (validates `type` against an allow-set).
- `handleTelemetryMessage()` logs `{ event, client, version, ts }` locally — synchronous,
  fire-and-forget. The real webhook lands in P3.

---

## 5. Hard rules honored so far

| Rule | How P1 honors it |
| :-- | :-- |
| **Privacy** | Telemetry carries only `event` + `client` + version + timestamp. No PII, no URLs. |
| **Core purity** | All DOM/`chrome.*` code lives in `packages/extension/`; `core/` untouched. |
| **MV3** | No `eval()` (non-eval devtool); background is a sleepable `service_worker` with all state in `chrome.storage.local`; OTA is JSON-only. |
| **Thresholds in config** | Scorer thresholds come from `scoring_config` / OTA, not hardcoded in logic. |
| **Phase discipline** | Only P1 background scaffolding built; no content-adapter / UI scope pulled forward. |

---

## 6. Repository additions this phase

```
packages/extension/
├── manifest.json                       # real MV3 manifest [P1.1]
├── package.json                        # build script + webpack/ts deps [P1.1]
├── webpack.config.js                   # 3-entry production build, non-eval sourcemap [P1.1]
├── tsconfig.json                       # + resolveJsonModule, *.json include [P1.2]
├── public/icons/                       # icon16/48/128.png [P1.1]
└── src/
    ├── background/
    │   ├── index.ts                    # SW lifecycle: install, 12h OTA alarm, telemetry [P1.2]
    │   ├── ota-sync.ts                 # bundled selector sync (Layer 1) [P1.2]
    │   ├── telemetry.ts                # metadata-only signals [P1.2]
    │   └── gmail-selectors.json        # ordered fallback selectors [P1.2]
    ├── storage/
    │   └── local-state.ts              # typed async chrome.storage.local wrapper [P1.2]
    ├── adapters/gmail/index.ts         # still a stub — P1.3
    └── settings/settings.ts            # still a stub — P1.4/P1.5
```

---

## 7. Verification status

- `npm run build` → green: webpack produces `dist/` (`background.js`, `content_gmail.js`,
  `settings.js`, copied `manifest.json` + icons).
- **Loads in Chrome** as an unpacked extension; the service worker logs
  `[CredMail] background alive` and the install handler seeds state + runs the first OTA sync.
- No detection/corpus impact this phase — the harness numbers from P0 stand unchanged
  (the brain wasn't touched).

> Note: the background flow has been exercised by loading in Chrome; there are not yet automated
> tests for the extension package (content-adapter tests arrive with P1.3).

---

## 8. What's next (P1.3)

The **Gmail content-script adapter** (`src/adapters/gmail/index.ts`): read the open email from the
DOM using the OTA selectors from storage, build a core `EmailData`, call the engine, and fire
`parser_fallback` / `extraction_low_confidence` telemetry when extraction degrades. Per CLAUDE.md:
one adapter's parsing never leaks into another, and detection logic never lives in an adapter.

---

## 9. Bottom line

Phase 1 is underway and on-rails: the MV3 build pipeline works, the extension loads, and the entire
background layer (sleep-safe storage, 12-hour OTA selector sync, metadata-only telemetry) is built
within the hard rules. The next milestone is the Gmail adapter that finally feeds real mail into the
Phase 0 brain.
