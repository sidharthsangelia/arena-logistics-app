# 17. Every non-obvious line carries its counterfactual

**Kind:** technical learning · **Tier:** 3 · **Est. length:** 1200 words · standalone

## Hook

Pick any file in this repository and read the header. It will not tell you what
the code does. It will tell you what the obvious alternative was and why it was
rejected, usually with the specific damage that alternative caused.

## Thesis

"Comments explain why, not what" is advice everyone agrees with and almost nobody
can act on, because "why" is too vague to be a habit. A concrete rule works
better: **state the alternative you did not take, and the consequence.** That is
checkable, it is falsifiable by the next reader, and it is exactly the
information a code reviewer or an AI agent is missing.

## Outline

1. The pattern, with three real examples of increasing weight:
   - a sequence would burn numbers on rollback, and a regulator counts them
   - throwing on duplicate registration turned HMR into a production 500
   - an allowlist of eight product names refused every booking a customer could
     make
2. The structural form these headers take, which is worth copying literally: what
   this file is, why it exists at all, what it deliberately does not do, and the
   landmine section for things that look like tidy-ups and are not.
3. The landmine section deserves its own argument. `"TAX_INVOICE"` is a magic
   string that looks like it wants renaming, and renaming it re-issues invoice
   numbers customers already hold. A comment is the only thing standing between
   that string and a well-intentioned refactor.
4. Comments that record measurements, not beliefs. One header in this repo opens
   by saying a previous version of *itself* was wrong about the concurrency
   behaviour, and replaces the belief with numbers from an actual run. Comments
   can be corrected in place, and saying so out loud is what makes them
   trustworthy.
5. The cost, honestly. These headers are long, they go stale, and a stale one is
   actively harmful (see the rate limiter post). Mitigations: put them where the
   decision lives, not in a wiki; write rules and counterfactuals rather than
   emergent properties; and treat correcting one as a normal commit.
6. Why this matters more now. An agent reading your codebase has the same problem
   as a new hire and none of the hallway. Design decisions that live only in your
   head get silently reverted.
7. The complement: decision documents in the repo root, one per subsystem, with
   numbered decisions the code can cite by number. Code points at the decision,
   the decision explains the constraint.

## Code

- `lib/invoices/tax/numbering.ts`, `lib/rate-adapters/core/errors.ts`,
  `lib/labels/awb/AwbLabelDocument.tsx` as exemplars
- `carrierBranding.md`, `invoicingSystem.md`, `bookingFlow.md` as the doc layer
- `AGENTS.md`

## Note

This is the most likely of the batch to do numbers on dev.to, and the least
likely to teach anyone anything they can use without the concrete examples. Lead
with the examples.
