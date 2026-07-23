# Phase 1 — Deployment Infrastructure: Dual-Browser Builds (Chrome + Firefox)

> **Session date:** 2026-07-12 · **Scope:** build/packaging infrastructure only — **zero** `src/`,
> `core/`, or detection changes. One codebase → two store-ready artifacts.

---

## 1. Why this exists (the problem)

Prakni is a Manifest V3 web extension. A single MV3 codebase cannot be shipped as one binary to
every store — each store wants a slightly different **manifest**, and the differences are small but
mandatory:

| Concern | Chrome / Edge / Brave (Chrome Web Store) | Firefox (addons.mozilla.org) |
|---|---|---|
| Background | `background.service_worker` | `background.scripts` (event page) — service workers unsupported at `strict_min_version 109` |
| Add-on identity | not required | requires `browser_specific_settings.gecko.id` |
| Min version pin | n/a | `gecko.strict_min_version` |

Before this session the build emitted a **single** Chromium bundle: `webpack` → `packages/extension/dist/`,
with `copy-webpack-plugin` dropping the master `manifest.json` in verbatim. There was no Firefox
output and no submission packaging.

**Goal:** keep one source of truth, express each browser's manifest deltas as tiny override files,
merge them at build time into per-target `dist/<target>/` folders, and produce store-ready ZIPs —
without touching any application code.

> **Phase note:** `docs/build-and-targets.md` formally scopes Firefox to **P3**. This was pulled
> forward deliberately as build tooling (flagged at planning time and approved); it changes no
> detection or runtime scope.

---

## 2. The architecture — "one codebase, two packages"

The design follows the two-axis model in `docs/build-and-targets.md`: **providers** (Gmail, …) are a
*runtime* concern routed by the manifest's `content_scripts`; **browsers** are a *build-time* concern,
one `dist/<browser>/` per target from the same source. This session implements the browser axis.

### 2.1 Master + overrides (not full per-target manifests)

Rather than maintain three complete manifest files that drift apart, we keep **one master** and
layer **only the differences** on top:

```
packages/extension/
├── manifest.json                      ← MASTER (Chrome-compatible, still directly loadable)
└── manifests/
    ├── chrome.overrides.json          ← {}  (master already Chrome-correct)
    └── firefox.overrides.json         ← only the keys that differ for Firefox
```

- The **master** is the single source of truth. It stays byte-for-byte unchanged and remains a
  valid, directly-loadable Chrome extension on its own (fallback safety).
- Each **override** file contains *only* the keys that differ from the master for that target.
  Chrome's is empty. Firefox's swaps the background key and adds the gecko block.

### 2.2 Build-time merge → per-target dist

```
                       ┌────────────────────────┐
   manifest.json ─────▶│                        │
   (master)            │   merge-manifest.js     │────▶ dist/chrome/manifest.json
                       │   deepMerge(master,     │
   chrome.overrides ──▶│              override)  │────▶ dist/firefox/manifest.json
   firefox.overrides ─▶│                        │
                       └────────────────────────┘
                                 ▲
                                 │ invoked by an afterEmit webpack hook
                    webpack --env target=chrome|firefox
                                 │
                                 ▼
              dist/<target>/  ← JS bundles + public/ assets + merged manifest.json
```

The final layout:

```
packages/extension/dist/
├── chrome/     ← load unpacked in Chrome; input to the chrome ZIP
│   ├── manifest.json          (service_worker, no gecko)
│   ├── background.js  content_gmail.js  popup.js  dashboard.js  warning.js
│   ├── *.js.map               (excluded from the ZIP)
│   ├── *.html                 (copied from public/)
│   └── icons/…
└── firefox/    ← load via about:debugging; input to the firefox ZIP
    ├── manifest.json          (background.scripts + gecko, no service_worker)
    └── (same bundles + assets)
```

---

## 3. What we built (component by component)

### 3.1 Override files — `packages/extension/manifests/`

**`chrome.overrides.json`** — empty; the master is already Chrome-correct.
```json
{}
```

**`firefox.overrides.json`** — the three Firefox deltas:
```json
{
  "background": {
    "service_worker": null,
    "scripts": ["background.js"]
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "prakni@prakni.app",
      "strict_min_version": "109.0"
    }
  }
}
```

The `"service_worker": null` line is the key mechanism (see §4): it tells the merge to **delete**
that inherited key, so Firefox ends up with `background: { scripts: [...] }` and nothing else.

### 3.2 The merge script — `scripts/merge-manifest.js`

Plain Node, **zero dependencies**. Usable two ways:
- **Library:** `require('./merge-manifest').mergeManifest(target, outAbsPath)` — used by webpack.
- **CLI:** `node scripts/merge-manifest.js <chrome|firefox> <outPath>`.

Responsibilities:
- Resolve the master (`packages/extension/manifest.json`) and the override
  (`manifests/<target>.overrides.json`) from a fixed `EXT_DIR`, so it works regardless of cwd.
- Validate `target ∈ {chrome, firefox}`; error clearly if the override file is missing.
- Deep-merge, then write **2-space pretty JSON + trailing newline** to the output path
  (`mkdir -p` on the parent first).
- Never mutate the master object in memory.

### 3.3 Webpack — `packages/extension/webpack.config.js`

Changed from a static object export to a **function of `env`**:

- `const target = env.target || 'chrome'` — defaults to Chrome.
- `output.path = dist/<target>` (kept `clean: true`, which now scopes cleaning to that one folder).
- **Removed** the `manifest.json` pattern from `copy-webpack-plugin` — the manifest is now owned by
  the merge, not copied verbatim. The `public/ → .` asset copy is unchanged.
- Added a small inline **`MergeManifestPlugin`** that, on `compiler.hooks.afterEmit`, calls
  `mergeManifest(target, dist/<target>/manifest.json)`. `afterEmit` runs *after* clean+emit, so the
  written manifest survives `output.clean`. This is what lets the npm scripts stay a plain
  `webpack --env target=…` with no chained shell command.
- **`devtool: 'cheap-module-source-map'` unchanged for every build** — a hard MV3 rule. The default
  Webpack 5 devtool uses `eval()`, which MV3 bans and the store scanner rejects. Never set to `false`.

### 3.4 Packaging — `scripts/package.js`

Uses `archiver`. End-to-end submission builder:
1. Read `version` from the **master** manifest (never hardcoded) → drives the ZIP filenames.
2. `npm run build:chrome` then `npm run build:firefox` (via `execSync`, inherited stdio).
3. Zip each `dist/<target>/` into the **project root** as `prakni-<target>-v<version>.zip`, using
   `archive.glob('**/*', { cwd: distDir, ignore: ['**/*.map', '**/.DS_Store'] })` at zlib level 9.
   The two run sequentially (each awaits its stream `close`).
4. Log each final ZIP's size.

### 3.5 npm scripts

**`packages/extension/package.json`:**
```json
"build:chrome": "webpack --env target=chrome",
"build:firefox": "webpack --env target=firefox",
"build": "npm run build:chrome && npm run build:firefox"
```

**Root `package.json`:**
```json
"build:chrome":  "npm run build:chrome  -w @credmail/extension",
"build:firefox": "npm run build:firefox -w @credmail/extension",
"build":         "npm run build:chrome -w @credmail/extension && npm run build:firefox -w @credmail/extension",
"package":       "node scripts/package.js"
```
Plus `archiver` added to root `devDependencies`.

---

## 4. Key design decision — how Firefox drops `service_worker`

The master's `background` is `{ "service_worker": "background.js" }`; Firefox needs
`{ "scripts": ["background.js"] }` **with no `service_worker`**. A naïve deep-merge would keep *both*
keys (recursing into the `background` object). Two options were considered:

- **Both keys** (pure deep-merge) — valid, and what `docs/build-and-targets.md §1` suggests. But a
  stray `service_worker` at `strict_min_version 109` can draw an AMO linter warning.
- **`scripts` only** (chosen) — cleaner for Firefox 109 / AMO.

To get "scripts only" **without** special-casing the merge for the `background` key, the merge honors
a general convention: **an override value of `null` deletes that key.** So `firefox.overrides.json`
sets `"service_worker": null`, and the deep-merge algorithm stays generic and reusable:

```
deepMerge(base, override):
  for each key in override:
    if override[key] === null        → delete key            (Firefox drops service_worker)
    else if both sides plain objects → recurse
    else                              → override replaces     (arrays & primitives)
```

This is the **one deliberate deviation** from the verbatim override JSON in the task spec (a single
added line), chosen at planning time and approved.

---

## 5. How the two ZIPs are produced (the pipeline, end to end)

```
npm run package
   │
   ├─ node scripts/package.js
   │     ├─ version ← read from packages/extension/manifest.json  (0.1.0)
   │     │
   │     ├─ npm run build:chrome
   │     │     └─ webpack --env target=chrome
   │     │           ├─ compile 5 entries → dist/chrome/*.js (+ .map)
   │     │           ├─ copy public/ → dist/chrome/
   │     │           └─ afterEmit: mergeManifest('chrome')  → dist/chrome/manifest.json
   │     │
   │     ├─ npm run build:firefox
   │     │     └─ webpack --env target=firefox  → dist/firefox/ (+ merged manifest)
   │     │
   │     ├─ zip dist/chrome/   → prakni-chrome-v0.1.0.zip   (excl. *.map, .DS_Store)
   │     └─ zip dist/firefox/  → prakni-firefox-v0.1.0.zip  (excl. *.map, .DS_Store)
   │
   └─ two store-ready ZIPs in the project root
```

Note the `.map` source maps **are emitted** into `dist/` (needed for local debugging) but are
**excluded from the ZIPs**, so the submitted artifact is clean.

---

## 6. Verification (evidence)

All steps run and confirmed:

1. `npm run build:chrome` → `webpack compiled successfully`, **0 errors**.
2. `npm run build:firefox` → `webpack compiled successfully`, **0 errors**.
3. `dist/chrome/manifest.json` → `background.service_worker: "background.js"`, **no** `gecko`. ✓
4. `dist/firefox/manifest.json` → `background.scripts: ["background.js"]` + `gecko.id:
   "prakni@prakni.app"` / `strict_min_version: "109.0"`, **no** `service_worker`. ✓
5. `grep "eval(" dist/{chrome,firefox}/*.js` → **0 matches** across all 10 bundles (MV3 / store-scan
   safe). ✓
6. `npm run package` → two ZIPs in project root, **0 `.map` files** inside either:
   - `prakni-chrome-v0.1.0.zip` — **559.9 KB** (573,384 bytes, 20 files)
   - `prakni-firefox-v0.1.0.zip` — **560.0 KB** (573,433 bytes, 20 files)
   - manifest sizes: chrome 947 B, firefox 1082 B (delta = the gecko block).
7. Guardrails: `git status` shows **0 changes** to `packages/extension/manifest.json`,
   `packages/extension/src/`, or `packages/core/src/`. ✓
8. **Manual (not automatable here):** load `dist/chrome/` unpacked in Chrome and confirm it runs on
   a live Gmail; load `dist/firefox/manifest.json` via `about:debugging` → *Load Temporary Add-on*.

---

## 7. Gotcha — archiver version

`npm install archiver` resolved to **v8.0.0**, which is a **breaking rewrite**: it no longer exports
a factory function (exports `Archiver` / `ZipArchive` classes instead), so `archiver('zip', …)` threw
`archiver is not a function` and produced a **0-byte ZIP**. Fixed by pinning to **`archiver@^7.0.1`**
(the stable factory API: `archiver('zip', opts)` + `.glob()` / `.pipe()` / `.finalize()` / `.pointer()`).

**Watch out:** a future `npm update` that bumps archiver to ≥8 will re-break `scripts/package.js`.
Keep the `^7` pin, or migrate `package.js` to the v8 class API if upgrading.

---

## 8. Files touched (summary)

**New**
- `packages/extension/manifests/chrome.overrides.json`
- `packages/extension/manifests/firefox.overrides.json`
- `scripts/merge-manifest.js`
- `scripts/package.js`

**Modified**
- `packages/extension/webpack.config.js` — function export, per-target dist, merge hook
- `packages/extension/package.json` — `build:chrome` / `build:firefox` / `build` scripts
- root `package.json` — workspace `build:*`, `build`, `package` scripts + `archiver` devDep
- `package-lock.json` — archiver + its transitive deps

**Untouched (guardrails held)**
- `packages/extension/manifest.json` (master) · all of `packages/extension/src/` · `packages/core/`

**Generated (untracked, project root)**
- `prakni-chrome-v0.1.0.zip` · `prakni-firefox-v0.1.0.zip`
  *(candidate for `.gitignore` alongside `dist/` — not yet added.)*

---

## 9. How to use it

```bash
# Build one target
npm run build:chrome            # → packages/extension/dist/chrome/
npm run build:firefox           # → packages/extension/dist/firefox/

# Build both
npm run build

# Build both + produce submission ZIPs in the project root
npm run package
# → prakni-chrome-v<version>.zip, prakni-firefox-v<version>.zip

# Merge a manifest by hand (rarely needed)
node scripts/merge-manifest.js firefox packages/extension/dist/firefox/manifest.json
```

Loading for a manual smoke test:
- **Chrome:** `chrome://extensions` → Developer mode → *Load unpacked* → `dist/chrome/`.
- **Firefox:** `about:debugging` → This Firefox → *Load Temporary Add-on* → `dist/firefox/manifest.json`.

---

## 10. Adding a third target later (e.g. Safari / Edge-specific)

The structure is extensible with no code changes to the merge or webpack beyond one list entry:
1. Add `manifests/<target>.overrides.json` with only that target's deltas.
2. Add `<target>` to the `TARGETS` array in `scripts/merge-manifest.js`.
3. Add `build:<target>` npm scripts (extension + root) and a `zipTarget('<target>')` call in
   `scripts/package.js`.

Safari specifically is a *packaging step on top of* a standard build (`safari-web-extension-converter`,
macOS + Xcode) — see `docs/build-and-targets.md §3`.

---
---

# Part II — Pre-submission hardening & branding (2026-07-12)

Everything in Part I got us *two building, packaging artifacts*. Part II makes them *submittable*:
the compliance docs a store review demands, a cold-start robustness pass, a first `1.0.0` version,
and a full brand-reference audit + cleanup (contact email + privacy-policy links) before going live.

---

## 11. Store-submission docs + cold-start hardening + v1.0.0

A single "final pre-submission cleanup" pass. **No detection / UI / adapter logic touched** — only
docs, the storage/background robustness fixes, and the version string.

### 11.1 Compliance docs created

- **`PRIVACY.md`** (project root) — plain-English privacy policy, 11 sections. The core claim
  ("operates entirely offline, nothing transmitted") was **verified true before writing**:
  a grep for `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket` across `packages/extension/src`
  returned **zero** hits; `telemetry.ts` only `console.log`s; `ota-sync.ts` reads a bundled local
  JSON (`gmail-selectors.json`), no network. Evidence-before-claims, per CLAUDE.md.
- **`docs/permissions-justification.md`** — ready-to-paste Chrome Web Store text for each manifest
  declaration: `storage`, `alarms`, the Gmail host permission (declared via the `content_scripts`
  match, not a `permissions` entry), and `web_accessible_resources`.
- **`docs/store-listing.md`** — title, 132-char short description, full description, category
  (Productivity), language (English) for both Chrome Web Store and AMO.

### 11.2 Cold-start hardening (2 source edits)

The extension must survive a cleared or corrupted `chrome.storage.local` (a store reviewer will
open DevTools and run `chrome.storage.local.clear()`), so:

- **`packages/extension/src/storage/local-state.ts` — `getState()`** now always merges over
  `DEFAULTS`:
  ```ts
  const data = await chrome.storage.local.get(DEFAULTS as unknown as Record<string, unknown>);
  return { ...DEFAULTS, ...data } as LocalState;
  ```
  Even a wiped store yields a complete `LocalState` instead of a partial object that would crash
  consumers on a missing key. (`get(DEFAULTS)` already fills absent keys; the explicit spread is
  defensive belt-and-suspenders.)
- **`packages/extension/src/background/index.ts` — alarm handler** self-heals: after the periodic
  `runOtaSync()`, it re-reads state and, if `dom_selectors` is empty/missing, runs **one** immediate
  recovery sync instead of waiting the full 12h cycle (added a `getState` import; bounded single
  retry, no loop).
  > *Forward-looking:* in P1 `runOtaSync` reads a bundled JSON and always succeeds, so the guard
  > never fires today — it's a safety net for the P3 networked sync.

### 11.3 Version bump → 1.0.0

- `packages/extension/manifest.json`: `"version": "0.1.0"` → **`"1.0.0"`** (first public release).
- Deleted the stale `prakni-*-v0.1.0.zip` (orphaned by the bump) and re-ran `npm run package`.

### 11.4 Verification

- `npm run build` → both targets **compiled successfully**, 0 errors.
- Both `dist/*/manifest.json` show `"version": "1.0.0"`.
- `npm run package` → `prakni-chrome-v1.0.0.zip` (~560.0 KB) + `prakni-firefox-v1.0.0.zip`
  (~560.1 KB), **0 `.map` files** inside either.
- Guardrail: only `manifest.json`, `background/index.ts`, `storage/local-state.ts` changed under
  `packages/`.

---

## 12. Brand-reference audit (read-only)

Before launch, a full sweep for stray old-brand identifiers and anything that must be *owned*
(domains, mailboxes). Searched the entire codebase (excluding `node_modules`/`dist`) for: `credmail`
(case-insensitive), `@credmail`, `prakni.app`, `kanthira`, `mailto:`, and website/support URLs.

**Key findings:**

- **3 user-facing old-brand leftovers** that ship in the extension:
  - `dashboard.ts` — a `mailto:support@credmail.app` "Report a Bug" link (old-brand email).
  - `banner.ts` (×2) — footer logo referencing `icons/credmail-final-removebg.png` (old-brand asset
    filename; byte-identical to `prakni_logo_nobg.png`, so it *looks* fine, but the reference is
    stale).
- **`@credmail/*`** — every hit is the internal **npm workspace scope** (package names, imports),
  **not** email or branding. Left untouched intentionally (internal rename is a separate, larger job).
- **`data-credmail-*` attributes** and **`[CredMail]` console prefixes** — internal/functional, not
  user-visible text.
- **`kanthira`** — **zero** matches anywhere; the name was free to adopt.
- **No website/support URL existed anywhere** in code (no `homepage_url` in the manifest, no "visit
  website" link). The only `http(s)` URL in source is the manifest's `https://mail.google.com/*`
  content-script match.
- Test-corpus phishing addresses (`support@paypa1.com`, etc.) and detection lists (`brands.json`)
  are **not ours** — excluded.

Outcome: a punch-list of exactly what to reconcile (contact email, privacy URL) before submission.

---

## 13. Email & website reference cleanup

Applied **only** email/website reference changes from the audit — no package names, imports, console
prefixes, `data-credmail-*` attributes, or manifest changes.

| File | Change | Count |
|---|---|---|
| `packages/extension/src/dashboard/dashboard.ts` | `mailto:support@credmail.app` → `mailto:support@kanthira.com` | 1 |
| `PRIVACY.md` | Contact `support@prakni.app` → `support@kanthira.com` | 1 |
| `docs/store-listing.md` | Added **Privacy policy URL** section → `https://kanthiralabs.github.io/prakni-privacy/` | +1 |
| `docs/permissions-justification.md` | No `credmail` references present | 0 |

- **`credmail.app` existed in exactly one place** (the dashboard mailto), so the two requested rules
  ("`support@credmail.app` →" and "`credmail.app` →") collapsed to that single edit — there was no
  standalone website URL to repoint.
- New identifiers to make live before launch: **`support@kanthira.com`** mailbox and the
  **`https://kanthiralabs.github.io/prakni-privacy/`** page (host `PRIVACY.md` there).

Post-change grep: **0** remaining `support@credmail` / `credmail.app` / `support@prakni`; all 3 new
`kanthira` references present. `npm run package` rebuilt clean (v1.0.0 ZIPs regenerated).

---

## 14. Dashboard "Privacy Policy" link

Added a clickable privacy-policy link in the dashboard's **About & Privacy → Your Privacy** block,
below the existing privacy text. **Only `dashboard.ts` edited.**

- Appended as a third child of the `privacy` div (same IIFE pattern as the surrounding elements):
  - Text `Read our full Privacy Policy →`, href `https://kanthiralabs.github.io/prakni-privacy/`.
  - `target="_blank"` + `rel="noopener noreferrer"` (safe-new-tab default).
  - Style: `color #4F46E5`, `fontSize 13px`, `textDecoration none`, `fontWeight 600`,
    `display: inline-block` + `marginTop 6px` (its own line).
  - Hover: `mouseenter` → underline, `mouseleave` → none (no `:hover` CSS — MV3/CSP discipline,
    consistent with the banner's hover approach).
- `npm run package` rebuilt clean; ZIPs grew ~150 bytes (added markup):
  `prakni-chrome-v1.0.0.zip` ~560.2 KB, `prakni-firefox-v1.0.0.zip` ~560.2 KB.

---

## 15. Launch checklist (open items)

Code/docs are submission-ready; these are the remaining **operational** tasks (not code):

- [ ] Register/own **`kanthira.com`** and stand up the **`support@kanthira.com`** mailbox.
- [ ] Host `PRIVACY.md` at **`https://kanthiralabs.github.io/prakni-privacy/`** so the in-app link
      and the store-form privacy URL both resolve.
- [ ] Decide the fate of the two **`banner.ts`** references to `credmail-final-removebg.png`
      (rename the asset or repoint to `prakni_logo_nobg.png`) — flagged in §12, **not yet changed**.
- [ ] Manual smoke test: load `dist/chrome/` unpacked, run `chrome.storage.local.clear()`, reload
      Gmail → confirm graceful recovery; open the dashboard → confirm the Privacy Policy link renders
      and hovers correctly.
- [ ] Confirm the **Firefox add-on ID** `prakni@prakni.app` (in `firefox.overrides.json`) is the
      identity you want locked on AMO.
- [ ] Optional: `.gitignore` the root `prakni-*.zip` artifacts and `dist/`.
