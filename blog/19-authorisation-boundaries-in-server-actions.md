# 19. A server action is a public endpoint

**Kind:** architecture · **Tier:** 2 · **Est. length:** 1000 words · standalone

## Hook

It looks like a function call. You import it, you call it, your editor
autocompletes its arguments. It is an HTTP endpoint that anyone on the internet
can POST to, with whatever arguments they like.

## Thesis

Server actions collapse the visual distance between client and server, and every
authorisation mistake in this codebase came from that collapse. The rule that
fixes it is small: **never accept an identity from a caller you would not accept
it from over curl.**

## Outline

1. The org-id-shaped hole. An action that takes `orgId` as a parameter is an
   action that will read another tenant's data the first time someone edits the
   request body. So the resolver derives the org from the session and the
   parameter does not exist.
2. One resolver, both sides. A single function answers "whose data am I looking
   at", returning either a staff scope or a tenant scope, so no component needs
   to know which dashboard it is mounted in and no caller can read the wrong one.
   It returns null rather than throwing when there is no answer (signed out,
   mid-onboarding), because rendering nothing is the correct outcome.
3. Route matchers are a courtesy, not a control. Middleware redirects people away
   from pages that would only tell them off. It is documented as an optimistic
   check, and a direct POST never passes through it. So the page re-checks on
   render and every mutating action checks for itself.
4. One file owns the definition of the privileged role, so the day it needs to
   split from the identity provider's built-in admin role, the change lands
   once instead of in every page that shows a currency figure.
5. Defining the privilege precisely, which is the part most teams skip. Here
   "money" means the business's own commercial position: revenue, margin, markup,
   balances, the ledger. It deliberately does not mean a shipment's quoted value,
   which ops need for customs paperwork. A privilege you cannot state in one
   sentence will be checked inconsistently.
6. Never derive a security decision from a session claim you also treat as a
   cache. Flags mirrored into the identity provider are for routing and UI
   gating. The database stays the authority.
7. Which is why that mirroring is allowed to fail non-fatally, and why only
   non-sensitive booleans go into publicly readable metadata. Never profile or
   document data.
8. A short audit checklist for an existing codebase.

## Code

- `lib/notifications/audience.ts`
- `utils/arena-auth.ts`, `proxy.ts`
- `utils/clerk/syncProfileMetadata.ts`, `lib/org-type.server.ts`

## Origin

Split out of brief 09, which was two posts. 09 keeps the caching argument.
