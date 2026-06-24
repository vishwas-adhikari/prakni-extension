# Repository Structure

Standard npm workspaces. Lean — only folders that have code in them right now. Future
packages (cloud, addons) are created when their phase starts, not before.

```
credmail/
├── CLAUDE.md                          # project rules (the only AI instruction file)
├── README.md
├── package.json                       # npm workspace root
├── tsconfig.base.json                 # shared TS config (ES2022, strict)
├── .nvmrc
├── .gitignore
│
├── docs/                              # project brain (context docs, not code)
│   ├── README.md
│   ├── product.md
│   ├── prd.md
│   ├── architecture.md
│   ├── detection.md
│   ├── dom-resilience.md
│   ├── schema.md
│   ├── design.md
│   ├── roadmap.md
│   ├── build-and-targets.md
│   ├── repo-structure.md              # this file
│   └── AGENTS.md
│
├── data/                              # build-time data assets
│   ├── trusted-domains.json           # curated trusted sender list [P0]
│   └── brands.json                    # brand name → canonical domain map [P0]
│
└── packages/
    │
    ├── core/                          # @credmail/core — the brain [P0]
    │   ├── package.json               #   pure TS, zero DOM/chrome/network
    │   ├── tsconfig.json
    │   ├── src/
    │   │   ├── index.ts               # analyzeEmail(data): Verdict
    │   │   ├── types.ts               # EmailData, Verdict, RuleResult, etc.
    │   │   ├── config.ts              # default ScoringConfig
    │   │   ├── trust/
    │   │   │   ├── index.ts           # orchestrates gate checks
    │   │   │   ├── auth.ts            # SPF/DKIM/DMARC alignment
    │   │   │   ├── reputation.ts      # trusted list lookup
    │   │   │   └── whitelist.ts       # user-marked-safe senders
    │   │   ├── rules/
    │   │   │   ├── index.ts           # runRules(data): RuleResult[]
    │   │   │   ├── brand-mismatch.ts
    │   │   │   ├── homoglyph.ts
    │   │   │   ├── link-mismatch.ts
    │   │   │   ├── credential-harvest.ts
    │   │   │   ├── urgency.ts
    │   │   │   └── financial.ts
    │   │   └── scorer.ts              # corroboration → Verdict
    │   └── test/
    │       ├── unit/
    │       │   ├── gate.test.ts
    │       │   ├── brand-mismatch.test.ts
    │       │   ├── homoglyph.test.ts
    │       │   ├── link-mismatch.test.ts
    │       │   ├── urgency.test.ts
    │       │   ├── financial.test.ts
    │       │   └── scorer.test.ts
    │       └── corpus/                # precision harness [P0]
    │           ├── harness.ts         # runs all, prints FP% + catch%
    │           ├── legit/             # ~100 known-good emails as JSON
    │           └── phish/             # ~100 known-phishing emails as JSON
    │
    └── extension/                     # browser extension [P1]
        ├── package.json               # depends on @credmail/core
        ├── tsconfig.json
        ├── webpack.config.js
        ├── manifest.json              # MV3, Chrome-first (variants later)
        ├── public/
        │   ├── icons/
        │   └── settings.html
        ├── src/
        │   ├── background/
        │   │   ├── index.ts
        │   │   ├── ota-sync.ts
        │   │   └── telemetry.ts
        │   ├── adapters/
        │   │   ├── shared/
        │   │   │   ├── extract-links.ts
        │   │   │   ├── clean-text.ts
        │   │   │   └── confidence.ts
        │   │   └── gmail/
        │   │       ├── index.ts
        │   │       ├── observer.ts
        │   │       └── parser.ts
        │   ├── ui/
        │   │   ├── banner.ts
        │   │   ├── pill.ts
        │   │   └── styles.ts
        │   ├── settings/
        │   │   └── settings.ts
        │   └── storage/
        │       └── local-state.ts
        └── dist/                      # build output (gitignored)
```

## What gets created when

| Phase | Create | Don't create yet |
| :-- | :-- | :-- |
| **P0** | `packages/core/`, `data/`, `docs/` | extension |
| **P1** | `packages/extension/` (Gmail + Chrome only) | cloud, addons, other providers |
| **P2** | `core/ml/`, `core/rules/locale-in.ts`, `extension/shield/`, `extension/auth/` | cloud, addons |
| **P3** | `packages/cloud/`, zoho/outlook adapters, Firefox manifest variant | addons |
| **P4** | `packages/addons/` | — |

## Workspace config

Root `package.json`:
```json
{
  "private": true,
  "workspaces": ["packages/*"]
}
```

That's it. No turbo, no pnpm. `npm install` at the root links the workspaces.

## Commands

```
npm test              → unit tests (packages/core)
npm run harness       → precision corpus: FP% + catch%
npm run build         → webpack → dist/ (P1)
```

## Rules

- `core/` has zero DOM, `chrome.*`, or network dependencies.
- One `manifest.json` for Chrome first; browser variants come at P3.
- Each provider gets its own adapter folder; parsing never leaks across.
- Folders for future phases are created when that phase starts, not before.
