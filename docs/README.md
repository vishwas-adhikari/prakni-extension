# Cred Mail — Project Brain

Privacy-first phishing defence that runs **locally inside the user's mailbox**, reads the
**content, sender, and links of an email together**, and warns the user about likely
phishing — **without sending any email data to a server**. It is delivered first as a
browser extension and later as native Workspace/Office add-ons, with a thin cloud
backend that never touches email content.

> This folder is the canonical context for the project. Drop these files into any AI
> model or hand them to a collaborator to bring them fully up to speed.

## The one rule that governs every decision

> **Precision is the product. The tool must be invisible when mail is safe.**

A phishing tool that flags legitimate mail trains the user to ignore it, and then it is
worse than nothing. We would rather miss a borderline case than annoy the user on a safe
one. Every architectural and engineering choice is judged against this.

## The full vision, built in phases

The architecture is **not** scoped down to an MVP. The full platform — browser
extension, enterprise native add-ons, ML, Active Shield, Deep Scan, admin dashboards,
MSP console, and a detection SDK — is all documented here. What changes by phase is the
**order of implementation**, not the ambition.

| Phase | Name | Headline deliverable |
| :-- | :-- | :-- |
| **P0** | Precision Foundation | Pure core engine + proof it doesn't cry wolf |
| **P1** | MVP | Gmail extension, Free tier, on-device, OTA-resilient |
| **P2** | Pro + Pilot | ML classifier, Active Shield, Deep Scan, billing; beachhead pilot |
| **P3** | Multi-provider + B2B | Zoho/Outlook/Firefox, Business Lite admin dashboard |
| **P4** | Enterprise + Platform | Native API add-ons, Brand AI, fleet mgmt, MSP console, SDK |

**Exit gate rule:** do not start a phase until the previous phase's exit criterion
(defined in `roadmap.md`) is met. In particular, nothing past P0 ships until the
precision bar is hit.

## Document index

| File | What it holds |
| :-- | :-- |
| `product.md` | Problem, market gap, segments, positioning, what we are / are not |
| `prd.md` | Every feature, functional + non-functional requirements, phase-tagged |
| `architecture.md` | Full system architecture, the broad diagram, data flow |
| `detection.md` | The detection engine: trust gate → rules → ML → scorer (the brain) |
| `dom-resilience.md` | Self-healing extraction (browser) + native API path (enterprise) |
| `schema.md` | TypeScript types + full Supabase schema, phase-tagged |
| `design.md` | UI/UX: banners, badges, Active Shield, dashboard, "silent when safe" |
| `roadmap.md` | Phased implementation plan + GTM + pricing + revenue model |
| `AGENTS.md` | Hard rules for any human or AI agent writing code |

## Honesty notes (so the docs stay credible)

- We make **no patent or IP-moat claims**. There is visible prior art for visual phishing
  detection and credential interception.
- We make **no absolute legal guarantees**. The local-only design is privacy-by-design
  and reduces data exposure; it is not a substitute for legal advice or a compliance
  certification.
- Revenue figures in `roadmap.md` are **targets/hypotheses to validate**, not promises.
- Our detection claim is narrow and provable: **better than the generic native filter on
  a specific, tuned class of threats** — not "better than Microsoft/Google in general."
