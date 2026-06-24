# Product Requirements

Every feature of the full platform, tagged by phase. `[P0]`…`[P4]` mark when it is built.

## Governing success metric (applies from P0 onward)

On a labelled test set of real mail:
- **False positives on legitimate email ≈ 0** (target < 2%).
- **Catch rate on obvious phishing ≥ 90%.**

A high catch rate with a high false-positive rate is a failed product. This metric gates
every release.

## Functional requirements

### Detection engine (the brain)
- **[P0] Sender Trust Gate** — runs first; short-circuits trusted senders to silent Safe.
  Composed of: email authentication (SPF/DKIM/DMARC alignment), a curated trusted-domain
  list, and the user's whitelist. A reputation Bloom filter is part of this gate (small
  list at P0; the full top-10M set is a P1+ enhancement requiring `unlimitedStorage`).
- **[P0] Rules engine** — weighted *signals* (never standalone verdicts): sender/brand
  mismatch, homoglyph & punycode links, link-text vs href mismatch, credential-harvest
  shape, urgency, financial triggers, locale lures.
- **[P0] Scorer** — corroboration logic → Safe / Suspicious / High Risk; thresholds in an
  OTA-tunable config object.
- **[P2] Local ML classifier** — runs on-device for Pro users; starts on URL/structural
  features, trained on data gathered from the Report/Mark-Safe loop.
- **[P2] Deep Scan** — Pro users may send a query-stripped URL through a backend proxy to a
  reputation service (e.g. VirusTotal). Email content is never sent.
- **[P4] Brand AI (computer vision)** — visual logo/brand-spoof verification for enterprise.

### Extraction
- **[P1] Gmail adapter** — DOM extraction via OTA selectors with heuristic fallback.
- **[P1] OTA selector sync** — fetch DOM selectors from the cloud; self-heal without a
  store update.
- **[P1] Confidence-checked heuristic fallback** — never score low-confidence extraction.
- **[P3] Zoho, Outlook (web), Firefox** adapters.
- **[P4] Native add-ons** — Google Workspace (Apps Script) + Office.js using official
  APIs; covers desktop and mobile, immune to DOM changes.

### UI
- **[P1] Reading-pane banner** — shown only for Suspicious/High Risk, lists specific
  reasons in plain language; buttons Mark Safe, Report.
- **[P1] Inbox list pill** — `⚠ Suspicious` / `🚨 High Risk` next to subject; safe rows
  get nothing.
- **[P1] Settings page** — Active Protection toggle, trusted domains, blocked senders.
- **[P2] Session overview widget** — counts of threats seen this session.
- **[P2] Active Shield** — full-screen soft-block if the user reaches an unverified site
  from an email link and tries to enter a password. *Note: requires broad host
  permissions; scope to opt-in / flagged-link origins and expect heavy store review.*
- **[P3] Admin dashboard (Business Lite)** — team threat timeline, leaderboard, teachable
  moments, one-click report-to-admin.
- **[P4] Fleet management** — remote policy enforcement, cannot-disable, SIEM webhooks,
  DPDP/compliance PDF export, MSP multi-tenant console.

### Cloud / business integration
- **[P1] OTA config endpoint**, **telemetry endpoint** (metadata only), **report intake**.
- **[P2] Auth + licensing** — verify Pro/Business tier via a signed token (NOT a scraped
  DOM div); billing via Razorpay, annual upfront.
- **[P2] Threat Intel proxy** — server-side key protection for Deep Scan.
- **[P3] Cloud-synced security rules** — org/user whitelists and blacklists.
- **[P3] Incident logs** — anonymised team telemetry for the dashboard.
- **[P4] Platform API/SDK** — detection engine exposed to third parties.

## Non-functional requirements

- **NFR-1 Privacy:** email body, subject, sender name, and PII never transit the network.
  Only anonymous metadata and query-stripped URLs (Report/Deep Scan) may be sent.
- **NFR-2 Performance:** extraction + scoring + injection feels instant on open (budget
  ~500 ms warm); heavy work off the UI thread (Web Worker).
- **NFR-3 Resilience:** a provider UI change must never silently produce a wrong verdict
  (see the extraction-confidence rule in `dom-resilience.md`).
- **NFR-4 MV3 compliance:** no remote code, no `eval`, service-worker background.
- **NFR-5 Cross-browser:** Chromium first (P1), Firefox via polyfill (P3).
