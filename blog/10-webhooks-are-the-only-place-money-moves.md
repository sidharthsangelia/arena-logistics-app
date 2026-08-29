# 10. Webhooks are the only place money moves

**Kind:** design decision · **Tier:** 2 · **Est. length:** 1100 words

## Hook

The client says the payment succeeded. The client is not a source of truth about
money. There is exactly one code path in this application that credits a wallet,
and it is a webhook handler.

## Thesis

Payment integrations go wrong in the gap between "the user saw a success screen"
and "our database believes it". Closing that gap is not about better error
handling, it is about having only one writer.

## Outline

1. The rule: one crediting path, no exceptions, not even for the happy case the
   browser already confirmed.
2. Signature verification on the *raw body*. The provider signs the exact bytes
   sent, so parsing to JSON and re-serialising breaks verification the moment key
   order or whitespace differs. This catches people constantly, because most
   framework body parsers are on by default.
3. Idempotency inside the same transaction as the credit. Providers retry on
   non-2xx *and* can legitimately deliver the same event twice. Checking the
   transaction status before crediting, in the same transaction, is the whole
   mechanism.
4. Fail loud, not silent. If no matching pending transaction is found, that means
   money moved and the database does not know why. That needs manual
   reconciliation, not a swallowed log line.
5. Return 500 on any processing failure, deliberately, so the provider retries
   with backoff instead of you losing the event to your own 200.
6. Node runtime, not edge, when you need `crypto` and a database client. Say it,
   because the default is changing under everyone.
7. Three other webhooks in the same codebase, three different verification
   stories, and what to do when a vendor publishes no signing secret at all: put
   your own token in the path, which is transparent to them, and fall back to
   match-only, where a payload is acted on only if it resolves to a real record
   of yours.
8. Discovering the real payload shape. One provider's documented shape and its
   live shape disagree on whether tags are an array or an object and where click
   data is nested. Type from live payload inspection, and say so in the comment.

## Code

- `app/api/webhooks/razorpay/route.ts` (the numbered robustness comment is the outline)
- `app/api/webhooks/clerk/route.ts`, `app/api/webhooks/resend/route.ts`
- `app/api/webhooks/shipmozo/[token]/route.ts`
- `utils/wallet/service.ts`
