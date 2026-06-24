# Extraction & DOM Resilience

The detection engine only sees structured `EmailData`. Producing that reliably across
providers is the job of the adapters. There are two extraction strategies.

## Strategy A — Browser Extension (DOM scraping) `[P1, P3]`

Webmail HTML class names are dynamically generated and change without notice. A naive
extension that targets fixed CSS classes goes blind on a UI update, and a store re-review
can take days. We survive this with a 3-layer self-healing system.

### Layer 1 — OTA selectors
DOM selectors live in the cloud, not the code. The service worker fetches a JSON config
and caches it in `chrome.storage.local`. When a provider changes its UI, we update a
string in the database and every extension self-heals within hours — no store review.

```json
{
  "gmail": {
    "sender":  ["[email]", ".gD", "span[email]"],
    "subject": ["h2.hP", ".ha h2"],
    "body":    [".a3s", ".ii.gt"],
    "links":   [".a3s a"]
  }
}
```
The OTA payload is **only JSON selector strings** — never executable code (Manifest V3
bans remote code).

### Layer 2 — Heuristic fallback, with a confidence check
If OTA selectors return nothing, fall back to structural heuristics (largest text node =
body; visible string containing `@` = sender).

**Critical:** heuristics fail *silently* — grabbing a quoted thread or footer as "the
body" — producing a confident verdict on the wrong text. So validate before trusting:
- sender candidate matches a basic email shape;
- body length is plausible (not 3 chars, not the whole page);
- subject is non-empty and distinct from the body.

If the confidence check fails, **do not score** — abort quietly and fire telemetry. A
wrong verdict is worse than no verdict.

### Layer 3 — Silent telemetry
The moment Layer 2 runs (or the confidence check fails), fire an anonymous webhook —
metadata only, never content:
```json
{ "event": "parser_fallback", "client": "gmail", "ts": "..." }
```
This alerts the team to refresh the OTA config before users complain.

### Algorithm
```
START → email opened (observer fires, debounced, de-duped by message id)
  → load OTA selectors from chrome.storage.local
  → try Layer 1 (querySelector with OTA strings)
      success → return EmailData
      fail    → try Layer 2 (heuristics)
                  confidence OK  → return EmailData + telemetry("parser_fallback")
                  confidence BAD → abort + telemetry("extraction_low_confidence")
END
```

## Strategy B — Native Add-ons (official APIs) `[P4]`

For enterprise, bypass the DOM entirely:
- **Google Workspace Add-on** (Apps Script): `GmailApp.getMessageById()`.
- **Microsoft Office Add-in** (Office.js): `Office.context.mailbox.item`.

Benefits: 100% stability (official APIs deprecate slowly), works on **mobile** apps,
gives **authentication results directly** (better precision than DOM), and IT admins
deploy company-wide in one click. The shared `core/` engine is unchanged — only the
adapter differs.

## Cross-provider rule

Detection logic is never duplicated in an adapter. Adapters only **extract** `EmailData`
and **render** the `Verdict`. Provider-specific parsing stays in its own folder
(`gmail/`, `zoho/`, …) so a break in one provider never affects another.

## Security & compliance

- **No remote code execution.** OTA delivers JSON selectors only.
- **No PII in telemetry.** Provider name + failure state + version only.
- **Same privacy in both strategies.** Extracted content goes straight to the local
  engine; it is never transmitted.
