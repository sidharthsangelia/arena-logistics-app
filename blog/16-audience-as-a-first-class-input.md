# 16. Shipping the buying price to the customer: audience as a first-class input

**Kind:** design decision · **Tier:** 3 · **Est. length:** 1000 words

## Hook

The same generator produces two spreadsheets from the same data. One goes to a
customer. The other contains your margin on every lane. They differ by one
enum, and that enum is the most dangerous parameter in the system.

## Thesis

When one code path can emit either an internal document or an external one, the
audience is not a formatting option. It is a security parameter, and it should be
typed, defaulted safely, gated at the route, and visible in the output itself.

## Outline

1. The feature: an Excel rate card built from a stored rate matrix, on demand, for
   a customer or for internal use.
2. What the internal variant contains that the customer one must not.
3. The mitigations, and which one actually carries the weight: the route is
   behind the money role in middleware *and* re-checked in the page, because
   building a rate card sets the markup on a document a customer receives.
4. Making the audience visible in the artefact. An internal workbook should look
   internal, so nobody forwards one by accident.
5. Why exceljs and not xlsx here. Styling, column widths, merged headers and
   number formats are the deliverable, and one of the two libraries can produce
   them.
6. Layout lessons from generating spreadsheets nobody will edit but everybody
   will judge. Row heights cannot be auto-measured for wrapped text, so a fixed
   height silently clipped the second line. Empty columns read as "we cannot ship
   there" rather than "we have no data".
7. Validity dates and terms as legal surface. A validity date on a quotation is a
   commitment, so it must not silently differ between the document and the record
   behind it, and the terms block needs sign-off before the feature ships.
8. Generalise: every "export" feature is a data egress feature. List the questions
   to ask before building one.

## Code

- `lib/rateSweep/excel/` (`spec.ts`, `workbook.ts`)
- `lib/rateQuotations/`, `app/api/rate-sweeps/[id]/export/`
- `proxy.ts`, the money-route matcher

## Overlap

Sits on top of the rate sweep, which is already published. Frame it as a
downstream product problem, not as sweep architecture.
