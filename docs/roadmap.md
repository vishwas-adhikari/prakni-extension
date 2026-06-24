# Roadmap, Go-to-Market & Business Model

Honest and sequenced. Do not start a phase before the previous phase's exit criterion is
met. The full platform is the destination; phases are the route.

## Implementation phases

### P0 — Precision Foundation
Prove the brain is trustworthy before building around it.
- Extract `core/` (pure TS, no DOM/chrome).
- Build the labelled corpus (~100 legit incl. tricky transactional + ~100 phish incl.
  beachhead lures).
- Implement Sender Trust Gate + rules + corroboration scorer.
- **Exit:** false positives on legit < 2% and phishing catch ≥ 90% on the corpus.

### P1 — MVP (Gmail extension, Free tier)
- Gmail adapter: observer, OTA-first extraction, confidence-checked heuristic fallback.
- Banner + inbox pill (Suspicious+ only); settings page; Mark Safe / Report.
- Thin cloud: OTA config, telemetry, report intake.
- **Exit:** packaged, loads in Chrome, behaves correctly on a live Gmail account, survives
  a simulated selector change via OTA.

### P2 — Pro tier + beachhead pilot
- Recruit 5–10 beachhead users (Indian CAs / tax pros); tune locale rules from real
  reports; watch in-the-wild false-positive rate (every Mark Safe = a labelled mistake).
- Pro features: on-device ML classifier; Active Shield (opt-in); Deep Scan via Threat
  Intel proxy; signed-token licensing + Razorpay annual billing.
- **Exit:** pilot users keep it installed 14 days and report real catches without
  over-warning; first paying Pro users.

### P3 — Multi-provider + Business (B2B Lite)
- Zoho, Outlook (web), Firefox adapters.
- Cloud-synced security rules; anonymised incident logs; Business Lite admin dashboard
  (team timeline, leaderboard, teachable moments).
- **Exit:** a real small firm runs the dashboard and renews.

### P4 — Enterprise + Platform
- Native Workspace (Apps Script) + Office.js add-ons (API-based, mobile, IT-deployable).
- Fleet management, SIEM webhooks, compliance/DPDP PDF export, Brand AI (computer
  vision), MSP multi-tenant console, detection SDK/API.
- **Exit:** first enterprise contract and/or first MSP reseller live.

## Go-to-market

- **Beachhead first (P2):** hand-to-hand outreach to Indian CAs/tax pros. No ads/SEO yet.
  Free in exchange for honest feedback. Pitch = **trust + locale fit**, not "AI" or "beats
  Google": *"Catches the GST/Tax/KYC scams generic filters miss, runs entirely on your
  device, and tells you exactly why an email looks wrong."*
- **Channel (P3–P4):** MSPs / IT consultants as super-distributors — win 10 MSPs with 100
  clients each instead of selling one-by-one. Multi-tenant console + white-label reports.
- **Ecosystem (P4):** Zoho / Microsoft marketplace listings; professional-body
  endorsements (e.g. ICAI) once compliance materials exist.

## Pricing tiers (intended model — validate in P2)

| Tier | Audience | Price (intent) | Unlocks |
| :-- | :-- | :-- | :-- |
| Personal | Individuals, students | Free | Banners, badges, basic heuristics, local processing |
| Pro | Solo professionals | ₹999 / yr (annual upfront) | ML, Active Shield, Deep Scan |
| Business Lite | Small offices (≤10) | bucket flat fee | Admin dashboard, teachable moments |
| Enterprise | 50+ / regulated | per-seat | Fleet mgmt, SIEM, compliance export, Brand AI |
| MSP / Partner | IT resellers | wholesale (channel margin) | Multi-tenant console, white-label |
| Platform / API | Other SaaS | licensing | Detection SDK |

Billing is **annual upfront** (UPI/one-time) to avoid India recurring-mandate churn.

## Revenue model (framing, not a promise)

Tiered SaaS + channel wholesale + compliance/training add-ons. Targets are hypotheses to
be validated by the P2 pilot, not commitments. The near-term goal is a profitable,
self-funded business, not a capital-burning land-grab.

## Explicitly off the near-term path
No patents, no threat-feed licensing deals, no six-tier rollout at once, no computer
vision, no enterprise console — until the P2 pilot proves users keep the tool installed.
