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

---

# Addendum — work log after the report above (2026-06-26)

> Everything above this line predates the work below and is left untouched. The sub-phase table in
> §2 (P1.3 "next", P1.4/P1.5 "pending") is now **out of date** — see this addendum for the real
> status. This section is an honest running log of what got built across three working sessions,
> **including the mistakes** (called out as ⚠️ **Fuckup** so they're not quietly buried).

## A1. P1.3 — Gmail adapter shipped, then the "Safe(0)" bug

P1.3 (Gmail adapter, DOM extraction, verdict logging) was committed (`23556d5`). On live Gmail it
mis-fired: legitimate-looking and phishing mail alike came back **`Safe (0)`**. Two root causes,
found by diffing against an older working prototype:

**Fix 1 — freemail domains were in the trust list.** `data/trusted-domains.json` contained
open-registration webmail domains (`gmail.com`, `outlook.com`, `live.com`, `icloud.com`). The Sender
Trust Gate does an exact registrable-domain match, so **any** sender mis-read as a gmail address
cleared the gate → `Safe (0)`. Anyone can send from `gmail.com`; trusting it defeats the gate.
- Removed those 4 from `trusted-domains.json` (only 4 of the 18 candidates were actually present).
- Expanded `data/free-email-providers.json` to the full 18-domain list. This file is consumed
  **only** by the `sender-name-spoof` rule (a brand name + a freemail address = spoof), never by the
  gate.

**Fix 2 — sender extraction.** The sender lives in Gmail's message **header**, above/outside the
`.a3s` body container, so a body-scoped lookup can never find it. Reworked `parser.ts`:
- Sender now resolves at **document level with an open-message hint** — prefer the message wrapper
  that owns the body, then fall back to document level (so a busy multi-message thread still
  resolves to a real sender instead of the first `[email]` on the page).
- `emailFromEl` reads `email`, then `data-hovercard-id` (validated as email-shaped), then text.
- Heuristic fallback scans the header areas (`.ha`, `.ade`) instead of the old sidebar-coordinate
  scan (`SIDEBAR_MAX_X` removed).
- `gmail-selectors.json` sender list reordered to `[".gD", ".go span[email]", "span.gD[email]",
  "h3.iw span[email]"]` — `.gD` (the sender-specific class) now leads, and the generic `[email]`
  that used to win first-match (often grabbing a **recipient**) was dropped.

**Evidence:** `npm run harness` → **FP 0/50 (0.0%)**, **catch 49/49 (100%)**, precision proof stayed
Safe, `P0 exit criterion: PASS`. `npm run build` green.

⚠️ **Fuckup (mine).** My first self-audit of this fix was too clean — it implied selectors were
fully OTA-driven with nothing hardcoded. When challenged, the truth: Layer-1 element *location*
(`.gD`, …) is OTA-driven, but the **attribute names** read off the element (`email`,
`data-hovercard-id`, `name`) are **hardcoded in `parser.ts`** and therefore **cannot self-heal via
OTA** — a Gmail attribute rename would need a code change + store re-review, the exact failure the
OTA system exists to prevent. The OTA schema (`Record<string,string[]>`, field → selector list) has
nowhere to express "which attribute to read." Decision: **left as-is** (low-risk, consistent with
pre-existing `email`/`name` reads); logged as a separate future task. Layer-2 heuristic constants
(`.ha/.ade`, `h1,h2,h3`, etc.) are legitimately hardcoded — heuristics are code by design.

## A2. P1.4 — UI components (built standalone, not yet wired)

Built the four files, UI only, with **zero** changes to the detection pipeline:
- `src/ui/styles.ts` — `StyleMap` style objects (banner base + Suspicious/High-Risk colours, header,
  reasons, buttons, footer, pill base + variants) and a **local** `VerdictView` interface
  (deliberately *not* imported from `@credmail/core`, to keep the UI self-contained).
- `src/ui/banner.ts` — `injectBanner(verdict, container, senderEmail, onMarkSafe)`: idempotent,
  silent-clears on Safe, reasons list, query-stripped + truncated affected links, Mark Safe / Report
  buttons, "🔒 Local analysis" footer, inserted as first child.
- `src/ui/pill.ts` — `injectPill(verdict, subjectElement)`: idempotent, silent-clears,
  `insertAdjacentElement('afterend', …)`.
- `src/adapters/shared/extract-links.ts` — **Google redirect unwrapping** (`google.com/url?q=…` →
  real URL, in try/catch), `<area href>` image-map links, and Set-based dedupe on the final URL.
  Without the unwrap, every Gmail link looks like `google.com` and the link-mismatch rules go blind.

**Three CSP traps honored** (MV3): (A) all styling via `Object.assign(el.style, {...})` — no CSS
strings / `<style>` / `classList`; (B) every node via `createElement` + `textContent` — no
`innerHTML`; (C) all style keys camelCase.

⚠️ **Fuckup avoided (caught before claiming done).** `npm run build` **does not validate the UI
files when nothing imports them** — webpack/ts-loader only compile what's reachable from an entry,
and the UI was intentionally unwired. A build-only "green" would have been a false pass. Added
`npx tsc -p packages/extension/tsconfig.json --noEmit` (includes `src/**/*.ts`) as the real
compile check. Both green.

**Assumptions recorded:** Report button logs the first `affectedLinks` entry (the spec's `url` was
singular but a banner has many links); affected links truncated to ~60 chars.

## A3. P1.4/P1.5 — cache adjustment + full UI wiring into `index.ts`

This is the file with **"RULES FROM LAST TIME'S FAILURE"** attached — a prior session had refactored
`index.ts` / changed the cache structure / altered the observer flow when it shouldn't have. This
time the change was tightly scoped and pre-approved.

- **Cache:** `Map<string, Verdict>` → `Map<string, { verdict: Verdict; senderEmail: string }>`.
  Stores **only** verdict + sender — explicitly **not** `emailData` or `container`.
- **Wiring:** `injectBanner` **and** `injectPill` now render on both the cache-miss and cache-hit
  paths. Core's `Verdict` is structurally a `VerdictView`, so it passes straight through (tsc
  confirmed, no cast).
- **Mark Safe (`onMarkSafe`):** whitelist the sender domain → **re-extract fresh** from the live DOM
  via `parser.extract` (never a cached `emailData`) → re-score → update cache → re-render (now
  Safe/silent, so banner + pill clear). If `extract()` returns `null`, **log a warning and skip —
  no crash.**

**Decisions flagged at the time (implied but not spelled out in the request):**
- Added `addToWhitelist(domain)` inside `onMarkSafe`. Without it the re-score is identical and the
  banner never clears — verified `core/trust/whitelist.ts` matches by domain, so whitelisting the
  domain clears the gate.
- The **pill attaches to the reading-pane subject** (`h2.hP`). True inbox-list-row pilling
  (`docs/design.md`) is still a separate concern.

⚠️ **Known edge case (left as-is, flagged not fixed).** The **cache-hit path does not re-check
`is_active`** — it matches the original early-return-on-hit structure (no `getState` on hits). So if
a user pauses protection and *reopens* an already-scored email, the cached banner still renders. A
one-line `is_active` guard on the hit path would close it if we decide it matters.

⚠️ **Process note.** Twice now the safe move was to **stop and ask before editing `index.ts`** rather
than guess scope — the cache/wiring task was genuinely ambiguous about how much UI to wire, and the
file's history made a wrong guess expensive. Asking first (cache-only vs. banner vs. banner+pill)
was the right call both times.

## A4. Verification at end of these sessions

- `npm run harness` → FP 0/50, catch 49/49 (detection unchanged by UI/cache work — corpus fixtures
  supply links directly, so `extract-links.ts` isn't exercised by the harness).
- `npm run build` → green; UI files now bundled into `content_gmail`.
- `npx tsc -p packages/extension/tsconfig.json --noEmit` → exit 0.
- `git status` kept to exactly the intended files each session; no observer/core/settings drift.

## A5. Real status vs. the §2 table

| Sub-phase | §2 said | Actually now |
| :-- | :-- | :-- |
| **P1.3** Gmail adapter | "next" | ✅ shipped + Safe(0) bug fixed |
| **P1.4** Banner + pill UI | "pending" | ✅ components built **and** wired into `index.ts` |
| **P1.5** Settings; Report / Mark-Safe loop | "pending" | 🟡 partial — Mark Safe (whitelist + re-score) wired; Report is a `console.log` stub; settings page still a stub |

**Still open:** Report intake call (currently logs only); settings page wiring; inbox-list-row pill;
the OTA attribute-name gap (A1); optional `is_active` guard on cache hit (A3); committing the
currently-uncommitted working-tree changes.

---

## Session P1.4b — Lightweight Inbox Row Scanner

> Builds the inbox-list-row pill that A5 listed as "still open." A **separate, disposable**
> system from the open-email detection pipeline — its own observer, no shared state, no core.

### 1. What was built
- **`src/adapters/gmail/row-scanner.ts`** — a self-contained inbox scanner, fully isolated from the
  core engine. Reads three cheap signals off each `.zA` row (blocklist hit; freemail-domain +
  brand-in-sender-name; freemail-domain + brand-in-subject) and pills the suspicious ones. Imports
  `brands.json` / `free-email-providers.json` directly; reads `chrome.storage.local` directly; no
  `@credmail/core`, parser, observer, or storage-wrapper imports.
- **OTA row selectors** — added a `row` key to `gmail-selectors.json` (`container`, `senderName`,
  `senderEmail`, `subject`, `threadIdAttrs`). Rides along on the existing OTA sync into
  `dom_selectors.row`; the scanner falls back to a hardcoded `DEFAULT_ROW_SELECTORS` if storage
  hasn't synced.
- **Separate `MutationObserver`** on `document.body` (800ms debounce) appended to `index.ts` — a
  different observer from the email-open one, gated on `is_active` + `isInboxView()`. Catches initial
  load, virtual-scroll row loading, and back-to-inbox navigation.
- **Pill injection** — a small `⚠ Suspicious` span after the row subject (never "High Risk" — not
  enough data at the row level). CSP-safe: `Object.assign` styles, `createElement` + `textContent`,
  idempotent (removes any existing row pill before inserting).

### 2. Bugs found and fixed
- **`getAttribute('[email]')` bracket trap.** `senderEmail` was `['[email]', '[data-hovercard-id]']`
  — CSS selector syntax — but the values are passed to `getAttribute()`, which wants plain attribute
  **names**. So every lookup returned `null`, `findSender` matched nothing, and every row hit
  `continue` before marking (no marks, no pills). Fixed to `['email', 'data-hovercard-id']` in both
  `row-scanner.ts` and `gmail-selectors.json`. (`senderName` correctly keeps `span[email]` — those
  go to `querySelectorAll`.) Found via per-row debug logging after the observer/`is_active`/row-count
  logs confirmed the outer mechanism was fine.
- **Empty `catch {}` swallowing errors.** The scanner's best-effort `try/catch` hid failures
  silently, which slowed diagnosis. Replaced with `catch (err) { console.error('[CredMail] Row scan
  failed:', err); }`.
- **Pills disappearing on back-navigation.** Gmail's SPA destroys the pill span on re-render but
  keeps the outer row element **and** our `data-credmail-row` mark (a ghost marker). The scanner saw
  the mark, assumed "already scanned," and skipped — leaving the row pill-less. Fixed by requiring
  **both** the mark match **and** a live `[data-credmail-row-pill]` before skipping; if the mark
  matches but the pill is gone, the row re-scans and re-injects.
- **`isInboxView()` matches `#sent`** — noted but **deferred** (a feature/refinement, not a bug; see §4).

### 3. Architecture decisions
- **Full isolation from the core engine** — no `@credmail/core` imports anywhere in the scanner; it
  is deletable (file + the one appended block in `index.ts`) with zero impact on the rest.
- **OTA-healable selectors with a hardcoded fallback** — row selectors ship via OTA but degrade to
  `DEFAULT_ROW_SELECTORS`, so a Gmail class change is a config update, not a code change.
- **`Record<string, unknown>` in `core/types.ts`** — type-only widening of `LocalState.dom_selectors`
  so it can honestly hold both `string[]` engine selectors and the object-valued `row`. Required two
  matching type-only edits in `local-state.ts` (widen `setDomSelectors` param; cast `getDomSelectors`
  return) — pre-approved, since the core change alone would not compile otherwise. Zero runtime/engine
  change.
- **800ms debounce** on the body `MutationObserver` — collapses Gmail's mutation storms and absorbs
  virtual-scroll churn.

### 4. Known issues remaining
- **~800ms delay before pills reappear after back-navigation** — the debounce gap. The re-scan is
  correct, just not instant. Fix planned (e.g. an immediate first-pass before the debounced one).
- **Sent folder detected as inbox view** — `isInboxView()` treats `#sent` (and other short-hash list
  views) as scannable. Deferred; harmless (sent mail simply rarely trips the heuristics).
- **Temporary debug logging still in the code** — the `[CredMail] DEBUG row …` / `Row observer fired`
  / `scanInboxRows called` / `is_active` lines added during diagnosis are still present, pending a
  one-pass cleanup once the scanner is confirmed stable in the wild.

### 5. Verification
- `npm run harness` → **0% FP, 100% catch** (core engine unaffected — the type change is type-only,
  and `row-scanner.ts` isn't exercised by the corpus).
- `npm run build` → zero errors; `npx tsc -p packages/extension/tsconfig.json --noEmit` → exit 0.
- **Chrome:** pills appear on brand-spoof rows; safe/normal rows stay bare; virtual-scroll rows get
  scanned; navigating to an email and back re-pills (after the debounce).

### 6. Isolation proof
Existing email-open observer, cache Map, verdict flow, `banner.ts`, and `pill.ts` all unchanged; the
`index.ts` diff is purely additive (one appended block). Deleting `row-scanner.ts` + that block
leaves the rest compiling and working.

---

## Session P1.4c — Row Scanner Timing Fix

> Pills were built and correct (P1.4b) but appeared unreliably — missing on fresh navigation and
> sometimes never showing until a tab switch. All fixes are confined to the appended row-scanner
> wiring block in `index.ts`; nothing above it (including the email-open observer) was touched.

### 1. Root causes
- **Trigger gap.** Gmail's SPA hash swaps don't reliably emit the `childList` mutations our
  `MutationObserver` watches, so navigation often produced no scan at all.
- **Attribute lag.** Gmail renders `.zA` rows first, then populates the `email` attributes a few
  hundred ms later. The scanner ran, found no `@`, correctly skipped the row **without** marking it
  — but never retried, because `MutationObserver` watches `childList`, not `attributes`, so the
  later attribute fill fired no event.
- **Why tab-switch "fixed" it.** Switching away and back unfreezes pending observer callbacks, and by
  then the attributes are populated — masking the lag rather than solving it.

### 2. Fix — four trigger layers (all appended to the row-scanner block)
- **`hashchange` listener** — direct navigation trigger; scans 500ms after the hash changes
  (covers the trigger gap the observer misses).
- **`scanWithRetry()`** — runs `scanInboxRows()` immediately, then **once more at +1.5s**. The second
  pass catches rows whose `email` attributes weren't populated on the first (the attribute-lag fix).
- **Initial-load** `setTimeout(2000ms)` → `scanWithRetry()` — catches the first page render, where the
  observer may have fired before any rows existed.
- **Debounce 800ms → 500ms** on the `MutationObserver` (the double-tap absorbs the lag, so the first
  pass can be more responsive). All three call sites — observer, hashchange, initial load — now call
  `scanWithRetry()`.

Resulting coverage: initial load 2s + retry 3.5s; navigation 0.5s + retry 2s; virtual scroll 0.5s
debounced + retry 2s.

### 3. Trade-offs / known limitations (flagged, not fixed)
- **Two full passes per trigger.** `scanWithRetry` doubles each scan, and (from the P1.4b pill-existence
  skip) safe rows already re-scan on every fire. Negligible at ~50–100 rows, but the passes can compound
  when several layers fire close together (hashchange / initial-load aren't debounced against the
  observer). Acceptable for now.
- **Lag is timed-around, not observed.** The deterministic fix is to watch `attributes` on the rows
  instead of guessing 1.5s. The double-tap is the simpler change requested; if the lag ever exceeds
  1.5s on a slow load, a row could still be missed until the next trigger.
- **~500ms–2s delay before pills appear** after navigation remains by design (render + debounce +
  retry windows). Faster than before, not instant.

### 4. Verification
- `npm run build` → zero errors; `npx tsc -p packages/extension/tsconfig.json --noEmit` → exit 0.
- No OTA/selector change this round, so no storage clear needed — reload + hard-refresh Gmail.
- Core untouched (no harness re-run needed; the scanner isn't on the engine path).

### 5. Still open
Temp debug logging (`DEBUG row`, `Row observer fired`, `scanInboxRows called`, `is_active`) is still in
the block, pending the one-pass cleanup; the `attributes`-observer upgrade remains the principled
follow-up to the timing workaround.

---

## Session — Full Compliance Audit + Cleanup (2026-07-08)

> A **read-only audit** of the whole codebase against `CLAUDE.md` and every doc in `docs/`,
> followed by two small doc/dead-code cleanups. No detection logic was touched at any point.

### 1. The audit

Checked eight areas, each reported as **PASS**, **VIOLATION** (file+line), or **DRIFT**
(technically fine but diverging from a doc's intent). Verified against the actual code, not
memory — plus a full `npm run harness` and `npm test`.

**No VIOLATIONS found.** Results:

| # | Area | Result |
| :-- | :-- | :-- |
| 1 | **Core purity** (CLAUDE.md) | ✅ PASS — no `document`/`window`/`chrome.*` in `core/` (grep hits are comments/corpus JSON only); no import from `extension/`; `analyzeEmail` runs in Node (50 Jest tests prove it). |
| 2 | **Privacy** (CLAUDE.md) | ✅ PASS — zero network egress anywhere (`fetch`/`XHR`/`sendBeacon`/`.post` → no matches); telemetry & Report are local `console.log`/storage only; URLs query-stripped (`banner.ts:33,154`). |
| 3 | **Precision rules** (detection.md) | ✅ PASS — gate runs first (`index.ts:32`), single weak signal can't warn (`scorer.ts:44-51`), thresholds from `ScoringConfig`. **DRIFT:** dashboard hardcodes sensitivity presets and writes them into `scoring_config` (`dashboard.ts:46-50,381-383`), which shadows any future OTA-delivered threshold (OTA sync only writes `dom_selectors`). |
| 4 | **MV3** (CLAUDE.md) | ✅ PASS — no `eval()`/`new Function()` in `dist/`; background is a `service_worker` (`manifest.json:14`); state in `chrome.storage.local`; permissions minimal (`storage`,`alarms`). |
| 5 | **Architecture** (architecture.md) | ✅ PASS — core+adapters separation intact; no detection logic in adapters. **DRIFT (by design):** `row-scanner.ts` deliberately replicates the brand-mention heuristic locally (`:33-35,63-66`) to stay import-free/disposable — a second copy that can drift from core. |
| 6 | **DOM resilience** (dom-resilience.md) | ✅ PASS — OTA selectors before heuristic fallback; confidence gate aborts + fires telemetry (`parser.ts:195-201`). **DRIFT:** attribute names (`email`, `data-hovercard-id`, `name`) hardcoded in `parser.ts` / `row-scanner.ts` — cannot OTA-self-heal (known, previously deferred). |
| 7 | **Phase discipline** (roadmap.md) | ✅ PASS — no P2/P3/P4 scope pulled forward; no tier gating / DOM-scraped licensing; no deferred-scope TODOs. **DRIFT:** `schema.md` `LocalState` was stale vs. `core/src/types.ts`; `settings.ts` was a dead stub. (Both fixed below.) |
| 8 | **Corpus health** | ✅ PASS — `harness`: **0/50 FP (0.0%)**, **49/49 catch (100%)**, precision proof stayed Safe, P0 exit **PASS**. `test`: **12 suites / 50 tests** pass. |

**Priority follow-ups surfaced (not acted on):**
1. **Threshold precedence** (§3 DRIFT) — decide OTA-vs-user-override before real OTA config ships in P3.
2. **OTA attribute-name gap** (§6 DRIFT) — the one place the self-healing promise doesn't currently hold.

### 2. Cleanups performed (doc + dead code only)

**(a) `docs/schema.md` synced to the real `LocalState`** (`core/src/types.ts`):
- added `safe_contacts: string[]`;
- added `session_stats: { scanned; detected; markedSafe }`;
- changed `dom_selectors` to `Record<string, unknown>` (holds both `string[]` engine selectors
  and the object-valued `row` selectors);
- documented `scan_inbox_rows: boolean` as an **extension-only** storage key (never read by
  the pure `core/` engine, so deliberately not in the `LocalState` interface).

**(b) Removed the dead settings stub.** `src/settings/settings.ts` was a 2-line
`console.log` scaffold, superseded by the dashboard; reachable only via its webpack entry.
Verified first: manifest never referenced it, and nothing imported it.
- deleted `packages/extension/src/settings/settings.ts`;
- deleted `packages/extension/public/settings.html` (a comment-only placeholder, orphaned once
  the entry was gone);
- removed the `settings` entry from `webpack.config.js`;
- manifest.json needed no change (no reference).

### 3. Verification
- `npm run build` → **green** (`webpack compiled successfully`). `dist/` now emits exactly four
  bundles — `background`, `content_gmail`, `popup`, `dashboard` — with `settings.js` /
  `settings.js.map` / `settings.html` gone (the `clean: true` output wiped the stale artifacts).
- `npm run harness` / `npm test` unchanged from §1 (no logic touched).
- Working tree: `M docs/schema.md`, `M webpack.config.js`, `D settings.html`, `D settings.ts` —
  left uncommitted for review.

## Session — P1.5 Feature: Link Shield (Active Link Interception) (2026-07-09)

Shipped the first *active* protection: instead of only warning about a malicious email,
the extension now stops the user from reaching the phishing site when they click a flagged
link. All of it lives inside Gmail's DOM — **zero new permissions**.

### 1. Objective

- **What it does:** intercepts clicks on links that the detection engine flagged as
  malicious and redirects the user to a **local** warning page instead of the phishing site.
- **Why it's P1, not P2:** unlike the P2 "Active Shield" (a password-field overlay injected
  on *destination* sites, which needs broad host permissions), Link Shield operates entirely
  within Gmail's own DOM with **no new permissions** — it rewrites `href` attributes and adds
  capture-phase click listeners on the links Cred Mail already parsed.

### 2. Architecture

**Three-layer interception strategy** — each layer catches a different way of following a link:

| Layer | Mechanism | Catches |
| :-- | :-- | :-- |
| a. **href rewrite** | flagged `<a>` tag's real `href` is swapped to `chrome-extension://[id]/warning.html?target=…` | right-click → open in new tab, copy link, drag |
| b. **Capture-phase click listener** | `addEventListener('click', handler, true)` + `stopImmediatePropagation()` — fires **before** Gmail's own click handler | left-click |
| c. **Visual indicator** | red dashed underline on flagged links | lets users *see* danger before clicking |

- **Warning page:** a local extension page (`warning.html`) that shows the blocked URL, the
  reasons it was flagged, a **"Back to Safety"** button, and a **3-second countdown**
  "Proceed anyway" for users who insist.
- **Restore mechanism:** `restoreLinks()` cleanly undoes everything when the user clicks
  **Mark Safe** — restores the original `href`, removes the click listeners, and removes the
  visual indicators.

### 3. Files created

- `packages/extension/public/warning.html` — minimal HTML shell.
- `packages/extension/src/warning/warning.ts` — full warning-page UI (dark indigo background,
  white card, red title, countdown "Proceed anyway" button).
- `packages/extension/src/adapters/gmail/interceptor.ts` — `hijackBadLinks()` + `restoreLinks()`.

### 4. Files modified

- `src/adapters/gmail/index.ts` — import the interceptor; call `hijackBadLinks()` after render
  on **both** the fresh-verdict and cache-hit paths; call `restoreLinks()` on **Mark Safe** and
  on silent (safe) verdicts.
- `src/adapters/shared/extract-links.ts` — exported `unwrapGoogleRedirect` for reuse
  (was module-private, now shared with the interceptor).
- `webpack.config.js` — added a `warning` entry point.
- `manifest.json` — added `web_accessible_resources` for `warning.html` with an `<all_urls>`
  match (an *accessibility* declaration, **not** a permission).

### 5. Bugs encountered and fixed

- **Gmail href bypass:** Gmail's internal JS click handler ignores the DOM `href` attribute and
  navigates from its own data model, so a plain rewrite wasn't enough for left-click. Fixed by
  adding the **capture-phase** click listener with `stopImmediatePropagation()` (Layer b).
- **Google redirect unwrapping:** Gmail wraps every link through `google.com/url?q=…`. The
  interceptor **unwraps** before matching against `affectedLinks`, but saves the **original
  wrapped `href`** so restoration is exact.
- **Warning page too aggressive:** initial full-bleed red (`#DC2626`) background read as alarmist
  — changed to dark indigo (`#1E1B4B`) for a more professional feel.

### 6. Design decisions

- **href rewrite over `webRequest`/`webNavigation`:** no new permissions, no store-review risk,
  no privacy concerns.
- **Capture-phase listener (`true` flag):** guarantees Cred Mail fires before Gmail's
  bubbling-phase handlers.
- **Handler reference stored on the element (`__credmailHandler`):** enables clean, exact removal
  in `restoreLinks()`.
- **3-second countdown on "Proceed anyway":** prevents impulsive click-through.
- **Unwrapped real URL passed as `?target=`** (not the Google wrapper): the warning page shows
  the *actual* dangerous destination.
- **`<all_urls>` in `web_accessible_resources`** (not a permission): supports middle-click /
  new-tab navigation to the local warning page.

### 7. Phase discipline note

- This is **not** the P2 "Active Shield" (which monitors password fields on destination sites and
  requires broad host permissions).
- Renamed to **"Link Shield"** to avoid the naming collision.
- P2 Active Shield remains a separate, future feature — **no P2 scope pulled forward**.

### 8. Verification

- `npm run build` → **zero errors**.
- `npm run harness` → **0% FP, 100% catch** (core untouched — all changes are adapter/UI layer).
- Chrome manual testing: left-click → warning page; right-click → copy → warning URL;
  **Mark Safe** → links restored; safe emails unaffected.
