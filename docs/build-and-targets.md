# Build, Browsers & Providers

Two independent axes. Email providers are handled at **runtime** by the manifest; browsers
are handled at **build time** by producing one bundle per target from a single codebase.
Getting this separation right is what keeps it a single extension instead of a fork-fest.

## "Single extension" — what that actually means

One **codebase**, not one shipped artifact. The same source compiles into separate
packages, one per store:
- Chrome / Edge / Brave → Chrome Web Store (Chromium build)
- Firefox → addons.mozilla.org (Firefox build)
- Safari → Apple App Store (Safari build, via Apple's converter)

You maintain one project; you publish three packages. Don't expect a single binary that
runs everywhere — that doesn't exist for browser extensions.

## Axis 1 — Email providers (runtime, via the manifest)

There is **no runtime "switching" between providers.** The manifest routes each provider's
content script to its own domain, and the browser injects only the matching one:

```jsonc
"content_scripts": [
  { "matches": ["https://mail.google.com/*"],            "js": ["content_gmail.js"] },
  { "matches": ["https://mail.zoho.in/*","https://mail.zoho.com/*"], "js": ["content_zoho.js"] },
  { "matches": ["https://outlook.live.com/*","https://outlook.office.com/*"], "js": ["content_outlook.js"] }
]
```

Rules that keep this clean:
- **Isolated webpack entry points** — `content_gmail`, `content_zoho`, `content_outlook`
  are separate bundles. A break in the Zoho parser cannot affect Gmail users.
- **One shared background service worker** handles all providers (OTA sync, telemetry,
  link provenance). Providers never talk to each other.
- **Idempotent injection** — re-rendering the banner replaces, never stacks.
- **Observer de-dup** — debounce mutations and de-dupe by message id (a Gmail SPA fires
  thousands of mutations; do not re-scan the same email).
- The shared `@credmail/core` is bundled into each content script (or a shared chunk).

Adding a provider = a new `adapters/<provider>/` folder + one manifest match + one webpack
entry. Nothing else changes.

## Axis 2 — Browsers (build time, one source → many dist)

Same source, one `dist/<browser>/` per target. Three real differences to handle:

### 1. Background script
Chrome MV3 only supports a service worker for the background; Firefox only supports an
event page (`scripts`); Safari uses `scripts` by default. The clean fix is to declare
**both** keys — Chrome uses `service_worker`, Firefox uses `scripts`, with no conflict:

```jsonc
"background": {
  "service_worker": "background.js",
  "scripts": ["background.js"]
}
```

Write the background as small event-driven handlers (it may sleep in ~30s on Chrome) and
persist state to `storage`, never to globals.

### 2. API namespace
Use the `browser.*` namespace via Mozilla's `webextension-polyfill`. Firefox supports
`browser.*` natively; the polyfill provides it on Chromium targets. This avoids scattering
`chrome.*` vs `browser.*` branches through the code.

### 3. Safari
Safari is not a separate codebase. Build the standard bundle, then run Apple's
`safari-web-extension-converter` (requires macOS + Xcode) to wrap it into an Xcode
project, and distribute through the App Store. Treat Safari as a packaging step on top of
the same build.

### Manifest variants
Keep per-target manifest fragments (or a small generator) so each `dist/<browser>` gets the
right keys. Browser-specific differences live in the manifest, not in the TypeScript.

## `dist/` layout & build pipeline

```
packages/extension/
├── manifests/
│   ├── manifest.base.json        # shared keys
│   ├── manifest.chrome.json      # service_worker
│   ├── manifest.firefox.json     # scripts + browser_specific_settings
│   └── manifest.safari.json
├── webpack.config.js             # multi-entry, takes --env target=chrome|firefox|safari
└── dist/
    ├── chrome/                    # load unpacked here to test
    ├── firefox/                   # about:debugging → load temporary add-on
    └── safari/                    # input to safari-web-extension-converter
```

Webpack entry points: `background`, `content_gmail`, `content_zoho`, `content_outlook`,
`content_protector` (Active Shield, P2), `settings`. Disable `eval` (`devtool:
'cheap-module-source-map'`) — MV3 bans it. `copy-webpack-plugin` copies the right manifest
variant + assets into the target's `dist/`.

Suggested commands:
- `npm run build:chrome` → `dist/chrome/`
- `npm run build:firefox` → `dist/firefox/`
- `npm run build:safari` → `dist/safari/` (then convert via Xcode)
- `npm run build` → all three

**Verification (every build):** load the unpacked `dist/chrome` in Chrome and confirm it
runs on a live Gmail account; load `dist/firefox` via `about:debugging`. "It compiled" is
not "it works."

## Tooling note
A framework like WXT or Extension.js automates the per-browser manifest filtering, the
polyfill, and the `dist/<browser>` outputs. Optional, but it removes most of this
boilerplate if you'd rather not hand-roll the webpack config.

## Phasing
- **P1:** Chromium build (Chrome/Edge/Brave) + Gmail only.
- **P3:** Firefox build; Zoho + Outlook providers.
- **P4 / later:** Safari build; native add-ons are a different surface (see
  `dom-resilience.md` Strategy B), not part of this extension build.
