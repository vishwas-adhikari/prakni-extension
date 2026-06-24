# UI / UX

## Principles

1. **Silent when safe.** The design expression of "precision is the product." Safe mail
   gets **no banner and no pill** — not a green "all clear" on every message. We appear
   only when there is something to say. Constant reassurance is noise that trains users
   to ignore us.
2. **Native look.** The banner must read as part of the mail client, not a foreign popup.
3. **Style isolation.** Scoped shadow DOM or strictly inline styles so the client's CSS
   can't bleed in and ours can't leak out. `z-index: 9999`+ to sit above email content.
4. **Explain, don't just block.** List the specific reasons in plain language — this is
   the "human firewall" value and the differentiator over silent link-scanners.

## Components

### Reading-pane banner — Suspicious / High Risk only `[P1]`
Injected above the email body. Shows risk level + score, a short bulleted list of the
**specific** reasons that fired, and buttons **Mark Safe** (whitelist sender) and
**Report** (send query-stripped URL). Footer: "Local analysis. No data sent to cloud."

### Inbox list pill — Suspicious+ only `[P1]`
Small `⚠ Suspicious` / `🚨 High Risk` pill next to the subject in list view. **Safe rows
get nothing.** (The prototype's mistake — pilling almost everything — is exactly what we
remove.)

### Settings page `[P1]`
Active Protection toggle (off = pause all scanning), user trusted domains, blocked
senders. Stored in `chrome.storage.local`.

### Session overview widget `[P2]`
A small, dismissible floating panel showing this session's counts (e.g. "3 suspicious").
Must not itself become noise — counts only, no per-email spam.

### Active Shield overlay `[P2]`
Full-screen `position: fixed`-style soft-block if the user reaches an unverified site
*originating from an email link* and focuses a password `<input>`. *Constraint:* requires
broad host permissions and draws heavy store review — scope to opt-in and to flagged-link
origins only; never silently key-log.

### Admin dashboard (Business Lite) `[P3]`
Web portal: team threat timeline, "most-targeted user" leaderboard, teachable-moment
content, one-click report-to-admin. Shows counts and types only — **never** email
content (admins must not read employees' personal mail).

### Enterprise console `[P4]`
Fleet policy enforcement, compliance/DPDP PDF export, SIEM webhooks, MSP multi-tenant
view, white-label reports.

## Colour palette

- **Safe** — not shown (silent). Reserve green for settings status only.
- **Suspicious (Yellow):** bg `#FFF7ED`, border `#ED6C02`, text `#7C2D12`, icon `⚠️`.
- **High Risk (Red):** bg `#FEF2F2`, border `#C62828`, text `#7F1D1D`, icon `🚨`.

## Anti-patterns (do not do)

- No banner on safe mail. No pill on safe rows.
- No vague "this might be unsafe" without reasons — always say *why*.
- No modal that blocks reading the email; the banner is non-destructive.
- No overview/teachable popups frequent enough to become noise.
