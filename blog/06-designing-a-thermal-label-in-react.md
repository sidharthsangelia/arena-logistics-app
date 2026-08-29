# 06. Designing a 4x6 thermal label in React

**Kind:** design decision · **Tier:** 1 · **Est. length:** 1400 words · standalone

## Hook

An invoice is read once, carefully, by someone sitting down. A label is read in a
fraction of a second by a person holding a box, and by a scanner that gets one
pass at it. Every design rule inverts.

## Thesis

Rendering a document to PDF from React is a solved problem. Rendering an
*artefact* is not, because the constraints come from the printer and the reader,
not from the layout engine, and most of them are invisible until you print one.

## Outline

1. Structure from rules, not whitespace. The invoice separates sections with air,
   which is right for a page somebody studies. The label uses a hairline box
   around each block, because that is what lets a warehouse hand find the
   delivery address without reading anything. The same designer making opposite
   choices on purpose.
2. Nothing is grey. Thermal printers have one ink and no halftone worth the name,
   so a grey label prints as a muddy black one. Pure black on pure white, and
   hierarchy carried by size and weight alone, in exactly four steps.
3. The 4x6 is the artwork, A4 is a carrier for it. The label body is a fixed
   288 x 432pt block, which is four by six inches exactly. The thermal page *is*
   that block. The A4 page places the same block at the top left of a sheet. No
   responsive layout, no second stylesheet, so a barcode printed on A4 is
   geometrically identical to one printed on a roll.
4. Fonts: built-ins only, no `Font.register`. A background job that fetches a font
   is a background job with a network dependency it does not need.
5. Which is why money reads `Rs 1,234.00`. The built-in fonts have no glyph for
   the rupee sign, and it prints as a blank box, on a cash-on-delivery label,
   which is the single worst place on the page for a blank box.
6. Code 128 by hand. Why the barcode is laid out rather than rasterised, why an
   over-long payload is allowed to overflow rather than silently print
   unscannable hairlines, and why the encoder rejects characters it cannot encode
   instead of dropping them.
7. Why render our own label at all when the courier already gives us one. Filing
   both, and what each is for.
8. The react-pdf traps worth a section: it swallows a bad image silently, it
   silently drops content when a page is too full, and a data URI logo is the
   only version you can trust in a job with no request context.

## Code

- `lib/labels/awb/AwbLabelDocument.tsx` (module header is the article)
- `lib/labels/barcode.ts`
- `lib/labels/awb/filing.ts`, `lib/labels/awb/render.tsx`
- `lib/invoices/tax/pdf/TaxInvoiceDocument.tsx` for the deliberate contrast
- Sample PDFs in the repo root

## Assets

Publish the four sample labels (prepaid/COD by thermal/A4) as images. This post
is visual and will underperform without them.
