# Engineering Rules (for any human or AI agent on this codebase)

Follow strictly. These encode the architecture and the one rule that matters.

## 1. Precision is the product
- **Default to NOT flagging.** A change that raises catches but also raises false
  positives on the legit corpus is rejected.
- **Sender Trust Gate runs before content rules.** Never score urgency/finance/brand
  language on a sender that passed the gate.
- **No single weak signal may produce a warning.** Warnings need a strong signal or a
  corroborated weak pair (see `detection.md`).
- Thresholds and weights live in an OTA-updatable config object — never hardcoded.

## 2. Core purity (Core + Adapters)
- **No `document`, `window`, or `chrome.*` inside `core/`.** Pure TS; takes `EmailData`,
  returns `Verdict`; unit-testable in Node.
- **No detection logic in adapters.** Adapters only extract `EmailData` and render
  `Verdict`.
- **Do not share DOM-parsing code across providers.** Gmail logic stays in `gmail/`, etc.

## 3. Privacy (non-negotiable)
- **Never** transmit `bodyText`, `subject`, `senderName`, `senderEmail`, or any PII.
- Telemetry is **metadata only** (event, client, version).
- Before sending a URL (Report / Deep Scan only), strip the query string:
  `url.split('?')[0]`.
- The same rule holds in every adapter, including native API add-ons.

## 4. Extraction resilience
- Prefer OTA selectors from `chrome.storage.local`; fall back to heuristics only on null.
- **Validate heuristic output with a confidence check** before scoring. On low
  confidence, abort and fire telemetry — never score wrong data.
- Cast DOM elements explicitly (`as HTMLElement`) before reading `.innerText`.

## 5. Manifest V3
- No `eval()` / `new Function()`.
- Background is a `service_worker`; assume it sleeps — persist state to
  `chrome.storage.local`, never to background globals. (Critical for Active Shield link
  provenance.)
- OTA fetches are JSON only. Never download or execute remote code.

## 6. Licensing
- Verify Pro/Business tier with a **signed token validated by signature + expiry** — never
  by scraping a DOM element. (The hidden-`<div data-tier>` approach is forbidden.)

## 7. Observers
- Debounce mutation/navigation events and **de-duplicate by message id**.
- Banner injection is idempotent: re-render replaces, never stacks duplicates.

## 8. Phase discipline
- Build only what the current phase calls for (`prd.md` / `roadmap.md` phase tags). If a
  task belongs to a later phase, flag it and stop — don't pull future scope forward.

## 9. Claims discipline (in code comments, copy, and docs)
- No patent or "unfair IP" claims. No absolute legal/compliance guarantees. State
  privacy behaviour factually ("email content is not transmitted"), not as a legal promise.
