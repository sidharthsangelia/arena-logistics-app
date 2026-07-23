# Production Readiness Report — Tenant (Customer) Dashboard

**Scope:** Everything under `app/(tenant)/**` plus the server actions, services and
libs it depends on (rate calculator, booking, wallet/payments, quotes, clients,
tracking, document vault). The Arena/internal dashboard is explicitly out of scope
for this pass.

**Date:** 2026-07-23
**Verdict:** 🔴 **Not launch-ready yet.** The engineering quality is genuinely high —
atomic wallet debits, race-safe shipment numbering, disciplined vendor-cost masking,
clean TypeScript (0 `tsc` errors). But there are **two must-fix data/money issues**
(one cross-org data leak, one price-tampering surface) that block a public launch,
plus a handful of broken links and access-control gaps. None are architectural;
all are fixable in days, not weeks.

---

## Scorecard

| Parameter | Score | Notes |
|---|---|---|
| **Data isolation / multi-tenancy** | 4 / 10 | Mostly correct, but one confirmed cross-org IDOR (client detail) undermines the whole "nothing leaks" guarantee. |
| **Payment / money correctness** | 6 / 10 | Wallet debit + Razorpay flow are excellent; let down by trusting a client-supplied price at booking. |
| **Vendor masking (carrier branding)** | 9 / 10 | Consistently gated behind `useIsArenaOrg()` on every surface. One residual risk: raw vendor `productName`. |
| **Logic / correctness** | 8 / 10 | Pricing math is exemplary and well-tested-by-design. Chargeable weight + markup are single-sourced. |
| **UI / UX** | 7 / 10 | Polished, consistent shadcn UI. Broken/mis-pointed links and a few dead-ends hurt trust. |
| **Performance / optimisation** | 7 / 10 | Proper pagination, parallel queries, promise-dedup on detail pages. No obvious N+1. Room for caching. |
| **Code quality / maintainability** | 9 / 10 | Outstanding inline documentation, clear separation of concerns, discriminated unions, defensive coercion. |
| **Error handling / observability** | 8 / 10 | Sentry on server actions, structured error returns, graceful partial-failure surfacing. |
| **Overall** | **6.5 / 10** | Strong foundation, blocked by a small number of high-severity issues. |

---

## 🔴 CRITICAL — must fix before any real user touches this

- [ ] **C1 — Cross-org data leak (IDOR) on the client detail page.**
  [app/(tenant)/clients/[id]/page.tsx:70-108](app/(tenant)/clients/[id]/page.tsx#L70-L108)
  `fetchClient()` queries `prisma.client.findFirst({ where: { id, deletedAt: null } })`
  with **no `orgId` scoping** and the page component does no ownership check. Any
  authenticated tenant can open `/clients/<any-id>` and read **another org's** client:
  company name, contact name/email/phone, addresses, **KYC document file URLs**
  (UploadThing links are publicly fetchable once known), and full quote history
  (including `vendorName`). This directly violates the "nothing leaks" requirement.
  **Fix:** resolve the caller's org and scope the query — the codebase already has the
  exact helper: `assertOrgOwnsClient(orgId, clientId)` in
  [actions/book/getOrgs.ts:21-29](actions/book/getOrgs.ts#L21-L29). Add
  `orgId: org.id` to the `where`, then `notFound()` on miss.

- [ ] **C2 — Booking trusts a client-supplied price (price tampering / under-charging).**
  [actions/book/createShipment.action.ts:265](actions/book/createShipment.action.ts#L265)
  → [:433](actions/book/createShipment.action.ts#L433) → [:613](actions/book/createShipment.action.ts#L613)
  The wallet is debited for `Number(data.selectedService.price)` (and `data.firstMile.price`),
  both of which come **from the client** (`BookingFormData`, round-tripped through
  Zustand/draft). The server never re-prices or verifies the quote. A crafted payload
  can book a real shipment for ₹1 while the wallet is debited ₹1 and `quotedTotal`/
  `chargesSnapshot` are persisted at the tampered value. `preflight()` only checks the
  price is *finite*, not that it's *correct*.
  **Fix (pick one):**
  1. Re-price server-side at booking by re-running `getRates` for the chosen vendor and
     validating the submitted total is within tolerance of a fresh quote, **or**
  2. Issue a signed/HMAC'd quote token from `getRatesAction` and require it back at
     booking (server recomputes the price from the token, ignores the client number).
  Option 2 is more robust against live rate drift.

- [ ] **C3 — `updateCarrierAwb` has broken access control.**
  [actions/book/carrierTrackingDetails.action.ts:16-40](actions/book/carrierTrackingDetails.action.ts#L16-L40)
  This is an Arena-ops action (used by `components/booking/arena/CarrierTrackingPanel.tsx`)
  but it only checks `if (!userId)` — it does **not** verify Arena staff, and fetches the
  shipment by `id` with **no org scoping**. Its sibling ops action
  [companySideBookings.action.ts:15-20](actions/book/companySideBookings.action.ts#L15-L20)
  correctly uses `assertArenaStaff()`. As written, any authenticated user can set/overwrite
  the MAWB/HAWB/carrier/tracking URL on **any** shipment by guessing an id.
  **Fix:** call `assertArenaStaff()` (same pattern as the sibling) and/or scope by org.
  Audit every action under `actions/book/` and `components/booking/arena/` for the same gap.

---

## 🟠 HIGH — fix before launch

- [x] **H1 — "Apply now" (Business Associate) is a dead link → 404.** ✅ FIXED — the
  broken promo card was removed from the dashboard (there is no BA application flow yet).
  A `TODO` marks where to restore a CTA once a real apply flow exists.

- [x] **H2 — Expiring-documents alert links to the wrong page.** ✅ FIXED — the "Review
  documents" link now points to `/document-vault` instead of `/quotes`.

- [ ] **H3 — Confirm vendor `productName` can never contain a sourcing-vendor brand.**
  Masking correctly hides `vendorName` behind `useIsArenaOrg()` everywhere
  (`RateResultCard`, `QuoteSheet`, `ComparePanel`, `QuoteDocument*`), **but** `productName`
  is passed through raw from the vendor API
  ([shipmozo.adapter.ts:220](lib/rate-adapters/vendors/shipmozo/shipmozo.adapter.ts#L220),
  [skart.adapter.ts:118](lib/rate-adapters/vendors/skart/skart.adapter.ts#L118)) and is shown
  to customers. If Shipmozo/sKart ever return a `name`/`product_name` string that includes
  their own brand, it leaks. **Fix:** sanitise `productName` in the adapter (whitelist the
  carrier tokens you actually surface, or strip known vendor names) rather than trusting the
  upstream string.

---

## 🟡 MEDIUM — should fix soon

- [x] **M1 — Leftover debug logging in a rate adapter.**
  [shipmozo.adapter.ts:164](lib/rate-adapters/vendors/shipmozo/shipmozo.adapter.ts#L164) has a
  `TODO … remove this log` on the live-payload path. Vendor payloads can contain cost data —
  don't ship raw vendor logging to production.

- [x] **M2 — `console.log` in registries runs on every server boot.**
  [rate-adapters/core/registry.ts:36](lib/rate-adapters/core/registry.ts#L36) and
  [tracking-adapters/core/tracking.registry.ts:31](lib/tracking-adapters/core/tracking.registry.ts#L31).
  Noise; gate behind a debug flag.

- [x] **M3 — `next.config.ts` uses the deprecated `images.domains`.**
  [next.config.ts](next.config.ts#L8) — on Next 16 this is deprecated in favour of
  `images.remotePatterns`. Per `AGENTS.md`, verify against the bundled Next 16 docs before it
  starts warning/breaking on build.

- [x] **M4 — No org-level rate limiting on `getRatesAction`.**
  Every call fans out to live vendor APIs (Shipmozo/sKart/Aramex). A tenant hammering the
  calculator drives real upstream cost/quota. Add throttling/debounce server-side (the form
  likely debounces client-side, but that's not a control).

- [x] **M5 — Wallet "low balance" threshold is a magic number.**
  [app/(tenant)/page.tsx:358](app/(tenant)/page.tsx#L358) hardcodes `< 5000`. Fine for launch,
  but make it configurable per org before BAs with large float balances complain.

---

## 🟢 LOW / polish

- [ ] **L1 — Many `react-hooks/exhaustive-deps` suppressions** across booking steps
  (`ServiceStep`, `KycStep`, `SenderPickupStep`, `FirstMileStep`, etc.). Individually
  defensible, but each is a latent stale-closure bug. Audit before adding new effect logic.
  *(Deliberately NOT touched in the polish pass — each needs its own review; blind removal
  risks introducing render loops.)*
- [x] **L2 — Carrier logos use `<img>`** ✅ FIXED — both usages
  ([RateResultCard](components/rate-calculator/RateResultCard.tsx),
  [RateOptionPicker](components/booking/RateOptionPicker.tsx)) now use `next/image` with
  intrinsic dimensions carried by [carrierLogo()](lib/carrierLogo.ts). This matters more than
  it looks: the Arena fallback logo was a **670KB** PNG being rendered at 16px tall.
- [x] **L3 — `.DS_Store` files** ✅ VERIFIED — already in `.gitignore` and none are tracked
  in git (the on-disk files are untracked local cruft).
- [x] **L4 — Dashboard blocked on ~9 queries with no streaming** ✅ FIXED — see the
  "Loading states & caching" section below. Rebuilt into independent Suspense-streamed
  sections; the double org fetch is deduped.

---

## Loading states, streaming & caching (this pass)

**Granular streaming (data shows the moment it arrives):**
- The **dashboard** ([app/(tenant)/page.tsx](app/(tenant)/page.tsx)) no longer blocks on a
  single 9-query `Promise.all`. The shell + header render instantly; **wallet balance shows
  immediately** (it arrives with the org fetch); and Alerts, Stat cards, Recent shipments,
  Wallet activity, Quotes, Clients, and the Onboarding checklist each stream in behind their
  own `<Suspense>` boundary with a right-sized skeleton, so no section waits on any other.
- Added `loading.tsx` skeletons for the two blocking server pages that lacked them:
  [shipments/[id]](app/(tenant)/shipments/[id]/loading.tsx) and
  [settings/profile](app/(tenant)/settings/profile/loading.tsx).

**Caching, by data sensitivity (the explicit ask):**
- **NO cache — real-time (money / status):** wallet balance & transactions, shipment
  status/counts, quotes, clients, org markup. The dashboard reads all of these live every
  load. The wallet page already client-fetches fresh. *Left uncached on purpose.*
- **Per-request dedup only (mutable but shared in one render):** new
  [getCurrentOrg()](utils/tenant.ts) uses React `cache` so the layout and the page share
  **one** org+wallet query instead of two — with **zero** staleness, because React `cache`
  only memoises within a single render pass. This is the right tool for the mutable
  `balance`/`markupPercent` row (never `unstable_cache`, which would serve it stale).
- **Cross-request cache — immutable reference data:** new
  [lib/data/airports.ts](lib/data/airports.ts) caches airport lookups (24h, tagged
  `airports`). Airports have **zero** mutation sites in the codebase, so this is always safe.
  *(Note: the tenant domestic calculator now uses pincode-based Shipmozo, so this is a
  low-traffic/legacy path — cached for correctness, not because it's hot.)*
- Pre-existing precedent confirms this philosophy: [getDbOrgId()](utils/tenant.ts) already
  cross-request caches only the **immutable** `org.id`, never financial fields.

**Over-fetching / N+1 sweep:** No genuine N+1 found. The only DB-`await`-in-loop sites are a
chunked bulk `createMany` (correct batching) and the bounded Razorpay poll loop (6 attempts).
`Promise.all` is used widely already. List pages paginate. Layout does no per-page DB query
(the profile banner is client-side via Clerk).

**Next 16 note:** fixing the `revalidateTag` call surfaced a real breaking change — Next 16
requires the two-arg form `revalidateTag(tag, profile)`; the old single-arg call only
compiled because it was hidden behind an untyped `require()`. Now corrected to
`revalidateTag(..., "max")`.

---

## Deep-dive: the three flows you called out

### Rate calculator — ✅ solid
- Chargeable-weight math is single-sourced, documented, and uses the correct
  "per-package max, then sum" method that never under-charges
  ([lib/pricing/chargeableWeight.ts](lib/pricing/chargeableWeight.ts)).
- Markup is a single shared path for both the standalone calculator and booking
  ([lib/pricing/markup.ts](lib/pricing/markup.ts)); uniform scaling keeps the breakdown
  internally consistent and never emits a vendor-cost line. Default markup falls back to
  30% when the org has none ([rates.action.ts:95](actions/rates.action.ts#L95)).
- Fan-out uses `Promise.allSettled`; partial vendor failures surface in `vendorErrors`
  instead of failing the whole request ([rate-calculator.service.ts:75](lib/services/rate-calculator.service.ts#L75)).
- **Watch item:** H3 (raw `productName`) and M4 (no rate limiting).

### Booking / create shipment — ✅ mostly excellent, ⚠️ one money hole
- Fully atomic `$transaction`: addresses → shipment (PENDING_PAYMENT) → packages →
  invoice doc → status event → **atomic wallet debit** → flip to BOOKED. A failed debit
  rolls everything back — no orphaned rows. Shipment number via a Postgres sequence
  (`nextval` is atomic; gaps are accepted by design).
- Wallet debit is genuinely race-safe: a single `UPDATE … WHERE balance >= amount RETURNING`
  ([utils/wallet/service.ts:64-80](utils/wallet/service.ts#L64-L80)) — no TOCTOU.
- KYC is verified against the DB (not the form payload), branching client vs org vault.
- `skipPayment` orgs correctly bypass the debit and flag `paymentDeferred`.
- **Blocker:** C2 — the amount debited is a client-supplied price.

### Wallet / payments (Razorpay) — ✅ solid
- The **webhook is the source of truth**, not the client callback
  ([actions/wallet/verifyTopUpPayment.action.ts](actions/wallet/verifyTopUpPayment.action.ts)).
- Signatures verified with `crypto.timingSafeEqual`; webhook credit is **idempotent**
  (no-ops once `status === "SUCCESS"`, [app/api/webhooks/razorpay/route.ts:109](app/api/webhooks/razorpay/route.ts#L109)).
- Credit happens inside a DB transaction with an atomic balance update.

---

## Immediate action plan (in order)

1. [ ] **C1** — Scope `fetchClient` by org (1-line fix + `notFound`). *Ship today.*
2. [ ] **C3** — Add `assertArenaStaff()` to `updateCarrierAwb`; audit all `actions/book/*`
   and arena components for authz gaps. *This day.*
3. [ ] **C2** — Design + implement server-side re-pricing or a signed quote token for booking.
   *This is the one real design task — 1-2 days.*
4. [ ] **H1, H2** — Fix the two dashboard links. *Minutes.*
5. [ ] **H3, M1, M2** — Sanitise `productName`, remove vendor debug logging. *Hours.*
6. [ ] Do a focused **broken-access-control sweep**: for every server action and every
   dynamic route (`[id]`) under `(tenant)`, confirm the query is scoped to the caller's org.
   C1 proves the pattern isn't universally applied.
7. [ ] Run `/security-review` on the branch once C1-C3 are in, then `npm run build` to confirm
   a clean production build (typecheck already passes clean).

---

*Report covers the tenant surface only. Recommend a second pass on `app/(arena)/**`
(internal dashboard) and the public `/track` route before the same launch, since the
BA→client billing relationship spans both.*
