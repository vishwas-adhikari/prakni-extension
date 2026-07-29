# DOM Resilience Audit — Prakni browser extension

**Type:** read-only inventory. No code was modified; no build/test was run.
**Scope:** everything under `packages/extension/src/` that reads provider DOM, plus the OTA
config `packages/extension/src/background/gmail-selectors.json`. `packages/core/` excluded.
**Date basis:** current working tree (includes uncommitted Outlook work).

---

## 0. Method & baseline confirmations

- **`packages/core/` has no DOM.** `grep -rE '\b(document|window)\b|chrome\.'
  packages/core/src` returns exactly **one** hit — a doc comment in
  `core/src/trust/whitelist.ts:6` that merely *names* `chrome.storage.local` in prose. No
  executable `document`/`window`/`chrome.*`. Confirmed: the engine is DOM-free by design.
- **Extension-owned pages excluded from the resilience surface.** `popup/popup.ts`,
  `dashboard/dashboard.ts`, `dashboard/theme.ts`, `warning/warning.ts` render into the
  extension's *own* `popup.html` / `dashboard.html` / `warning.html` (separate webpack
  entries). They query their own markup and, in `warning.ts`, the `?target=`/`?reasons=`
  query string — **never provider DOM**. They cannot break when Gmail/Outlook changes HTML,
  so they are out of scope for this audit.
- **OTA is not yet networked (critical, cross-cutting).** `background/ota-sync.ts:12-14`
  `runOtaSync()` does `setDomSelectors(selectors)` where `selectors` is the **bundled**
  `import ... from './gmail-selectors.json'` (`ota-sync.ts:9`). There is no remote fetch in
  P1. **Consequence:** every "OTA / self-healable" classification below is *latent* — the
  selector lives as data, but shipping a new value today still means shipping a new bundle,
  i.e. **a store update.** The self-heal only becomes real when the P3 networked sync lands.
  Treat "OTA" below as "OTA-*ready*," not "OTA-*live*."
- **Attribute names are a hardcoded sub-layer under every OTA selector.** OTA can express
  *which element* to select, never *which attribute to read off it*. The attribute names
  `email`, `data-hovercard-id`, `name` (Gmail) and `title` (Outlook) are baked into TS, so
  even a fully OTA-covered field has a hardcoded read that OTA cannot repair. (Matches the
  previously-logged "OTA attribute-name gap.")

---

## 1. Full DOM touchpoint inventory

Legend — **Type:** STABLE (id / ARIA / `data-test-id` / semantic tag), SEMI (tag+structure),
FRAGILE (hashed/generated class). **Source:** OTA / HARDCODED / HYBRID (OTA-first + hardcoded
fallback). **Val?** = content-shape validation on the returned node. **Fail:** (a) abort via
confidence gate, (b) fall back, (c) silently return wrong data & score it.

### 1.1 Gmail parser — `adapters/gmail/parser.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `extract` L163-164 | OTA `selectors.sender` → JSON `[".gD",".go span[email]","span.gD[email]","h3.iw span[email]"]` | sender element | FRAGILE (`.gD`,`.go` hashed) | HYBRID | N (selector) / Y downstream | b → heuristic |
| `emailFromEl` L65 | `getAttribute('email')` | sender email | SEMI (custom attr) | HARDCODED attr | — | b |
| `emailFromEl` L69-70 | `getAttribute('data-hovercard-id')` + `EMAIL_IN_TEXT` | sender email fallback | SEMI | HARDCODED attr | **Y** (`@` shape) | b |
| `emailFromEl` L71 | `visibleText(el).match(EMAIL_IN_TEXT)` | sender email last resort | — | HARDCODED | **Y** | b |
| `nameFromEl` L76 | `getAttribute('name')` | sender name | SEMI | HARDCODED attr | — | b |
| `heuristicSender` L88-92 | `['.ha','.ade']` then `[email],[data-hovercard-id]` | Layer-2 sender scan | FRAGILE (`.ha`,`.ade`) | HARDCODED | **Y** (emailFromEl) | a if empty |
| `messageRoot` L53,57 | `['[data-message-id]','.adn','.gs','.h7']` `closest()` | scope sender to open msg | STABLE+FRAGILE mix | HARDCODED | — | b → document |
| `extract` L170 | OTA `selectors.subject` → `["h2.hP",".ha h2","[data-thread-perm-id] h2"]` | subject | FRAGILE (`.hP`) | HYBRID | **N** | b → heuristic |
| `heuristicSubject` L104 | `document.querySelectorAll('h1, h2, h3')` largest-area | Layer-2 subject | SEMI | HARDCODED | **N** | **c** (largest heading may be wrong, still passes gate) |
| `extract` L173 | `visibleText(container)` (container = OTA body) | body text | — | HYBRID | — | b |
| `heuristicBody` L123 | `document.querySelectorAll('div, td, article, section')` longest innerText | Layer-2 body | SEMI | HARDCODED | **N** | **c** (longest text may be wrong, passes length gate) |
| `extract` L174 | `extractLinks(container)` | links | STABLE (`a[href]`) | HARDCODED | — | b |
| `extract` L196 | `checkConfidence(...)` | gate | — | — | — | a |

### 1.2 Gmail observer — `adapters/gmail/observer.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `pollForContainer` L60 | OTA `selectors.body` → `[".a3s",".ii.gt","div[data-message-id] .a3s"]` + fallback `.a3s` | detect "email opened" (body present) | FRAGILE (`.a3s`) | HYBRID | N | abort silently if never appears |
| L16 | const `FALLBACK_BODY_SELECTOR = '.a3s'` | last-resort body | FRAGILE | HARDCODED | N | — |
| L92 | `document.querySelector('[role="main"]')` (fallback `document.body`) | MutationObserver root | STABLE (ARIA) | HARDCODED | — | b → body |
| L21-24 | `location.hash` last segment | message id | — (URL) | — | — | — |

### 1.3 Gmail index — `adapters/gmail/index.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `findSubjectElement` L46-56 | OTA `selectors.subject` | pill anchor | FRAGILE (`h2.hP`) | OTA (no fallback) | N | returns null → no pill |
| L233-235 | `[data-credmail-banner/pill/row-pill]` | clear own UI on pause | own attrs | — | — | — |

### 1.4 Gmail row-scanner — `adapters/gmail/row-scanner.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| L17-23 defaults / L133 | OTA `dom_selectors.row` → container `.zA`; senderName `[".yX",".zF",".bA4","span[email]"]`; subject `[".bog",".bqe",".y6 span"]`; threadIdAttrs `["id","data-legacy-thread-id"]` | inbox row scan | FRAGILE (`.zA`,`.yX`,`.zF`,`.bA4`,`.bog`,`.bqe`) | HYBRID | — | best-effort, no pill |
| `findSender` L93-97 | `querySelectorAll(senderName)` → `getAttribute('email'|'data-hovercard-id')` | row sender | FRAGILE + attr | HYBRID | **Y** (`@`) | skip row |
| `scanInboxRows` L138 | `querySelectorAll(sel.container)` (`.zA`) | enumerate rows | FRAGILE | HYBRID | — | no rows → no pills |

### 1.5 Shared — `adapters/shared/`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `extract-links.ts` L43 | `querySelectorAll('a[href], area[href]')` | links (both providers) | STABLE | HARDCODED | — | b |
| `extract-links.ts` L18-27 | URL parse: `hostname.endsWith('google.com') && pathname==='/url' && q` | unwrap Google redirect | STABLE (URL shape) | HARDCODED | **Y** | leave as-is |
| `confidence.ts` L26-46 | `EMAIL_SHAPE`, body 10–100k, subject non-empty & `!== body` | extraction gate (both providers) | — | HARDCODED | **Y** | a |

### 1.6 UI — `ui/banner.ts`, `ui/pill.ts`

Operate on nodes they create + the **container/anchor the adapter passes in**; no provider
selectors of their own. `banner.ts` uses `[data-credmail-banner/pill]` (own attrs) +
`chrome.runtime.getURL('icons/…')`; `pill.ts` uses `subjectElement.parentElement` +
`[data-credmail-pill]`. Insertion points only — not provider-DOM reads.

### 1.7 Outlook parser — `adapters/outlook/parser.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `readingPaneScope` L108-114 / `extract` L198-203 | `#ConversationReadingPaneContainer` ∥ `[aria-label="Email message"]` ∥ `[data-test-id="mailMessageBodyContainer"].parentElement` ∥ `.ReadingPaneContainer` ∥ observer container | parser scope | STABLE (id/ARIA) + FRAGILE (`.ReadingPaneContainer`) | **HARDCODED** | — | b chain → container |
| `extractSenderFromHeadings` L140-153 | `[aria-label="Email message"]` then `[role="heading"][aria-level="3"]` + `EMAIL_REGEX` | **sender** | STABLE (ARIA) | **HARDCODED** | **Y** (`@`) | b → span scan |
| `extractSender` L72-107 | body via `[data-test-id="mailMessageBodyContainer"]`∥`.BodyFragment`∥`div[role='document']`∥`div[aria-label="Message body"]`; then `span` scan + `EMAIL_REGEX`, header-first | sender fallback | STABLE+FRAGILE(`.BodyFragment`) | **HARDCODED** | **Y** (`@`) | a if empty |
| `extract` L212-213 | OTA `otaSelectors.body` + `FALLBACK_BODY` `["[data-test-id…]",".BodyFragment","div[aria-label=…]","div[role='document']"]` | body element | STABLE+FRAGILE | HYBRID | N | b → scope-as-body (usedFallback) |
| `extract` L215/218 | `extractLinks(scope|bodyEl)` | links | STABLE | HARDCODED | — | b |
| `extract` L228-232 | OTA `otaSelectors.subject` → `extractSubjectFromHeadings` (`[role="heading"][aria-level="3"]`+`isSubjectText`) → `extractSubjectFromTitle` (`document.title` split `" - "`) | subject | STABLE (ARIA) / tab-title | HYBRID (OTA→hardcoded) | **Y** (`isSubjectText`) | b chain |
| `extract` L233-236 | `bodyText.split('\n')[0].slice(0,100)` | subject last resort | — | HARDCODED | N | usedFallback |
| `extract` L239 | `checkConfidence(...)` | gate | — | — | — | a |
| `sendTelemetry` L171-179 | `sendMessage({type, client:'outlook'})` | telemetry | — | — | — | — |

### 1.8 Outlook observer — `adapters/outlook/observer.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `findContainer` L33-45 | OTA `outlook.container` + hardcoded `CONTAINER_SELECTORS` `['[aria-label="Email message"]','[data-test-id="mailMessageBodyContainer"]','.ReadingPaneContainer']` | detect "email opened" | STABLE + FRAGILE(`.ReadingPaneContainer`) | HYBRID | N | abort silently |
| L96/104 | `MutationObserver … document.body` | watch reading-pane swaps | STABLE | HARDCODED | — | — |
| L20-22 | `location.href` | message id | — (URL) | — | — | — |

### 1.9 Outlook index — `adapters/outlook/index.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| `findSubjectElement` L52-70 | `#ConversationReadingPaneContainer` ∥ `[aria-label="Email message"]`, then `[role="heading"][aria-level="3"]` + `isSubjectText` | **pill anchor** | STABLE (id/ARIA) | **HARDCODED** | **Y** | null → no pill |
| `getOtaContainerSelectors` L79-82 | `dom_selectors.outlook.container` | observer container list | — | OTA | — | — |
| `renderOutlookBanner` L111-115 | `[data-test-id="mailMessageBodyContainer"]`∥`.BodyFragment`∥`div[role="document"]`∥`[aria-label="Email message"]` | **banner anchor** | STABLE+FRAGILE | **HARDCODED** | N | warn → no banner |
| `render` L151-152 | `#ConversationReadingPaneContainer` + `[data-credmail-pill]` | nowrap pill styling | STABLE + own attr | HARDCODED | — | — |
| `isListView` L239-247 | `[aria-label="Email message"]`,`[data-test-id…]`,`.ReadingPaneContainer`,`#ConversationReadingPaneContainer`,`.BodyFragment`,`div[role='document']` | list-vs-reading gate | STABLE+FRAGILE | HARDCODED | — | mis-gate scan |

### 1.10 Outlook row-scanner — `adapters/outlook/row-scanner.ts`

| Location | Selector / attribute | Extracts / does | Type | Source | Val? | Fail |
|---|---|---|---|---|---|---|
| L14-17 / `scanOutlookRows` L114-115 | OTA `outlook.inboxList` `['[aria-label="Message list"]','.customScrollBar']`; `outlook.inboxRow` `['div[role="option"]','div[role="row"]']` | list + rows | STABLE (ARIA) + FRAGILE(`.customScrollBar`) | HYBRID | — | return, no pills |
| L150-152 | `querySelectorAll('[title]')` → `getAttribute('title')` + `EMAIL_REGEX` | row sender | SEMI (`title` attr) | HARDCODED attr | **Y** | b → text |
| L155-156 | `row.textContent.match(EMAIL_REGEX)` | row sender fallback | — | HARDCODED | **Y** | skip row |
| `findTimestamp` L64-75 | `querySelectorAll('span, div')` + time regex + `width<120` | pill placement | SEMI (content+geometry) | HARDCODED | **Y** | fallback `right:90px` |

### 1.11 Outlook interceptor — `adapters/outlook/interceptor.ts`

`querySelectorAll('a[href]')` (STABLE, HARDCODED) inside the passed container; matches the
engine's `affectedLinks` by normalized URL; uses `data-credmail-original-href` (own attr).
Calls `unwrapGoogleRedirect` (a Gmail-ism; harmless no-op on Outlook URLs). Not selector-fragile.

### 1.12 Background — `background/{ota-sync,telemetry,index}.ts`

No provider DOM. `ota-sync.ts` writes the bundled JSON to storage; `telemetry.ts` logs
metadata; `index.ts:38-43` is the `onMessage` telemetry receiver (see §D).

---

## A. The un-healable holes (HARDCODED, no OTA path — needs a store update if it breaks)

> Ranked by blast radius. Recall §0: today *everything* needs a store update (OTA is
> bundled-only); this section is what stays un-healable **even after** networked OTA ships.

1. **Outlook sender — HARDCODED, no OTA slot at all.** `parser.ts:207`
   `extractSenderFromHeadings(scope) ?? extractSender(scope)`. Neither consults `otaSelectors`;
   there is **no `outlook.sender` key** in `gmail-selectors.json` and no code path that would
   read one. **Blast radius: all Outlook open-email detection.** If the sender heading structure
   changes, `senderEmail` = `''` → confidence gate `sender_not_email` (`confidence.ts:29`) →
   `extract` returns `null` → no verdict. **Safe-fail (a), not wrong-data**, and the selectors
   used (`[role="heading"][aria-level="3"]`, `[aria-label="Email message"]`) are STABLE
   (lower probability) — but zero config remedy.
2. **Outlook parser scope + reading-pane anchors — HARDCODED.** `readingPaneScope`
   (`parser.ts:108`), the banner anchor (`index.ts:111-115`), the pill anchor
   (`index.ts:52-70`), and `isListView` (`index.ts:239-247`) all hardcode
   `#ConversationReadingPaneContainer` / `[aria-label="Email message"]` / `.BodyFragment` /
   `div[role='document']`. Scope drives sender+subject+body scans, so breaking it degrades all
   three; STABLE-typed but un-healable. `.BodyFragment` here is FRAGILE.
3. **Gmail Layer-2 heuristics — HARDCODED & partly FRAGILE.** `SENDER_HEADER_AREAS = ['.ha','.ade']`
   (`parser.ts:27`, FRAGILE), `heuristicSubject` `h1,h2,h3` (`:104`), `heuristicBody`
   `div,td,article,section` (`:123`). Only reached when Layer-1 OTA already missed. **Danger:**
   `heuristicSubject`/`heuristicBody` have **no content validation** and can return wrong nodes
   that still pass the confidence gate → **failure mode (c), silently scored wrong data.**
4. **Hardcoded attribute names (both providers).** `email`, `data-hovercard-id`, `name`
   (`gmail/parser.ts:65,69,76`; `gmail/row-scanner.ts:20`), `title`
   (`outlook/row-scanner.ts:151`). OTA can move the element but never the attribute read.
5. **Outlook row-scanner `findTimestamp` + `.customScrollBar` fallback** (`row-scanner.ts:64,15`)
   — hardcoded; UI placement only (degrades pill position, not detection).

**Direct answers to the prompt's questions:**
- **Is sender OTA-driven per provider?** Gmail **yes** (`selectors.sender`, `parser.ts:163`,
  HYBRID with heuristic fallback). Outlook **no — HARDCODED** (confirmed; no `outlook.sender`
  key, no reader).
- **Is subject OTA-driven?** Gmail **yes** (`selectors.subject`, `:170`, HYBRID). Outlook
  **partly** — OTA `outlook.subject` *is* consulted first (`:228`) then hardcoded heading/title
  (HYBRID). Your belief "Outlook sender/subject are hardcoded" is **correct for sender, half-right
  for subject** (subject has an OTA-first slot; sender has none).

---

## B. FRAGILE selectors used as PRIMARY (break on every provider UI release)

Hashed/generated classes tried **first**, not as last-resort fallback:

| Selector (primary) | Where | Field | STABLE alt in same lookup? |
|---|---|---|---|
| `.gD` | JSON `sender[0]`, used `gmail/parser.ts:163` | Gmail sender | No — every entry is tied to `.gD`/`.go`; only `[email]` attr is semi-stable |
| `h2.hP` | JSON `subject[0]`, `gmail/parser.ts:170` & `index.ts:46` (pill) | Gmail subject | Weakly — `.ha h2` is structural, still list-position 2 |
| `.a3s` | JSON `body[0]`, `gmail/parser.ts:173` + `observer.ts:60,16` | Gmail body **and** open-detect | No |
| `.zA` | JSON `row.container`, `gmail/row-scanner.ts:138` | Gmail row container | No (sole selector) |
| `.yX`/`.zF`/`.bA4` | JSON `row.senderName[0..2]`, `:93` | Gmail row sender | Yes — `span[email]` is present but **last** |
| `.bog`/`.bqe` | JSON `row.subject[0..1]`, `:157` | Gmail row subject | Weakly — `.y6 span` (structural) is last |

**Asymmetry finding:** **Gmail's primaries are fragile hashed classes; Outlook's primaries are
STABLE.** Outlook consistently leads with `[data-test-id="mailMessageBodyContainer"]`,
`[aria-label=…]`, `#ConversationReadingPaneContainer`, `[role="heading"]`, `div[role="option"]`
and demotes fragile classes (`.ReadingPaneContainer`, `.BodyFragment`, `.customScrollBar`) to
fallbacks. Gmail has no such stable primaries available in its DOM.

---

## C. OTA coverage matrix (OTA-ready vs hardcoded-only)

> "OTA" = a selector list is read from `dom_selectors`; see §0 — currently bundled, not networked.

| Field | Gmail | Outlook |
|---|---|---|
| **sender** | **OTA** `selectors.sender` (HYBRID + heuristic) | **HARDCODED** (no `outlook.sender` key) |
| **subject (parse)** | **OTA** `selectors.subject` (HYBRID) | **HYBRID** `outlook.subject` → hardcoded heading/title |
| **body (parse)** | **OTA** `selectors.body` (HYBRID) | **HYBRID** `outlook.body` → hardcoded fallback |
| **links** | **HARDCODED** generic `a[href]`; JSON `links` key **UNUSED** (see below) | **HARDCODED** generic `a[href]`; no OTA key |
| **container (open-detect)** | **OTA** (reuses `selectors.body`) | **OTA** `outlook.container` (HYBRID) |
| **parser scope** | n/a (uses body container) | **HARDCODED** `readingPaneScope` |
| **row list/rows** | **OTA** `dom_selectors.row` (HYBRID) | **OTA** `outlook.inboxList`/`inboxRow` (HYBRID) |
| **subject-pill anchor** | **OTA** `selectors.subject` | **HARDCODED** (`index.ts:52`) |
| **banner anchor** | n/a (inserts into body container) | **HARDCODED** (`index.ts:111`) |

**Dead OTA config:** the `links` key in `gmail-selectors.json:5`
(`[".a3s a[href]",".ii.gt a[href]"]`) is **read by nothing** — verified: no code references
`selectors.links`/`.links`. `extractLinks` (`extract-links.ts:43`) hardcodes
`'a[href], area[href]'`. The key is inert config that gives a false impression of OTA link
coverage.

---

## D. Confidence gate + telemetry coverage (traced, definitive)

**Confidence gate runs on BOTH parser paths** — the same shared `checkConfidence`
(`shared/confidence.ts`):
- Gmail: `gmail/parser.ts:196`. Fail → `console.warn` + `sendTelemetry('extraction_low_confidence')`
  + `return null`; on `usedFallback` → `sendTelemetry('parser_fallback')` (`:199,202`).
- Outlook: `outlook/parser.ts:239`. Identical structure (`:242,245`).

**Telemetry fires on BOTH paths and is received.** Gmail `sendTelemetry` uses
`client:'gmail'` (`gmail/parser.ts:137`); Outlook uses `client:'outlook'`
(`outlook/parser.ts:174`). Both call `chrome.runtime.sendMessage`. The background receiver
`background/index.ts:38-43` runs `isTelemetryMessage(message)` → `handleTelemetryMessage`.
`isTelemetryMessage` (`telemetry.ts:19-25`) validates **only** `type ∈ {parser_fallback,
extraction_low_confidence}` — it does **not** filter on `client`, so `client:'outlook'` passes
and is logged. **Definitive: the Outlook path is fully covered — gate runs, both telemetry
events fire, background handles them.** (Handling = `console.log` only in P1; the real webhook
is P3.)

**Caveat — the gate is shallow.** `checkConfidence` (`confidence.ts:26-46`) only checks sender
email *shape*, body length 10–100k, and subject non-empty & `!== body`. It cannot detect a
*wrong-but-plausible* body/subject. So the Gmail `heuristicBody`/`heuristicSubject` paths and
the Outlook scope-as-body / body-first-line-subject fallbacks can pass the gate with incorrect
content → scored anyway (failure mode **c**). The gate protects against *empty/degenerate*
extraction, not *wrong* extraction.

---

## E. Observer / interceptor / row-scanner resilience

**Open-email observers (detect "an email is open"):**
- **Gmail** (`observer.ts`): keys on OTA `selectors.body` + hardcoded `.a3s` fallback (`:60,16`,
  FRAGILE) to confirm a body exists; MutationObserver root `[role="main"]` (`:92`, STABLE);
  message id from `location.hash`. Break point = `.a3s`/`selectors.body`.
- **Outlook** (`observer.ts`): keys on OTA `outlook.container` + hardcoded `CONTAINER_SELECTORS`
  (`:27`, STABLE `[aria-label]`/`[data-test-id]` + FRAGILE `.ReadingPaneContainer`);
  MutationObserver on `document.body` (STABLE); id from `location.href`. More stable than Gmail.

**Interceptors (link rewriting):** both key on generic `a[href]` (`gmail/interceptor.ts:52`,
`outlook/interceptor.ts` `querySelectorAll('a[href]')`) — STABLE, HARDCODED, not fragile. They
match the engine's `affectedLinks` by normalized URL and stash `data-credmail-original-href`.
Resilient to class churn.

**Row-scanners (list pills):**
- **Gmail** (`row-scanner.ts`): OTA `dom_selectors.row`, but every practical selector is FRAGILE
  (`.zA`, `.yX`, `.zF`, `.bA4`, `.bog`, `.bqe`); sender validated by `@` (`:97`). Highest churn
  surface; failure is best-effort (no pills), not detection loss.
- **Outlook** (`row-scanner.ts`): OTA `outlook.inboxList`/`inboxRow` with STABLE primaries
  (`[aria-label="Message list"]`, `div[role="option"]`); sender from `[title]` attr + text regex
  (`:150-156`, content-validated); `findTimestamp` hardcoded (UI placement). More resilient than
  Gmail's row scan.

---

## F. Prioritized breaking-point list (worst first)

Each is "if the provider changes X, we degrade and (today) can only fix via a store update."

1. **Gmail `.a3s`** (`observer.ts:60,16` + `parser.ts:173`). Single class powering **both**
   open-email detection **and** body extraction. If Google renames it: observer never confirms a
   container → **no Gmail detection at all**, and body extraction fails. OTA-ready (config value),
   but bundled-only today. **Highest blast radius.**
2. **Outlook sender** (`parser.ts:207`, HARDCODED, no OTA slot). Break → confidence abort → **no
   Outlook verdicts**. Safe-fail; STABLE selectors lower the odds; **zero config remedy even
   post-P3.**
3. **Gmail `.gD` sender** (`parser.ts:163`). Break → falls to `.ha/.ade` heuristic (also FRAGILE)
   → likely confidence abort. Degrades Gmail sender; OTA-ready.
4. **Outlook reading-pane scope / container** (`#ConversationReadingPaneContainer`,
   `[data-test-id="mailMessageBodyContainer"]`; `parser.ts:198`, `observer.ts:27`,
   `index.ts:111,52,239`). Break → scope + open-detect fail → Outlook down. Mostly HARDCODED;
   STABLE-typed.
5. **Gmail `h2.hP` subject** (`parser.ts:170`, `index.ts:46`). Break → `heuristicSubject`
   (largest heading) → may pass gate with wrong text (**mode c**) or degrade subject only.
6. **Gmail row selectors `.zA/.yX/.bog…`** (`row-scanner.ts`). Break → no inbox-row pills;
   core detection unaffected.
7. **Outlook banner/pill anchors** (`index.ts:111,52`). Break → detection still runs & caches,
   but no visible banner/pill. UI-only.
8. **Cross-cutting — hardcoded attribute names + bundled-only OTA** (§0). Until the P3 networked
   sync lands, **none** of the "OTA-ready" items above are actually field-fixable without a store
   update; and attribute-name breaks are un-healable regardless.

---

## Appendix — bundled `gmail-selectors.json` (current values, verbatim keys)

- Gmail: `sender` `[".gD",".go span[email]","span.gD[email]","h3.iw span[email]"]`;
  `subject` `["h2.hP",".ha h2","[data-thread-perm-id] h2"]`;
  `body` `[".a3s",".ii.gt","div[data-message-id] .a3s"]`;
  `links` `[".a3s a[href]",".ii.gt a[href]"]` **(unused — see §C)**;
  `row.{container:.zA, senderName, senderEmail:["email","data-hovercard-id"], subject, threadIdAttrs}`.
- Outlook: `container`, `body`, `subject`, `inboxList`, `inboxRow` present; **no `sender` key**;
  `subjectNote` is documentation only.
