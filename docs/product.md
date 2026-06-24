# Product

## The problem

Phishing is the entry point for most account takeovers and business fraud. Native
filters in Gmail/Outlook block obvious bulk spam, but **targeted, well-written phishing
still lands in the inbox** — and once it's there, nothing reads the *language and intent*
of the message to warn the human who is about to act on it.

The market splits into two camps with a gap between them:

- **Free browser extensions** (PIXM, Netcraft, etc.) defend the **click** — link
  reputation, URL structure, the landing page. They do not read the email body or reason
  about intent.
- **Enterprise API tools** (Abnormal, Sublime, Barracuda) read content and model intent —
  but require org-wide deployment into a managed Microsoft 365 / Google Workspace tenant
  with an IT admin. They do not serve an **un-managed individual**.

**Our seat is the gap:** content-and-sender-aware phishing warnings for the individual
professional who is not inside a managed enterprise — delivered without sending their
mail to anyone — and later extended upward into a full B2B/enterprise platform.

## Vision (the full ambition)

A privacy-first phishing-defence platform serving **SMBs and professionals worldwide**,
across browser extensions and native add-ons, with local detection, an explainable
"teach me why" experience, central admin visibility for teams, and a reseller channel.
The detection engine is eventually exposed as an SDK/API so other products can embed it.

## Who it's for (segments)

- **Solo / high-value professionals (B2C).** Lawyers, accountants, traders, consultants,
  privacy-conscious individuals. Handle sensitive data, no IT team, fear one bad click.
  *Served by:* the browser extension, Free + Pro tiers.
- **Reputation-sensitive professional SMBs (B2B Lite).** CA firms, law firms, wealth/real-
  estate boutiques. A single leak ends their credibility.
- **Digital-native SMBs.** Agencies, IT services, SaaS startups (10–100 staff), remote/WFH.
- **BEC-target SMBs.** Manufacturing, logistics, export-import — prime business-email-
  compromise (fake invoice / bank-change) targets.
- **MSPs / IT consultants (channel).** Super-distributors who resell to many small offices.
- **Enterprise (B2B).** Banks, fintech, healthcare needing governance, audit, SIEM.

### Beachhead (where we start, P2 pilot)

**Indian tax & accounting professionals (CAs).** Flooded with locale-specific lures (GST,
Income-Tax refund, Tally-update, bank-KYC), handle client money, install their own tools,
and are beneath the radar of global vendors. Global ambition, India beachhead first.

## Positioning

- **Privacy by design.** Email body, subject, sender name, and PII never leave the device.
- **Explainable.** We don't just block — we say *why*, turning mistakes into training.
- **Locale-aware.** Tuned for the scams global tools ignore (starting with Indian lures).
- **Resilient.** Self-healing extraction so the product doesn't break on UI changes.

## Honest limits (state these, don't hide them)

- **No org graph at the individual tier.** Deep BEC detection (which relies on modelling
  an organisation's communication patterns) is structurally weaker for a single user.
  At B2C we focus on signals visible in **one email**; full BEC modelling arrives with the
  team/enterprise tiers (P3–P4) that have org context.
- **Browser tiers cover webmail only** (not desktop clients or mobile). Native add-ons
  (P4) close that gap via official APIs.
- **Not "better than Microsoft" in general.** The provable claim is locale/vertical
  superiority on specific threat classes.

## What we are NOT doing

- No cloud scanning of email content — ever.
- No patent or "unfair IP moat" claims.
- No absolute compliance/legal guarantees.
- No global multi-vertical land-grab before the beachhead is won.

## Where the moat actually is

Not the technology (local ML and link-scanning are commodities). The defensible ground is
the combination large vendors won't chase: **locale + vertical tuning + trustworthiness
(near-zero false positives) + an explainable UX + a channel (MSP) relationship.** Hard to
copy, beneath the radar of the funded players.
