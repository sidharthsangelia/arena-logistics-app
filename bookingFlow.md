# Shipment Booking Flow — Architecture & Design Decisions

This document explains how booking works in the platform: who the actors are, how pricing/markup works, how KYC and addresses are handled, and how a shipment moves from "customer fills a form" to "ops delivers it." It exists so future-us (or anyone else touching this code) doesn't have to reverse-engineer *why* the schema looks the way it does.

Payments (Razorpay) are intentionally **not** wired up yet. The wallet/ledger tables exist and are designed so Razorpay slots in later without a schema change — see [Payments](#payments-not-yet-wired-up) at the bottom.

---

## 1. Core actors

### `Org` — every account, no exceptions

Every login on the platform is an `Org`, enforced via Clerk (every user must belong to an org — this is intentional and unchanged). There is no separate "lightweight customer" account type.

An `Org` can be:
- **A solo customer** — an org-of-one, just a single person/small business booking their own shipments. Gets the default markup.
- **A Business Associate (BA)** — has a team, brings in volume, and books shipments on behalf of *their own* clients. Gets a negotiated, lower markup because they bring volume.

This was a deliberate simplification: a solo customer and a BA are **not** two different account types in the schema. They're the same `Org` model, just with `isBusinessAssociate: false` vs `true`. A solo customer doesn't lack any feature a BA has — they just don't have a team or any `Client` records under them yet. If they grow into a BA later, nothing migrates; the same row just gets the flag flipped.

**Why not split them into two models?** Because everything a solo customer needs (KYC, wallet, addresses, ability to book) is *identical in shape* to what an Org-acting-as-BA needs. Two models would mean two parallel signup flows and a painful merge the day a small customer becomes a big one. One model, one flag, avoids that entirely.

### `Client` — the end-customer a BA/Org books a shipment *for*

This already existed in the schema before this flow was designed (`Client`, scoped to `orgId`) — it wasn't invented for this feature, it was *repurposed* once we realized it already meant the right thing.

- A `Client` is the actual person/company whose goods are being shipped, when that's not the `Org` itself.
- **Clients never log in.** There's no `Client` auth, no `Client` session. Only the `Org`'s own users (the BA's team, or the solo customer themself) ever touch the platform UI.
- A BA enters and maintains their `Client`'s details, KYC docs, and addresses *on the Client's behalf*. This is intentional — the BA is the intermediary, the platform's actual relationship is with the `Org`, and the `Client` is data the `Org` manages.
- `Client` records are reusable — like an address book / CRM contact — so a BA doesn't re-enter the same client's KYC every time they book a new shipment for them.

### How "who is this shipment for" is modeled

`Shipment.clientId` is **nullable**:
- `clientId = null` → the `Org` is shipping for itself (solo customer's normal case, or a BA shipping their own goods).
- `clientId = <some Client>` → the `Org` is booking on behalf of that `Client` (the BA-for-customer case, or — equally — a solo customer occasionally booking for someone else, since nothing stops a non-BA `Org` from having `Client` records too).

There is **no separate "Shipper" or "Customer" model.** Earlier drafts of this schema invented one, but it turned out to duplicate exactly what `Org` and `Client` already represented — removed before launch to avoid two account types meaning the same thing.

---

## 2. Markup & pricing

- `Org.markupPercent` — a `Decimal` field, **default 30.000** (30%). This is what every shipment's price is built on top of the base carrier rate.
- `Org.isBusinessAssociate` — boolean, **default false**. When an ops/admin manually sets this `true` (see [Becoming a BA](#3-becoming-a-business-associate) below), `markupPercent` is lowered for that Org — e.g. to 15% — because BAs bring in volume and the platform is willing to take a smaller cut per shipment in exchange for more shipments overall.
- **Markup is fixed per Org, not negotiated per shipment or per deal.** This was a deliberate simplification to avoid the complexity of per-shipment pricing logic — every shipment booked by a given Org uses that Org's current `markupPercent`, full stop. If finer-grained pricing is ever needed, that's a future schema change, not something this version supports.
- **Markup is set by ops, not self-serve.** An `Org` cannot change its own `markupPercent` or flip `isBusinessAssociate` — that's an internal action taken from the company dashboard.

### Why `Shipment` snapshots the markup at booking time

`Shipment.markupPercentApplied` records the markup that was *actually used* for that specific shipment, copied from `Org.markupPercent` at the moment of booking — it isn't just read live from `Org` every time the shipment is displayed.

**Why this matters:** if you later renegotiate an Org's rate (e.g. they go from 30% to 15% after becoming a BA, or their BA deal changes), old shipments must **not** silently change price when redisplayed. The snapshot keeps historical invoices/records accurate regardless of what happens to the Org's rate afterward. This mirrors the same pattern already used on the existing `Quote` model (`chargesSnapshot`, `requestSnapshot`) — booking-time data is frozen, not live-computed.

---

## 3. Becoming a Business Associate

There are two ways an `Org` becomes a BA:

1. **In-platform application** — an Org applies through a form (`BaApplication` model). This creates a tracked record:
   - `status: PENDING` when submitted.
   - Shows up in an ops queue (`WHERE status = 'PENDING'`).
   - Ops reviews and either approves (`status: APPROVED`, sets `reviewedBy`, `reviewedAt`, `approvedMarkupPercent`) or rejects (`status: REJECTED`, with `reviewNotes`).
   - On approval, ops flips `Org.isBusinessAssociate = true` and updates `Org.markupPercent` to match — done together, in the same action.
   - `formData` is stored as JSON, not fixed columns, so the application form's questions can change over time without a migration.
   - **Records are never deleted** on approval or rejection — they stay as history, so you can always see who applied, when, and what was decided.

2. **Off-platform deal** — sometimes a BA relationship is negotiated outside the platform entirely (a sales conversation, an existing business relationship). In this case there's no `BaApplication` row at all — ops just flips `Org.isBusinessAssociate` and sets `markupPercent` directly from the dashboard. The `BaApplication` model is for the in-platform path only; it is **not** a required step for every BA.

### Route gating

`isBusinessAssociate` on `Org` is the single source of truth for whether an Org sees the `/clients` route in the app — this is the **only** UI difference between a normal Org and a BA. Everything else (booking flow, KYC, wallet) is identical between the two; a BA just additionally gets a place to manage their `Client` list.

`isBusinessAssociate` also directly drives `markupPercent`, so it's not just a display flag — it has real pricing consequences. For that reason:

- The **database row is always the source of truth.**
- If you want fast route-gating without a DB round-trip on every request, you can mirror this value into a Clerk session claim or org metadata as a **read cache** — but you always write to the DB first and sync to Clerk after, never the other way around. Two systems that can both be written to, for a value that affects money, will eventually drift out of sync. Don't let that happen.

---

## 4. KYC documents

`KycDocument` is a single, polymorphic table — it can belong to **either** an `Org` (shipping for itself) **or** a `Client` (Org booking on their behalf), via nullable `orgId` / `clientId` foreign keys (exactly one is set per row, enforced at the application layer, not via a DB constraint).

This single model serves both cases identically because, per an earlier decision in this build, a solo customer's KYC and a BA's Client's KYC go through **the exact same fields and flow** — same doc types (PAN, Aadhaar, GST, IEC, etc.), same upload process. The only difference is which party the docs are attached to.

### Key behavior: KYC is checked, not always re-collected

When starting a new shipment booking:
- Look up existing `KycDocument` rows for the relevant party (`Org` if booking for self, `Client` if booking on behalf of someone).
- If the required docs for that party's `companyKind` are already on file (individual: PAN + Aadhaar; company: + GST), **skip the KYC step in the booking form entirely.**
- If anything is missing, only prompt for the missing pieces — don't re-ask for documents already on file.

This is explicitly different from the **invoice**, which is *never* reused — see below.

`KycDocument` also carries `verifiedAt` / `verifiedBy` so ops can mark a document as checked, and `expiresAt` for documents that need periodic renewal (e.g. trade licenses).

> Note: the older `ClientDocument` model still exists in the schema from before this flow was built. `KycDocument` is its generalized successor. They can run side by side for now; migrating old `ClientDocument` rows into `KycDocument` (or retiring `ClientDocument` entirely) is a future cleanup, not a blocker.

---

## 5. Invoice — the one thing that's never reused

Unlike KYC, **the invoice is collected fresh on every single shipment**, because the invoice describes that specific shipment's goods and value — it cannot be the same as a previous shipment's invoice even for the same Client.

This is modeled as a `ShipmentDocument` with `docType: INVOICE`, tied to one specific `shipmentId`. It's mandatory before a shipment can move forward, and it sits in the same table as ops-added documents added later (Airway Bill, packing list, etc.) — just a different `docType`.

---

## 6. Addresses

`Address` is also polymorphic — belongs to either an `Org` or a `Client`, same pattern as `KycDocument` — and reusable, so a saved address doesn't need to be re-typed on every shipment.

Each shipment has up to three address references:
- `pickupAddressId` (required)
- `deliveryAddressId` (required)
- `billingAddressId` (optional) + `billingSameAsDelivery: Boolean` — if `true`, the billing address is just read from the delivery address at display/invoice time and no separate billing `Address` row needs to exist. If `false`, `billingAddressId` points to a distinct address.

`Address.kind` (`PICKUP` / `DELIVERY` / `BILLING`) is an optional label for address-book filtering — e.g. showing "your saved pickup addresses" in a picker UI. **It is not an enforced constraint.** Any saved address can be used for any role on any given shipment, regardless of what `kind` it was originally saved as — the label is a convenience default, not a hard rule.

---

## 7. Wallet (no Razorpay yet)

**The wallet lives on `Org` only — never on `Client`.** This was a deliberate decision: when a BA books a shipment on behalf of one of their Clients, **the Org's wallet pays, not the Client's** — the BA fronts the cost. Clients have no wallet of their own because they never need to pay directly; they never even log in.

- `Wallet` — one per `Org` (`orgId` is `@unique`, enforcing strict 1:1). Holds a cached `balance` for fast reads.
- `WalletTransaction` — the append-only ledger and **actual source of truth**, not the cached balance. Every top-up, every shipment debit, every refund or manual adjustment is its own row, with `balanceAfter` recorded at write time so you always have an auditable running total.
- A shipment booking debit is `type: SHIPMENT_DEBIT`, linked via `shipmentId`.

### Payments — not yet wired up

Razorpay integration is deliberately deferred. The reasoning: trying to build payments (webhooks, signature verification, retries, reconciliation) *at the same time* as the booking flow would massively slow down getting booking itself working. Building booking first, with payment as a stub, means:

- A shipment can move from `DRAFT` all the way to `BOOKED` today using whatever stub/manual wallet-credit mechanism is convenient during development.
- `WalletTransaction` already has nullable `razorpayOrderId`, `razorpayPaymentId`, and `razorpaySignature` columns sitting unused. When Razorpay is wired up later, these get **populated**, not migrated in — no schema change needed at that point, just application logic that fills in fields that already exist and flips `status: PENDING → SUCCESS` on a webhook callback.

---

## 8. Shipment lifecycle

A `Shipment` always has `orgId` set (who's booking/paying — always an Org) and optionally `clientId` (who it's for, if not the Org itself).

### Status flow

`ShipmentStatus` enum: `DRAFT → PENDING_PAYMENT → BOOKED → PROCESSING → DOCUMENTS_PENDING → IN_TRANSIT → CUSTOMS_HOLD → OUT_FOR_DELIVERY → DELIVERED`, with `CANCELLED` and `ON_HOLD` available at any point.

Every status change is recorded as its own row in `ShipmentStatusEvent` (`fromStatus`, `toStatus`, `note`, who changed it, when) — **not** just overwritten on the `Shipment` row. This gives a full timeline/audit trail for free, which powers both the ops dashboard's shipment view and any future customer-facing tracking page, without needing to reconstruct history from logs.

### Rate/service snapshot

Once pickup and delivery addresses are known, available carrier services for that route are looked up (against the existing `RateCard`/`RateSlab` tables). Whatever the customer selects gets frozen into the `Shipment` row at that moment:
- `selectedVendorId`, `selectedVendorName`, `selectedProductName`
- `quotedTotal`, `chargesSnapshot` (full price breakdown)
- `serviceabilitySnapshot` (the raw list of options that were shown, for audit/debugging if a customer disputes what they saw)
- `markupPercentApplied` (see [Markup & pricing](#2-markup--pricing) above)

This follows the same snapshot philosophy as the existing `Quote` model — booking-time state is locked, so later changes to rate cards or an Org's markup don't retroactively change what a customer already paid for.

### Ops dashboard

Once a shipment reaches `BOOKED`, it appears in the ops queue: `WHERE orgId = X AND status = 'BOOKED'` (or more broadly, any non-terminal status, depending on how the queue view is built). From there, ops can:
- Update status (writes a new `ShipmentStatusEvent`).
- Attach documents as the shipment progresses — Airway Bill, customs declaration, proof of delivery, etc. — via `ShipmentDocument`, same table the invoice lives in, distinguished by `docType`.
- Add internal notes (`Shipment.internalNotes`) — separate from the customer-facing status, for ops-only context.

---

## 9. Multistep booking form (no overwhelming the user)

The form is designed to be filled in stages, matching the model boundaries above, so each step only asks for what's actually needed at that point:

1. **Who is this for?** — self, or an existing/new `Client`.
2. **KYC** — skipped automatically if already on file for that party; otherwise only the missing pieces are requested.
3. **Invoice** — always collected fresh.
4. **Pickup address** — from address book or new entry.
5. **Delivery address**, with a "billing same as delivery" checkbox to skip a redundant step.
6. **Package/cargo details** — dimensions, weight, contents, declared value (`PackageItem`, one shipment can have multiple packages).
7. **Service selection** — available carrier options for that route/PIN, priced with the Org's markup already applied.
8. **Payment** — currently stubbed; wallet debit happens here once Razorpay is wired up.

**Open implementation question, not yet decided:** whether the form should persist progress to the database after each step (so a customer can resume a half-finished booking later) versus holding everything in client-side state until a single final submit. This is a frontend/API decision, not a schema one — the schema supports either approach equally — but it should be settled before the form UI is built, since it changes how "resume my draft" would work.

---

## 10. Things intentionally deferred / out of scope for now

- **Razorpay integration** — stubbed, see [Payments](#payments-not-yet-wired-up).
- **Per-shipment or per-deal markup variation** — markup is fixed per Org for now; finer-grained pricing is a future change if ever needed.
- **Client-level wallets** — explicitly not needed; the Org's wallet always pays.
- **BA reapplication after rejection** — not restricted in the schema; a rejected `Org` can submit a new `BaApplication` row at any time (old rejected row stays as history). If a cooldown period is ever wanted, that's application-layer logic, not a schema change.
- **DB-level CHECK constraints** for "exactly one of `orgId`/`clientId` is set" on `KycDocument` and `Address` — currently enforced only in the application layer. Worth adding as a raw-SQL migration later if stricter guarantees are wanted.
- **`ClientDocument` vs `KycDocument` overlap** — both currently exist; migrating fully to `KycDocument` is a future cleanup, not urgent.