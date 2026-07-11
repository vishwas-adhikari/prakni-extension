# Prakni

Privacy-first phishing warning that runs locally inside webmail. It reads sender + content +
links together, warns only when something is wrong, and never sends email data to a server.

> **Precision is the product. Be silent when mail is safe.** See `CLAUDE.md` and `docs/`.

## Layout

```
packages/core/        @credmail/core — the detection brain (pure TS, no DOM/chrome) [P0]
packages/extension/   browser extension (Gmail adapter, UI, background)            [P1 — placeholder]
data/                 trusted-domains.json, brands.json                            [P0]
docs/                 project context docs (start with detection.md)
```

## Requirements

Node 22 (see `.nvmrc`). Install at the repo root — npm workspaces link the packages.

```
npm install
```

## Commands

```
npm test          # unit tests for packages/core
npm run harness   # precision corpus: prints false-positive % and catch %
npm run build     # typecheck core (webpack build lands in P1)
```

## Status

**Phase 0 — Precision Foundation.** The core engine (Sender Trust Gate → rules →
corroboration scorer) and the labelled-corpus harness are implemented. The browser
extension is a P1 placeholder. See `docs/roadmap.md` for the phase plan.
