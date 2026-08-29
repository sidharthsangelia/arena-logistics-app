# Blog backlog

Technical article topics mined from the Arena Cargo Logistics codebase.

Each file is a **brief**, not a draft: working title, the hook, the thesis, an
outline, the code that backs it, and what still needs deciding before writing.

Already published: rate sweep architecture and its learnings. Topics that
overlap with it are flagged.

## Ground rules (decided)

**Anonymised.** No supplier is named in article prose. Logistics vendors become
"the vendor" or Vendor A/B/C. Post 05 goes further and recasts the industry
itself, since freight reselling identifies this business in one search.

Two carve-outs, both judgment calls, both easy to flip:

- Global carriers (DHL, FedEx, UPS) stay named. They identify no supplier
  relationship, and post 04's whole point is that payload shape varies by
  carrier family.
- Infrastructure SaaS (the auth provider, the payment gateway, the durable
  execution platform, the email API) stays named. Naming your stack is normal
  engineering writing and reveals nothing commercial.

**Standalone, 900 to 1400 words.** No series, no reading order, no cross-post
dependencies. Four briefs were over budget and now carry a `Trim to fit`
section saying exactly what to cut. Post 09 splits into two.

**File paths in the `Code` sections are internal pointers**, not publishable
text. Snippets get extracted and cleaned before they go in an article.

## Tiers

**Tier 1** is where this codebase is genuinely unusual and the post would be
hard for anyone else to write. Start here.

| # | Topic | Kind |
|---|---|---|
| 01 | Invoice numbering: why a Postgres sequence is the wrong tool for a tax document | design decision |
| 02 | Reconciling money to the paisa: five invariants and a residual you hide on purpose | design decision |
| 03 | Three layers of idempotency, because the expensive mistake is a second parcel | architecture |
| 04 | The allowlist that made every booking impossible | failure |
| 05 | A permission list masquerading as a safety net: leaking your supplier's brand | failure |
| 06 | Designing a 4x6 thermal label in React | design decision |

**Tier 2** is strong, generalisable, and quicker to write.

| # | Topic | Kind |
|---|---|---|
| 07 | One adapter contract, three families, thirteen vendors | architecture |
| 08 | Classify failures by what you will do, not by what they say | design decision |
| 09 | Multi-tenancy where one facet is a security boundary and one is not | architecture |
| 10 | Webhooks are the only place money moves | design decision |
| 11 | One feed, two meanings: the same tracking event is not the same fact | failure |
| 12 | Shipment numbers that do not leak how small you are | design decision |
| 13 | Events as domain facts, not job instructions | architecture |
| 19 | A server action is a public endpoint | architecture |

**Tier 3** is good filler and audience-broadening.

| # | Topic | Kind |
|---|---|---|
| 14 | Skeletons that only cover the part that is actually loading | technical learning |
| 15 | The in-memory rate limiter whose comment was the opposite of the truth | failure |
| 16 | Shipping the buying price to the customer: audience as a first-class input | design decision |
| 17 | Every non-obvious line carries its counterfactual | technical learning |
| 18 | Building on a framework version newer than the model's training data | technical learning |

## Open questions before writing

See `_open-questions.md`.
