# Schemas & Types

## Core TypeScript types (client-side, `core/types.ts`) `[P0]`

The core engine only ever sees these — never the DOM.

```typescript
// Produced by an adapter, consumed by the core engine.
export interface EmailData {
  id: string;                 // message/thread id (de-dupes scans)
  senderName: string;
  senderEmail: string;
  subject: string;
  bodyText: string;
  links: { text: string; url: string }[];
  auth: {                     // strongest precision input
    spf:   "pass" | "fail" | "unknown";
    dkim:  "pass" | "fail" | "unknown";
    dmarc: "pass" | "fail" | "unknown";
    aligned: boolean | null;  // authenticated domain matches From domain
  };
}

export interface TrustResult {
  trusted: boolean;
  reason: "authenticated" | "reputation" | "trusted_list" | "user_whitelist" | "not_trusted";
}

export interface RuleResult {
  ruleName: string;
  weight: number;
  strength: "weak" | "strong";
  description: string;        // plain-language reason shown in the banner
  affectedLinks?: string[];
}

export interface MlResult {   // [P2]
  probability: number;        // 0..1
  reasons: string[];          // e.g. ["High URL entropy", "Raw IP address"]
}

export interface Verdict {
  riskLevel: "Safe" | "Suspicious" | "High Risk";
  score: number;              // 0–100 for display
  silent: boolean;            // true when Safe → render nothing
  reasons: RuleResult[];      // populated only for Suspicious / High Risk
  ml?: MlResult;
}

export interface ScoringConfig {       // OTA-tunable; never hardcode thresholds
  suspiciousThreshold: number;
  highRiskThreshold: number;
  weakCorroborationNeeded: number;
}

export interface LocalState {          // chrome.storage.local
  user_tier: "free" | "pro" | "business_lite" | "enterprise";
  auth_token: string | null;           // signed tier token [P2]
  is_active: boolean;
  local_whitelist: string[];
  safe_contacts: string[];             // full addresses marked safe on freemail domains
  local_blocklist: string[];
  dom_selectors: Record<string, unknown>;    // cached OTA (string[] engine selectors + object-valued `row`)
  scoring_config: ScoringConfig;             // cached OTA
  session_stats: { scanned: number; detected: number; markedSafe: number };  // this-session counters
}
```

> **Extension-only storage keys** (kept in `chrome.storage.local` but *not* part of
> the `LocalState` interface, since the pure `core/` engine never reads them):
> - `scan_inbox_rows: boolean` — user toggle for the inbox row scanner (default `true`).
> - `recent_threats: ThreatRecord[]` — last 20 flagged emails (Suspicious/High Risk), local-only, capped/FIFO/de-duped. Stores readable IOCs (sender, riskLevel, reasons, query-stripped maliciousUrl) plus a 30-char normalized subject prefix (for cross-provider inbox reflection via substring containment). No full subject/body stored. Powers inbox row reflection and the dashboard threat feed.

## Cloud schema (Supabase / PostgreSQL)

Tagged by the phase that introduces each table. DPDP principle throughout: **no email
content is ever stored.**

### Phase 1 — self-healing + intake
**`dom_selectors`** — `client` (text, PK), `version`, `selectors` (jsonb),
`scoring_config` (jsonb), `updated_at`.
**`extension_telemetry`** — `id` (PK), `event` (`parser_fallback` /
`extraction_low_confidence` / `rule_fired`), `client`, `extension_version`,
`created_at`. *No content, no user id.*
**`threat_reports`** — `id` (PK), `url_hash` (SHA-256 of query-stripped URL), `raw_url`
(query-stripped), `created_at`. *No content, no reporter identity by default.*

### Phase 2 — accounts, billing, deep scan
**`profiles`** (extends `auth.users`) — `id` (PK), `email`, `full_name`, `org_id` (FK,
nullable), `role` (`user`/`org_admin`/`super_admin`), `tier`, `payment_customer_id`,
`subscription_status`.
**`vt_scan_cache`** — `url_hash` (PK), `positives`, `total`, `permalink`,
`last_scanned_at` (cached ≤ 7 days).

### Phase 3 — teams + dashboard
**`organizations`** — `id` (PK), `name`, `domain`, `max_seats`, `created_at`.
**`security_rules`** — `id` (PK), `user_id` (FK, nullable), `org_id` (FK, nullable),
`rule_type` (`whitelist`/`blacklist`), `target_domain`, `created_at`.
**`incident_logs`** — `id` (PK), `org_id` (FK), `user_id` (FK), `threat_type`,
`action_taken` (`Blocked`/`Bypassed_By_User`), `timestamp`. *Target URL/sender NOT stored
— admins must not be able to read employees' personal mail.*

### Phase 4 — enterprise/platform
Fleet-management policy tables, SIEM webhook config, MSP tenant mapping, and API-key
tables for the SDK. Defined when P4 begins.
