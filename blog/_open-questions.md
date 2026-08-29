# Open questions before drafting

Q1, Q4 and Q5 are **resolved**. See "Ground rules" in `README.md`.

## Q1. Disclosure: can vendors be named? RESOLVED: anonymise everything

Several of the strongest posts describe real suppliers (Shipmozo, sKart,
ShipGlobal, Aramex, SpeedoPost) and, in one case, a commercial arrangement about
white-labelling their brand.

Three options:

- **Name them.** Most credible and most searchable. Post 05 becomes awkward: it
  says in public that you mask a named supplier's brand from customers, and that
  you hold written permission from some and not others.
- **Anonymise to Vendor A/B/C.** Costs almost nothing on posts 04, 08, 11. Costs
  a lot on 05, which is partly *about* the difference between suppliers.
- **Split.** Name vendors on the neutral integration posts (04, 08, 11), and
  anonymise post 05 entirely, including the product names in the regex examples.

**Decided: anonymise everything.** Suppliers are anonymised in prose across 04,
05, 08, 11 and 16. Post 05 additionally recasts the industry. Carve-outs for
global carriers and infrastructure SaaS are in the README.

## Q2. Can incident specifics be published?

Post 03 and post 04 are much better with dates, counts and rupee consequences
("on 20 Aug it fired at 158 minutes, one minute after the estimate ran out").
Is publishing operational incident detail acceptable, or should it be softened to
"one run", "a customer"?

## Q3. Is Arena named, or is this anonymous engineering writing?

Naming the company makes it marketing as well as writing, which changes what post
05 and post 16 can say. Anonymous makes it freer and less useful to the business.

## Q4. Article length and cadence. RESOLVED: standalone, 900 to 1400 words

**Decided: all standalone, 900 to 1400 words.** Briefs 02, 03, 07 and 09 were
over budget and now carry a `Trim to fit` section. Post 09 splits: the cache and
auth argument is the post, and authorisation boundaries in server actions becomes
a new topic (add as 19).

## Q5. Series or standalone? RESOLVED: standalone

**Decided: standalone.** Each post must stand without the others. Where two
briefs share a lemma (idempotency appears in 03, 10 and 13), the shared idea gets
restated compactly in each rather than cross-referenced.

## Q6. Code snippets: real or reduced?

The real code carries repo-specific types and imports. Reduced snippets read
better but invite "that is not how it really works" replies. Suggest: real code
for the small decisive functions (numbering, the regex rules, `amountSign`),
reduced pseudocode for the orchestration.
