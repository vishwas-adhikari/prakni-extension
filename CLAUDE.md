# Cred Mail — Project Rules

Privacy-first phishing warning that runs locally inside webmail. Reads sender + content +
links together, warns only when something is wrong, never sends email data to a server.
Full context lives in `/docs` (start with `docs/detection.md` and `docs/architecture.md`).

## North star
**Precision is the product. Be silent when mail is safe.** A tool that flags legitimate
mail trains the user to ignore it and is worse than nothing. Prefer missing a borderline
case over warning on a safe one.

## Hard rules — never violate
- **Privacy:** never send `bodyText`, `subject`, `senderName`, `senderEmail`, or any PII
  over the network. Telemetry is metadata only. Strip the query string before sending any
  URL: `url.split('?')[0]`.
- **Core purity:** no `document`, `window`, or `chrome.*` in `core/`. It is pure TS, takes
  `EmailData`, returns `Verdict`, and must be unit-testable in Node.
- **Precision-first:** the Sender Trust Gate runs before content rules. No single weak
  signal may produce a warning — a warning needs one strong signal or a corroborated weak
  pair. Thresholds live in the OTA config object, never hardcoded.
- **Evidence before claims:** a detection change is NOT done until the corpus harness has
  run and printed the false-positive and catch numbers. Never say "it works" — show the
  command output.
- **Phase discipline:** build only the current phase (see `docs/roadmap.md`). If a task
  belongs to a later phase, flag it and stop — do not pull future scope forward.
- **Licensing:** verify Pro/Business tier with a signed token validated by signature +
  expiry. Never by scraping a DOM element.
- **MV3:** no `eval()` / `new Function()`; background is a `service_worker` that may sleep
  (persist state to `chrome.storage.local`, never to globals); OTA delivers JSON only.

## How to work
- Think before coding. State assumptions; surface tradeoffs; if unclear, stop and ask.
- Simplest thing that solves the task. No speculative abstractions or unrequested config.
- Surgical edits: change only what the task needs; don't refactor unrelated code, only
  clean up orphans your own change created.
- Plan any non-trivial task before editing and show the plan for approval.
- One adapter's parsing never leaks into another; detection logic never lives in an adapter.

## Project facts
- Stack: TypeScript (ES2022, strict), Webpack 5, Manifest V3.
- npm workspaces. Full layout → `docs/repo-structure.md`.
- Key paths:
  - `packages/core/` — the brain (pure TS, zero DOM/chrome)
  - `packages/extension/` — browser ext (Gmail adapter, UI, background) [P1]
  - `data/` — trusted lists, brands
  - `docs/` — project context docs
- Commands (fill in once P0 is scaffolded):
  - `npm test` — unit tests for `packages/core/`
  - `npm run harness` — precision corpus, prints FP % and catch %
  - `npm run build` — webpack → `dist/`

## Where detail lives (read on demand)
product → `docs/product.md` · requirements → `docs/prd.md` ·
architecture → `docs/architecture.md` · detection (the heart) → `docs/detection.md` ·
extraction → `docs/dom-resilience.md` · types/schema → `docs/schema.md` ·
UI → `docs/design.md` · phases/GTM → `docs/roadmap.md` ·
build/browsers/providers → `docs/build-and-targets.md` ·
repo layout → `docs/repo-structure.md` · full rules → `docs/AGENTS.md`