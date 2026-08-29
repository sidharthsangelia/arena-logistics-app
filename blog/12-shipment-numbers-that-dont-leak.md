# 12. Shipment numbers that do not leak how small you are

**Kind:** design decision · **Tier:** 2 · **Est. length:** 900 words

## Hook

`SHP-2026-00042` printed on a label tells your customer you have shipped
forty-one things. It tells your customer's competitor the same thing, and it
tells anyone who wants to try `00043`.

## Thesis

A public identifier has four jobs and they conflict: be unique, be readable
aloud, not leak volume, and not be guessable. You cannot get all four from a
sequence, and you do not need a UUID to get them.

## Outline

1. What the raw sequence value leaked: platform-wide volume across every tenant,
   and trivially guessable neighbours.
2. The format: prefix, then `YYMMDD`, then a Sqids-encoded tail. Twelve
   characters.
3. The sequence still drives generation. Only the *encoding* changed. This is the
   cheap version of the fix and worth saying, because a lot of people reach for a
   schema change here.
4. Constraint one, it gets read aloud. No separators, all uppercase, and it
   survives being dictated over a phone call or typed into a chat.
5. Constraint two, no ambiguous glyphs. The Sqids alphabet is digits only,
   precisely so there is no "is that an O or a zero".
6. Constraint three, the date is deliberately *not* encoded. Support can tell
   when something was booked without a lookup, and it partitions the number space
   so the encoded tail stays short.
7. Constraint four, minimum encoded length. Small sequence values encode to one
   or two digits and give away how new the platform is, so pad.
8. The honesty section. Sqids is obfuscation, not encryption. Anyone with the
   alphabet reverses it. Never treat the number as a secret or an authorisation
   token, and always scope lookups by tenant. This is the paragraph that makes
   the post trustworthy instead of a growth-hack piece.
9. Two irreversibility notes worth stealing: raising or lowering the pad length is
   safe because old numbers still decode, but changing the alphabet re-maps every
   value and breaks decoding for everything already issued.
10. Timezone in an identifier. The date segment is stamped in the business's own
    timezone, so a 01:30 local booking reads as that calendar day and does not
    slip because the server runs in UTC.

## Code

- `utils/shipmentNumber.encoding.ts` (module header is the article)
- `utils/shipmentNumber.ts`
- `utils/shipmentNumber.encoding.test.ts`
