# 05. A permission list masquerading as a safety net

**Kind:** failure · **Tier:** 1 · **Est. length:** 1300 words · standalone

## Hook

The table was called a brand rule table. It held two rows. There were four
vendors. The two missing rows were not an oversight, they were the design: the
table listed who we were *allowed* to rebrand. Which meant everyone we were not
allowed to rebrand passed through with their name intact, straight onto a
customer's quote.

## Thesis

A lookup table answers exactly one question. If you find yourself using it to
answer two, the absent rows will silently mean the wrong thing. Split the
questions, and make the safety question the one with total coverage.

## Outline

1. The domain problem. You resell freight capacity. The customer must not be able
   to read the supplier's name off their quote, search for it, and buy direct.
2. The two questions that got conflated:
   - How is this vendor's brand spelled inside a service label? (needs a row for
     every vendor)
   - Do we hold written permission to resell their own-brand services under our
     name? (needs a row only for the ones we do)
3. The consequence, and the fact that it was *documented as an accepted
   tradeoff* before it was fixed. Worth dwelling on: a known hole with a
   paragraph explaining why it was fine is more dangerous than an unknown one,
   because the paragraph stops anyone re-examining it.
4. The restructure. Deny-list first, permission list second. Permission now
   decides *what* replaces the brand token. It no longer decides *whether* the
   token is removed.
5. The unlicensed case strips rather than swaps. Replacing the supplier's name
   with ours would close the leak and break the reseller agreement in the same
   line. So the token is removed and the rest of the label survives:
   `Foo Self International` becomes `Self International`, which names no one and
   claims nothing. There is a fallback string for the case where the label was
   nothing but the brand.
6. Two regex details that are the whole feature:
   - The pattern ends in `\w*`, not `\b`. There is no word boundary in the middle
     of a word, so `\b` matches the brand but leaves the suffix of a compound
     brand name behind.
   - The rule stores a regex *source string*, not a literal, so no shared `/g/`
     instance can carry `lastIndex` state between calls. This is a real bug class
     and almost nobody knows it.
7. Why the white-label switch is deliberately not env-gated. A missing or
   mistyped environment variable in production would fail *open* and leak the
   supplier on the revenue path. Config flags belong on things that are safe to
   have off.
8. Masking at read time, not write time. The raw supplier product name is still
   stored, because you need it to place the booking and to reconcile invoices.
   Every customer-facing surface masks on the way out. Which means every new
   surface is a new place to forget, and that is the ongoing cost of the design.

## Code

- `lib/branding/serviceName.ts`
- `lib/carrierLogo.ts` and the "why there are two lists" note
- `lib/branding/isArenaOrg.server.ts`
- `carrierBranding.md`, `utils/serviceBranding.test.ts`

## Disclosure

Fully anonymised, including the regex examples. Rewrite `sKartedge` as a generic
compound brand (`Vendra` / `Vendraedge`) and keep the point, which is about the
regex, not the vendor.

The industry must go too. "Freight reselling" identifies this business closely
enough that a reader can find the suppliers in one search. Recast the framing as
a generic reseller or marketplace: you buy capacity or inventory from named
suppliers, resell it under your own brand, and hold rebranding permission from
some of them and not others. Every technical point survives that move intact.
