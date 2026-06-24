# Detection Engine — the Brain

The most important document. It defines how we reach a verdict **without crying wolf**.

## Governing principle

> **Be a guard dog that ignores the mailman and only barks at strangers.**

Most mail is legitimate, so the default is **Safe and silent**. A banner is an
interruption we must earn. We bark only when independent signals agree.

Three derived rules:
1. **Check WHO sent it before judging WHAT it says.** Sender trust is evaluated first. A
   "verify your code" from an authenticated, trusted domain is fine; the same words from a
   stranger spoofing a bank are not.
2. **One signal is never a verdict.** "Contains urgency language" alone must never flag —
   transactional mail is full of it. A warning needs **corroboration**.
3. **When unsure, stay quiet.** Missing a borderline case beats annoying the user on a
   safe one.

## Pipeline

```
EmailData
  │
  ▼
[1] Sender Trust Gate ── trusted? ── yes ─► Verdict: SAFE (silent). STOP.
  │ no
  ▼
[2] Rules Engine ───────────────► weighted signals
  │
  ▼  (Pro: also [2b] ML Classifier ► probability + reasons)
  │
  ▼
[3] Scorer ── corroboration + thresholds ─► SAFE / SUSPICIOUS / HIGH RISK
  │
  ▼
[4] UI: banner + pill ONLY if SUSPICIOUS or HIGH RISK
```

## [1] Sender Trust Gate `[P0]`

Runs first. If any check clears the sender, the email is `Safe`, no banner, and the rules
do **not** run. The gate combines four signals:

- **Email authentication (strongest).** SPF / DKIM / DMARC pass *and* the authenticated
  domain aligns with the From domain. This is what stops a spoofer who simply types
  `amazon.com` in the From field — reputation alone cannot. (Cleaner via the Gmail API
  in P4 than via the DOM.)
- **Reputation Bloom filter.** Fast membership check against a known-reputable-domains
  set (small curated list at P0; full top-10M set is a P1+ enhancement needing
  `unlimitedStorage`). *Caveat:* a Bloom filter has false positives, so a hit alone never
  bypasses scanning if authentication fails — reputation answers "is this domain
  generally known," authentication answers "did the mail really come from it." Use both.
- **Curated trusted list.** Well-known senders + major regional services (OTA-updatable).
- **User whitelist.** Senders the user marked Safe (`chrome.storage.local`).

> A *failed* gate does not mean "phishing." Plenty of legitimate small senders fail it and
> should still come out `Safe` after the rules find nothing.

## [2] Rules Engine `[P0]` — signals, not verdicts

Each rule returns `RuleResult { ruleName, weight, strength, description, affectedLinks? }`:

| Rule | Strength | Notes |
| :-- | :-- | :-- |
| Sender / brand mismatch | strong | body/subject names a brand, From domain is generic/unrelated |
| Lookalike link (homoglyph / punycode) | strong | `xn--…`, Cyrillic chars, `paypa1.com` |
| Link text vs destination mismatch | strong | anchor says one host, href is another / raw IP |
| Credential-harvest shape | medium | login/verify page on an unverified domain |
| Urgency language | weak | only meaningful when corroborated |
| Financial trigger | weak | invoice, bank-change, gift card, crypto |
| Locale lures (beachhead) | medium | GST / Income-Tax / Tally / KYC patterns, tuned per vertical |

Weak rules carry low weight by design so they cannot trip a warning alone; they exist to
*amplify* a real mismatch.

## [2b] ML Classifier `[P2]`

On-device for Pro users. Starts on URL/structural features (entropy, subdomains, raw IP),
trained on the labelled dataset gathered from the Report / Mark-Safe loop. Added only
**after** rules + gate are tuned, so it improves recall without re-introducing
unexplained false positives. Brand-AI / computer-vision verification arrives in P4.

## [3] Scorer `[P0]` — corroboration over addition

Not a naive sum:
- A verdict above `Safe` requires **at least one strong signal**, OR a weak signal
  **corroborated** by another independent weak signal.
- Strong signals stack toward `High Risk`.
- A lone weak signal stays `Safe`.
- Thresholds live in an **OTA-tunable `ScoringConfig`**, never hardcoded:

```
SAFE        : no strong signal and no corroborated weak pair
SUSPICIOUS  : one strong signal, OR a corroborated weak pair
HIGH RISK   : two or more strong signals (e.g. brand mismatch + lookalike link)
```

### Corroboration refinement: content-only weak pairs do not corroborate

"Independent" is load-bearing. Weak signals fall into two families:

- **Content** weak signals — `urgency`, `financial` — read the words of the message.
- **Structural** weak signals — `url-shortener`, `url-entropy`,
  `deceptive-url-keywords`, `credential-harvest` — read the links and sender.

Urgency and financial language co-occur constantly in *legitimate* transactional
mail (a payment reminder is, by nature, urgent and financial), so a pair of them
is the highest false-positive-risk combination — not genuine corroboration. A
corroborating weak pair therefore **must include at least one structural signal**.
Two content-only weak signals stay `Safe`.

```
weak pair corroborates  ⟺  ≥ weakCorroborationNeeded weak signals
                            AND at least one is structural (URL/sender-based)
```

This is a precision tightening, consistent with the north star: we would rather
miss a weak-only lure than warn on a routine "pay your invoice now" email.

## [4] UI gating

- `Safe` → nothing. No banner, no pill. Invisible.
- `Suspicious` → yellow banner + pill, reasons listed.
- `High Risk` → red banner + pill, reasons listed.

## Measuring precision (do this in P0, before product work)

1. Build a **labelled corpus**: ~100 known-legit emails (including tricky transactional
   ones — verification codes, invoices, statements, signup confirmations) + ~100 known
   phishing (including beachhead-vertical lures).
2. Run the engine over it.
3. Report two numbers: **false positives on the legit set** (→ 0) and **catches on the
   phishing set** (≥ 90%).
4. Iterate on gate + weights + thresholds against the corpus until both pass.
5. In the wild, treat every **Mark Safe** click as a labelled false positive to feed back.
