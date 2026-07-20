# Arena Rewards System

This document is the single source of truth for how the reward point system works. It covers the customer promise, the earning math, the redemption rules, the data model, the admin controls, the client experience, and the exact places it hooks into the codebase. Read this before changing any reward logic.

The copy in this product avoids em dashes on purpose. Keep it that way in every user facing string.

---

## 1. The promise (what the customer sees)

One point equals one rupee. Always. That is the whole mental model for a customer. If they have 150 points, that is 150 rupees they can put toward a future shipment.

Everything else in this document (curves, vesting, campaigns, classifiers) is machinery that stays behind the scenes. The customer never needs to understand it. The wallet shows them a rupee value, a pending value, and what unlocks next. That is it.

Principles we hold to:

1. Every shipment earns something. There is no minimum shipment value to earn.
2. Points are shown in rupees, never in abstract units the customer has to translate.
3. New customers feel the most generosity early, then the rate settles to a steady state.
4. We never pay out of our own pocket on tiny shipments, so redemption has a floor.
5. We keep a buffer on big shipments by earning on freight only, not on taxes and surcharges.
6. Normal orgs are the focus. Business Associates already get a discount, so they earn a small flat gesture.

---

## 2. Two kinds of account

The platform has one `Org` model with an `isBusinessAssociate` boolean. The reward engine keys off that same flag. There is no new account type.

- Normal org: gets the full tiered earn curve (section 4).
- Business Associate (BA) org: gets a flat low earn rate (section 4), because their reward is already baked into a lower markup.

When a BA books on behalf of one of their clients, the points always accrue to the BA org (the account that books and pays). Clients never log in and never hold points.

---

## 3. The reward base (what the percentage is calculated on)

Points are earned on freight only. Fuel surcharge, GST, and any other charge line are excluded. This protects our margin on larger shipments where taxes and surcharges inflate the total.

The reward base for a shipment is:

```
rewardBaseAmount = markedUpFreight + firstMilePickupCharge
```

- `markedUpFreight` is the freight line the customer actually pays, after our markup, with fuel, GST, and other charges removed.
- `firstMilePickupCharge` is the door to hub domestic courier charge (`Shipment.firstMileCharge`), included only when the customer opted into door pickup (`Shipment.pickupIncluded`).

### 3.1 How we isolate pure freight

Charge lines are not fully normalized across vendors, so we compute the freight base at booking time and freeze it on the shipment.

- Shipmozo emits a clean `FREIGHT` line (`product.shipping_charges`) plus separate overhead lines (fuel and similar) plus `GST`. We take the `FREIGHT` line. See `lib/rate-adapters/vendors/shipmozo/shipmozo.adapter.ts`.
- skart passes vendor charge names through as free text (`c.charge_name`) and its raw response also carries a `freight_amount`. We resolve freight from that. See `lib/rate-adapters/vendors/skart/skart.adapter.ts`.
- Markup is applied as a uniform scale across every line (`lib/pricing/markup.ts`, MODE A), so the freight line in the snapshot is already marked up. No extra scaling is needed.

A small charge classifier maps each vendor line into one of `FREIGHT`, `FUEL`, `TAX`, `OTHER`. Its keyword rules are visible and editable in the admin panel so a mislabeled vendor line can be corrected without a code change. If a shipment cannot be confidently classified, the classifier falls back to `totalWithoutTax` minus any recognized non freight lines, and logs a Sentry breadcrumb so we can review it.

### 3.2 Snapshot, never recompute

`rewardBaseAmount` is written onto the `Shipment` at booking time and never recomputed. This mirrors how `markupPercentApplied` and `chargesSnapshot` are frozen today, so historical points stay correct even if charge shapes or classifier rules change later.

---

## 4. The earn curve

The rate depends on the account type, on how many shipments the org has booked, and on whether the org is prepaid or deferred payment. There is one absolute rule above everything else: the everyday earn rate never exceeds a hard ceiling of 3% (`maxEarnPct = 3`). This is a config value and also a code safety rail.

### 4.1 Standard (deferred) curve

Every new signup starts as a deferred-payment org (section 16). The standard curve is what a deferred org earns. Let `n` be the ordinal of the shipment being booked, counting the org's non cancelled shipments (the first shipment is n = 1).

| Shipment number (n) | Deferred rate |
|---|---|
| 1 to 5 | 2.0% |
| 6 to 15 | 1.6% |
| 16 to 35 | glides from just under 1.6% down to 0.8% |
| 36 and up | 0.8% |

The glide is linear and smooth so there is never a hard cliff. Full formula:

```
if n <= tier1End:        rate = tier1Pct        // 2.0%
else if n <= tier2End:   rate = tier2Pct        // 1.6%
else if n <= decayEndAt: rate = tier2Pct - (n - tier2End) * (tier2Pct - floorPct) / (decayEndAt - tier2End)
else:                    rate = floorPct        // 0.8%
```

Default knobs: `tier1Pct = 2.0`, `tier1End = 5`, `tier2Pct = 1.6`, `tier2End = 15`, `floorPct = 0.8`, `decayEndAt = 35`.

### 4.2 Prepaid boost

Prepaid orgs (those who have topped up their wallet, section 16) earn at `prepaidMultiplier` times the standard curve. Default `prepaidMultiplier = 1.25`, which makes the prepaid curve exactly 2.5% / 2.0% / glide / 1.0%. The marketing line "prepaid earns 25% more" is literally true, and the prepaid top rate of 2.5% sits under the 3% ceiling.

| Shipment number (n) | Deferred | Prepaid (1.25x) |
|---|---|---|
| 1 to 5 | 2.0% | 2.5% |
| 6 to 15 | 1.6% | 2.0% |
| 36 and up | 0.8% | 1.0% |

A deferred org that converts to prepaid immediately jumps to the higher curve. This is the core bait for the prepaid push (section 16). BA orgs are not part of the deferred versus prepaid split (see 4.3).

### 4.3 BA org rate

Flat `baRatePct = 0.5%` on every shipment. No tiers, no decay, no prepaid split. Milestones and campaigns still apply.

### 4.4 Campaign multiplier and the ceilings

An active campaign (section 8) multiplies the rate. Campaigns are a deliberate, time-boxed exception and may push earning above the everyday 3% ceiling, up to a separate campaign ceiling (`campaignMaxPct`, default 6%).

```
baseRate      = standard or prepaid or BA rate as above
steadyRate    = min( baseRate, maxEarnPct )                       // everyday cap, 3%
effectiveRate = min( baseRate * campaignMultiplier, campaignMaxPct )  // during a campaign, up to 6%
```

When no campaign is active, `effectiveRate = steadyRate`. When a campaign is active, the campaign ceiling applies instead of the everyday ceiling for that window only.

### 4.5 Points formula

```
computed     = round( rewardBaseAmount * effectiveRate / 100 )
pointsEarned = min( computed, maxPointsPerShipment )
```

Rounded to the nearest whole point (1 point = 1 rupee, so points are always integers). A single shipment can never earn more than `maxPointsPerShipment` (default 5,000), which stops one very large shipment from minting a huge amount of points. Set the knob blank to mean no cap. The `effectiveRate`, `rewardBaseAmount`, and `configVersionUsed` are snapshotted onto the reward transaction for audit.

### 4.6 Worked examples

Reward base 10,800 (freight 10,000 plus first-mile 800):

- Deferred org, 3rd shipment, 2.0%, earns 216 points (pending).
- Prepaid org, 3rd shipment, 2.5%, earns 270 points.
- Prepaid org, 10th shipment, 2.0%, earns 216 points.
- Prepaid org, 25th shipment, 1.5%, earns 162 points.
- Prepaid org, 40th shipment, 1.0%, earns 108 points.
- Prepaid org, 3rd shipment during a Diwali 2x campaign, 2.5% x 2 = 5.0% (within the 6% campaign ceiling), earns 540 points.

Large shipment, prepaid org, freight 600,000, computed 2.5% = 15,000 points, but capped by `maxPointsPerShipment` (5,000) to earn 5,000 points.

BA org, reward base 52,000 (freight 50,000 plus first-mile 2,000):

- Any shipment, 0.5%, earns 260 points.

---

## 5. Vesting and lifecycle

Points move through clear states. This protects against booking to farm points and then cancelling.

```
Booked      -> EARN transaction created as PENDING
Delivered   -> EARN flips to AVAILABLE, expiresAt set to now + 12 months
Cancelled   -> EARN flips to VOIDED (before it ever became spendable)
```

- Pending points are shown in the wallet with a plain reason, not just a "Pending" label. For example "270 points, unlocks when this shipment is delivered". People instantly understand why they cannot use them yet. A growing pending balance is itself a reason to keep shipments moving.
- Available points are spendable and count down toward expiry.
- Expiry is 12 months after a batch becomes available. One simple rule for all point types (earned, milestone, anniversary): points expire 12 months after you receive them.
- We warn before expiry (section 9).
- Once a shipment is delivered and its points have vested, those points are kept for good. If the shipment is later returned or refunded, we do not claw the points back. Delivery happened, so we honor the reward. This avoids negative balances and the support mess of reversing already spent points, and the amounts are small.

Redemption consumes available points oldest expiry first (FIFO), so a customer never loses points they could have spent.

---

## 6. Redemption

Redeeming lets a customer pay part of a future shipment with points. One point pays one rupee.

Rules:

- Minimum shipment value to redeem: the shipment total (`quotedTotal`) must be at least 2,000 rupees. Below that, the shipment still earns points, it just cannot have points redeemed on it.
- Per shipment cap: points can cover at most 20% of the shipment total. On a 5,000 rupee shipment that is up to 1,000 rupees off.
- Maximum redeemable on a shipment:

```
maxRedeemable = min( availablePoints, floor(0.20 * quotedTotal) )   // only if quotedTotal >= 2000
```

- Redemption is validated on the server. The client UI is a convenience, never the source of truth.
- Redemption reduces the wallet cash debit at booking. The redeemed rupee value is deducted from the amount charged to the wallet, and a `REDEEM` reward transaction is written in the same database transaction as the booking, so points and money never desync.
- If a shipment that had points redeemed on it is cancelled, the redeemed points are refunded back to the account.

### 6.1 Revalidate at confirm, never trust the earlier quote

The amount and the shipment can change between the moment a customer applies points and the moment they confirm. Never assume the quote stayed the same. At the final confirm step, the server recomputes everything from the current shipment and re-checks the rules before writing anything:

- Recompute `quotedTotal` from the current shipment.
- Re-check the minimum shipment value (`quotedTotal >= minRedeemValue`).
- Re-check the cap (`redeemed <= floor(capPct * quotedTotal)`).
- Re-check that the customer still has enough available points.

Worked exploit this blocks: shipment is 2,200 rupees, customer applies 440 points, then edits the shipment down to 1,500 rupees. On confirm the server sees 1,500 is below the 2,000 floor and rejects or trims the redemption. The customer never gets a discount the new shipment does not qualify for. If the shipment total changes, `pointsEarned` is also recomputed from the new freight base before the earn transaction is written.

### 6.2 Redemption for deferred-payment (pay-at-hub) orgs

Deferred-payment orgs do not have a wallet debit at booking. They pay at the hub before the shipment flies. So redemption cannot reduce a wallet debit for them. Instead:

- The redeemed rupee value reduces the amount ops collect at the hub. Example: a shipment costs 4,000 rupees, the customer redeems 200 points, so the amount payable at the hub becomes 3,800 rupees and ops collect 3,800.
- The `REDEEM` transaction and the `pointsRedeemed` / `pointsRedeemedValue` snapshot are written at booking time exactly as for prepaid orgs. Only the money side differs (collected at hub, not debited from wallet).
- The shipment's payable-at-hub amount is stored so ops see the reduced figure to collect.
- If the customer never pays at the hub and the shipment is cancelled, the redeemed points are refunded (same rule as any cancellation) and the pending earn for that shipment is voided.

This is safe because a deferred shipment only flies after payment is collected, so points can only be spent against shipments that are actually paid for.

### 6.2b No double spend

Point deduction happens only at final confirm, inside the booking transaction, with an atomic balance check (the same race-safe pattern the wallet debit already uses). Applying points on the review step is a UI intent, it does not reserve or move points. Two concurrent bookings cannot both spend the same points: the first to commit wins, the second re-reads the balance and fails the check. This makes the review step display best effort and the confirm step the single source of truth.

The redemption cap and floor use `quotedTotal` (the full amount the customer pays), not the reward base. Earning uses the freight base, redeeming is capped against the whole bill.

---

## 7. Milestones

One time bonus points when an org crosses a lifetime shipment count. These are the surprise moments.

Default ladder:

| Delivered shipments | Bonus |
|---|---|
| 10 | 200 points |
| 20 | 300 points |
| 50 | 750 points |
| 100 | 1,500 points |
| 250 | 4,000 points |

- Milestones are keyed off delivered shipment count, not booked count, so they cannot be farmed by booking and cancelling.
- Awarded as AVAILABLE immediately when the qualifying shipment reaches delivered.
- Each milestone is awarded once per org, enforced by a `RewardMilestoneAward` uniqueness guard.
- Milestone points follow the same 12 month expiry rule as everything else.
- Milestones are fully editable in the admin panel (thresholds and bonus values).

---

## 8. Campaigns, banners, and surprises

Campaigns let the admin team run time boxed offers without touching code.

A campaign has:

- Name (for example "Diwali Double Points").
- Applies to: normal orgs, BA orgs, both, or prepaid orgs only (a prepaid-only campaign is one of the prepaid conversion baits, section 16).
- Multiplier (for example 2.0 for double points), bounded by the campaign ceiling `campaignMaxPct` (default 6%).
- Start and end date and time.
- Per-org shipment usage cap: the maximum number of shipments an org may earn the boosted rate on during this campaign. For example a Diwali offer good for at most 10 shipments per org, an Independence Day offer good for at most 3. Configurable per campaign, blank means unlimited within the window.
- Banner text and a banner on or off toggle.

While a campaign is active and applies to the org, the earn rate is multiplied and clamped to the campaign ceiling (section 4.4), and a banner shows on the client wallet and booking flow with the admin authored copy. Usage against the per-org cap is counted by the number of the org's shipments that earned at the campaign rate during the window (tracked via the `campaignId` on each earn transaction). Once an org hits the cap, further shipments in the window earn at the normal rate and the banner updates to say the offer has been fully used. Multiple campaigns should not overlap for the same audience. If they do, the engine uses the highest multiplier and logs a Sentry breadcrumb.

Anniversary bonus is a standing surprise, not a campaign. On the yearly anniversary of an org's signup date, a bonus (default 300 points, configurable, on by default) is granted automatically. It is idempotent per org per year via a `RewardAnniversaryAward` guard.

Welcome bonus is a one time gift granted when a new org's first shipment is delivered, not when they complete their profile. Profile completion can be gamed, but a first delivered shipment means they have become a real, paying customer. Default 100 points, configurable, on by default. Granted as AVAILABLE, idempotent per org (granted at most once). The celebration copy reads like: "Welcome to Arena Rewards. You earned 100 rupees."

Both the welcome bonus and the anniversary bonus are additionally deduped by real-world identity, not just per org. The identity is matched on a keyed hash of the PAN or Aadhaar, never the raw number. See section 10 for the hashing approach and section 17 for how this stops spinning up many orgs under the same identity to farm these free bonuses.

---

## 9. Nudges and emails

We reuse the existing Resend email setup (`lib/email/shipment`).

- Points vested: when pending points become available on delivery.
- Milestone unlocked: a celebration email when a milestone is crossed.
- Expiring soon: a warning roughly 30 days before a batch of points expires, showing the rupee value at risk.
- Campaign announcement: optional, when the admin launches a campaign.
- Welcome bonus: when a new org completes its profile and the welcome points land.

In addition to email, the same events raise in app notifications (a bell or toast inside the app) so customers who live in the product still see them: points unlocked, milestone hit, welcome and anniversary bonuses, and points expiring soon.

Every email and notification uses plain, warm copy and no em dashes.

---

## 10. Data model

New Prisma models, deliberately parallel to the existing `Wallet` and `WalletTransaction` ledger.

### RewardAccount (one per Org)

- `orgId` unique
- `availablePoints`
- `pendingPoints`
- `lifetimeEarned`
- `lifetimeRedeemed`

### RewardTransaction (the ledger)

- `type`: `EARN`, `MILESTONE_BONUS`, `ANNIVERSARY_BONUS`, `WELCOME_BONUS`, `CONVERSION_BONUS`, `REDEEM`, `EXPIRE`, `VOID`, `ADJUSTMENT`
- `status`: `PENDING`, `AVAILABLE`, `REDEEMED`, `EXPIRED`, `VOIDED`
- `points` (positive value, direction implied by type)
- `balanceAfter`
- `earnRatePctApplied` (snapshot, null for non earn types)
- `rewardBaseApplied` (snapshot, null for non earn types)
- `configVersionUsed` (the `RewardConfig.version` in effect when this transaction was computed)
- `campaignId` (nullable)
- `shipmentId` (nullable)
- `expiresAt` (nullable, set when a batch becomes available)
- `notes`

Per batch `expiresAt` enables FIFO, soonest expiry first consumption.

Storing `configVersionUsed` on every transaction means that when a customer or an admin asks "why did I get 162 points", you can point to the exact config version that generated them, alongside the rate and base already snapshotted. This is the audit trail for the numbers.

### Config tables (admin driven)

- `RewardConfig`: the config record holding all knobs (section 12): `id`, `version` (an integer bumped on every publish), `updatedAt`, plus the curve knobs, `prepaidMultiplier`, `maxEarnPct`, `campaignMaxPct`, `maxPointsPerShipment`, `baRatePct`, redemption cap and floor, expiry months, point value, welcome and anniversary bonuses and toggles, first-mile inclusion, `deferredGraceShipments`, and `prepaidConversionBonus`. The live config is the highest version. Older versions are retained (not overwritten) so that `configVersionUsed` on past transactions always resolves to the exact ruleset that produced them.
- `RewardMilestone`: threshold plus bonus rows.
- `RewardCampaign`: name, appliesTo (normal, BA, both, or prepaid-only), multiplier, start, end, `maxShipmentsPerOrg` (per-org usage cap, blank means unlimited), banner text, banner enabled.
- `RewardCampaignUsage` or equivalent: derived from earn transactions carrying the `campaignId`, used to enforce the per-org shipment cap.
- `RewardMilestoneAward`: unique on (orgId, milestoneId).
- `RewardAnniversaryAward`: unique on (orgId, year).
- `RewardWelcomeAward`: unique on (orgId), and also checked against the org's `panHash` or `aadhaarHash` so the same identity cannot claim it twice across orgs.
- `RewardChargeRule`: optional keyword to category rules for the freight classifier.
- `RewardConfigAudit`: append only log of config changes, manual adjustments, and campaign actions (actor, timestamp, action, before, after).

### Shipment additions

- `rewardBaseAmount` (snapshot of freight plus first-mile used for earning)
- `pointsEarned`
- `pointsRedeemed`
- `pointsRedeemedValue`
- `payableAtHubAmount` (for deferred-payment orgs, the reduced amount ops collect after redemption)

### Org additions

- `panHash` (a keyed hash of the PAN, used only for bonus dedupe, indexed)
- `aadhaarHash` (a keyed hash of the Aadhaar, used only for bonus dedupe, indexed)
- `paymentMode` or reuse of `skipPayment`, to track deferred versus prepaid and drive the prepaid conversion nudges (section 17)

We never store the raw PAN or Aadhaar for rewards. These are highly sensitive identifiers and holding them in plain text is both a security risk and a compliance headache. The reward system never needs the original value, it only needs to know whether two signups are the same identity, which a hash answers perfectly.

How the hashing works:

- When someone types their PAN (for example `ABCDE1234F`) or Aadhaar in the profile, we normalize it first (uppercase and trim the PAN, strip spaces and non digits from the Aadhaar) and validate its format. Normalization matters, because `abcde1234f` and `ABCDE1234F` must produce the same hash or the dedupe silently fails.
- We compute `HMAC-SHA256(normalizedValue, secret)` where `secret` is a server-side pepper stored in the environment (`REWARDS_IDENTITY_HMAC_SECRET`), and store only that hash.
- Why HMAC with a secret and not plain SHA256: a PAN has a fixed `AAAAA9999A` shape and an Aadhaar is 12 digits, so the space of possible values is small enough to brute force. Plain SHA256 could be reversed by hashing every candidate offline. The secret pepper makes that impossible without also stealing the environment secret, so a database leak alone reveals nothing.
- The pepper is a long lived secret, like an encryption key. It must not be rotated casually, because changing it invalidates every stored hash. If it ever must rotate, version it and rehash on next login.
- Dedupe check: when a bonus would be granted, we look up whether any org sharing this `panHash` or `aadhaarHash` has already claimed that bonus. This does not forbid a person from having multiple orgs, it only stops the same identity from claiming a one time bonus more than once.

If compliance ever requires the raw PAN or Aadhaar on file, that is a separate concern from rewards and must use the existing encrypted at rest pattern in this repo (`VendorKey.encryptedPayload` plus `iv`), never a plain column. The scanned KYC document remains the supporting evidence.

Note on Next constraints: reward enums and shared types must live in plain modules, not in files marked "use server", because this repo (Next 16.2.6) does not allow type exports from server action files.

---

## 11. Where it hooks into the code

- Accrual: inside the existing atomic booking transaction in `actions/book/createShipment.action.ts`, right after the status flips to `BOOKED`. Compute `rewardBaseAmount`, create the `EARN` transaction as `PENDING`, and apply any requested redemption (reduce the wallet debit and write a `REDEEM` transaction). All in the same transaction, so points can never desync from a booking.
- Vesting, welcome bonus, and milestones: on the status transition that sets `DELIVERED` (the same seam that fires shipment status emails). Flip the shipment's pending `EARN` to `AVAILABLE`, set `expiresAt`, grant the welcome bonus if this is the org's first delivered shipment and it has not been granted, then check and grant any newly reached milestones.
- Cancellation: on the transition to `CANCELLED`. Void the pending `EARN`, and refund any points that were redeemed on that shipment.
- Crons (pattern already exists in `app/api/cron`): a daily expiry job (mark aged available batches `EXPIRED`, debit the balance), a daily anniversary job (grant yearly bonuses), and an expiring soon nudge job (can share a run with expiry).

---

## 12. Admin panel

Lives under the arena dashboard at `app/(arena)/arena-dashboard/rewards`. The admin team runs the whole program from here without ever touching the codebase.

Design rule: every number in this system is a stored config value, not a constant in code. The percentages, the tier boundaries, the floor, the decay end, the BA rate, the redemption cap and floor, the expiry window, the point value, the milestone thresholds and bonuses, the welcome and anniversary bonuses and their toggles, the campaign multipliers and dates, and the classifier keywords are all edited from the admin panel. These values get tuned over time by trial and error, so changing any of them must never require a deploy. Code reads the current config at runtime and snapshots what it used onto each transaction.

- Program config editor: curve knobs (`tier1Pct`, `tier1End`, `tier2Pct`, `tier2End`, `floorPct`, `decayEndAt`), `prepaidMultiplier`, the ceilings `maxEarnPct` and `campaignMaxPct`, `maxPointsPerShipment`, `baRatePct`, redemption cap percent, minimum redeem value, expiry months, point value, welcome bonus points and toggle, anniversary bonus points and toggle, whether first-mile is included in the reward base, `deferredGraceShipments`, and `prepaidConversionBonus`. Publishing any change bumps `RewardConfig.version` and retains the previous version.
- Campaign editor includes the per-org shipment usage cap (`maxShipmentsPerOrg`) and the prepaid-only audience option.
- Milestones: create, edit, remove thresholds and bonus values.
- Campaigns: create and schedule offers with multiplier, audience, dates, and banner copy.
- Charge classifier rules: view and edit the keyword to category mapping used to isolate freight.
- Manual adjustment per org: grant or deduct points with a mandatory note, writing an `ADJUSTMENT` transaction. For goodwill and corrections.
- Per org rewards panel: shown on the existing client detail page, with balance, full ledger, and the adjust action.
- Liability dashboard: outstanding points as a rupee figure, points issued versus redeemed, redemption rate, expiring soon totals, and top earners.
- Reward Simulator: a sandbox that lets the admin try a config before it goes live. The admin edits a draft of the config (tier percentages, milestone values, expiry, redemption cap, campaigns) and the simulator shows the impact without touching real users or real balances. This turns tuning from guesswork into something you can see first. See section 12.1.

### 12.1 Reward Simulator

The simulator answers "if I change this, is it a good idea". It never writes to any real account.

- Draft config: the admin adjusts a draft copy of every knob. Nothing is applied until they explicitly publish.
- Scenario preview: for a set of sample shipments (a manual freight and shipment number, or a pick from real recent shipments replayed read only), it shows points earned per shipment, the curve across shipment numbers 1 through 50, milestone hits, and redemption limits under the draft.
- Liability projection: an estimate of how the draft changes points issued and outstanding liability, computed by replaying a window of recent real shipments through the draft config in memory. Read only, no writes.
- Side by side: current config versus draft, so the delta is obvious before publishing.
- Publish: applies the draft to the live config in one action, recorded in the config change audit log (who, when, before, after). Past transactions are untouched because every transaction already snapshots what it used.

### 12.2 Config change safety

Config values are tuned by trial and error, so the panel must make a ruinous change hard to commit, whether by fat finger or a compromised admin session.

- Hard bounds in code: every knob has a min and max the panel cannot exceed. Earn percentages are bounded (for example 0 to 10 percent), the redemption floor cannot be zero, the cap stays within a sane range, expiry stays within a range, and so on. These bounds live in code as the last line of defense and are not themselves admin editable.
- Confirm on publish: publishing a change requires an explicit confirm step that shows the before and after.
- Transaction PIN: publishing any config change, running a manual point adjustment, or launching a campaign requires entering a PIN, like an ATM PIN. The PIN is validated on the server against a value stored in the environment (`REWARDS_ADMIN_PIN`). If it does not match, nothing is written. This is an interim guard until role based access control lands in the admin panel, at which point RBAC becomes the primary protection and the PIN can remain as a second factor for the most sensitive actions.
- Audit log: every config change, manual adjustment, and campaign action is written to an audit log with the actor, timestamp, and the before and after values.

---

## 13. Client experience

Everything money related lives on one page, the Wallet page, with two tabs: `Wallet` and `Rewards`.

### Rewards tab

- A large hero showing available points as a rupee value.
- Pending points as a separate, smaller number, with a short line explaining they unlock on delivery.
- Expiring soon callout when applicable, showing the rupee value and date.
- Progress bar to the next milestone, for example "3 more shipments to unlock 750 points". This counts delivered shipments, the same basis milestones are awarded on, so the bar and the actual milestone never disagree. If it counted booked shipments a customer could read "19" while only 15 have delivered, and feel cheated when the milestone does not fire.
- Active campaign banner with the admin authored copy.
- Activity ledger in plain language (earned, unlocked, redeemed, expired, bonus). Each row that relates to a shipment shows the shipment number as a clickable link, for example "+216, shipment ARN-240128", so a customer can instantly see which shipment gave them those points. This answers the most common question people ask about their ledger.
- A "How rewards work" link that opens the explainer dialog.

### Explainer dialog

A simple, friendly dialog that explains the program in a few short lines: one point is one rupee, you earn on every shipment, points unlock when your shipment is delivered, you can use them on shipments over 2,000 rupees, and they last 12 months. It auto shows once for a first time user, and is available any time from the link. No em dashes in the copy.

### Booking flow

- Review step: a control to apply available points to this booking, shown only when the shipment qualifies (2,000 rupees or more). Applying points fires a subtle confetti burst on the redeem button.
- Booking confirmation: a message showing the points just earned (pending). On a new org's very first booking, a one time confetti burst welcomes them to the program.

### Dashboard widget

A compact card showing the points balance and progress to the next milestone, always visible.

### Invoices and documents

The shipment invoice and booking confirmation show a points line: points earned on this shipment, and points redeemed with their rupee value. This reinforces the reward value every time the customer looks at a document.

### Confetti moments

Using the Magic UI confetti component (canvas-confetti under the hood, copy paste friendly like the shadcn components already in use). Kept subtle everywhere: low particle count, a single short burst, never looping.

1. Applying points on the booking review step.
2. A milestone unlocking (in the wallet, with a toast).
3. The welcome bonus landing on the org's first delivered shipment, their first real reward.
4. The yearly anniversary bonus landing.

---

## 14. Guardrails

- Every earn, redeem, milestone, and anniversary computation snapshots the applied rate, base, and `configVersionUsed`, so config changes never rewrite history and any past figure can be traced to the exact ruleset that produced it.
- A single shipment can never earn more than `maxPointsPerShipment`, so one very large shipment cannot mint an outsized amount of points.
- Progress bars and milestone awards both count delivered shipments, so what a customer sees and what actually fires can never disagree.
- Milestone and anniversary grants are idempotent through uniqueness guards.
- Redemption is validated on the server against the cap, the floor, and the available balance. The client never decides the number.
- All accrual and redemption run inside the booking database transaction. Points and money commit together or not at all.
- Expiry and FIFO consumption are deterministic and idempotent.
- Sentry instrumentation on every new server action, matching the rest of the codebase.
- UI follows the house style: shadcn first, no gradients, colour used only as a functional cue, and the celebratory moments earn a restrained accent rather than noise.
- Follow the Next 16.2.6 conventions in `node_modules/next/dist/docs` before writing any route or action, and keep shared types out of "use server" files.

---

## 15. Default configuration values

| Knob | Default |
|---|---|
| Point value | 1 point = 1 rupee |
| tier1Pct / tier1End | 2.0% deferred / up to shipment 5 |
| tier2Pct / tier2End | 1.6% deferred / up to shipment 15 |
| floorPct | 0.8% deferred |
| decayEndAt | shipment 35 |
| prepaidMultiplier | 1.25x (prepaid curve becomes 2.5 / 2.0 / 1.0) |
| maxEarnPct (everyday ceiling) | 3.0% |
| campaignMaxPct (campaign ceiling) | 6.0% |
| maxPointsPerShipment | 5,000 points (blank means no cap) |
| baRatePct | 0.5% |
| Reward base | marked-up freight plus first-mile pickup, excluding fuel, GST, other |
| Earn minimum | none |
| Vesting | pending at booking, available at delivery, void on cancel |
| Expiry | 12 months after points become available |
| Redemption floor | shipment total at least 2,000 rupees |
| Redemption cap | at most 20% of shipment total |
| Milestones | 10:200, 20:300, 50:750, 100:1,500, 250:4,000 |
| Welcome bonus | 100 points on first delivered shipment, on by default, deduped by PAN/Aadhaar hash |
| Anniversary bonus | 300 points per year, on by default, deduped by PAN/Aadhaar hash |
| Campaigns | admin created, time boxed, multiplier based, per-org shipment usage cap |
| Deferred grace shipments | 3 shipments before prepaid nudging starts |
| Prepaid conversion bonus | 300 points on first wallet top up of more than ₹1,000, deduped by PAN/Aadhaar hash |
| Identity hashing | HMAC-SHA256 with env pepper `REWARDS_IDENTITY_HMAC_SECRET`, raw PAN/Aadhaar never stored |
| Config safety | hard bounds in code, confirm on publish, transaction PIN, audit log |

Every value in this table is stored config, editable from the admin panel with no deploy. The hard bounds in code are the exception: they are the safety rails the panel cannot exceed.

---

## 16. Deferred payment and prepaid conversion

Every new signup starts as a deferred-payment org (pay at hub), so there is zero friction to their first bookings and they start earning and falling in love with the program right away. These are the customers we most want to make loyal. Over time we want to graduate them to prepaid (wallet top up), because prepaid means cash in hand, less collection risk, instant redemption, and a stickier customer with money parked with us.

The strategy is a graduation, not a wall. We never block a deferred customer, we make prepaid clearly more rewarding.

### The graduation model

- Grace phase (first `deferredGraceShipments` shipments, default 3): full deferred experience, no nudging. Let them enjoy the platform and accumulate points. Seed the idea gently, for example a small line that prepaid customers earn more.
- Nudge phase (after the grace phase): show escalating but friendly nudges to switch to prepaid, each framed around earning more points and a smoother flow.

### The bait (all admin configurable)

The chosen incentives to make prepaid the obvious choice:

1. Higher earn rate for prepaid, built into the curve: prepaid orgs earn `prepaidMultiplier` times the standard rate (default 1.25x, so 2.5% versus 2.0% at the top). This is the recurring reason to go and stay prepaid, and it is the core of the earn model (section 4.2). A deferred org sees "you are earning 2.0%, go prepaid to earn 2.5%" from their very first shipment.
2. Conversion bonus: a one time bonus (default 300 points) the moment they make their first wallet top up of more than 1,000 rupees. Deduped on the PAN or Aadhaar hash so it cannot be farmed across fake orgs.
3. Prepaid-only campaigns: some festival or surprise campaigns are exclusive to prepaid orgs (the `appliesTo` prepaid-only option in section 8), so deferred customers see what they are missing.

### Where the nudges appear

- Booking flow, after the grace phase: a card that says switching to prepaid earns 25% more points plus a one time bonus.
- Wallet page: a prepaid upgrade banner with the current bonus offer.
- A targeted email and an in app notification after the grace phase.

### Once prepaid, stay prepaid

Prepaid is a one way door by default. The whole point is to get payment in advance and remove the collection overhead and credit risk, so once an org converts we keep them prepaid. There is no self-serve switch back to deferred. If an org asks repeatedly and ops decide to grant it, ops can move them back to deferred, and they return to the standard (lower) reward rates at the same time. Deferred is never removed by force from a new org, we only ever make prepaid clearly more rewarding, but the direction we push is always toward prepaid: no credit, no headache.

## 17. Anti-abuse and security

This is a money system, so the abuse surface is treated as a first class concern. The vectors and their mitigations:

- Book to farm, then cancel: points vest only on delivery and are voided on cancel, so cancelling never leaves usable points.
- Edit the shipment after applying points: the server revalidates the minimum shipment value, the cap, and the available balance at confirm from the current shipment, never trusting the earlier quote (section 6.1). Points earned are also recomputed from the current freight base.
- Double spend across concurrent bookings: points move only at final confirm, inside the booking transaction, with an atomic balance check. The first commit wins, the second fails (section 6.2b).
- Farm free bonuses with many fake orgs: the welcome, anniversary, and prepaid conversion bonuses are deduped on a keyed hash of the PAN or Aadhaar (never the raw number), and the welcome bonus also requires a real delivered shipment, so many orgs under one identity get each bonus once (section 8, section 10, section 16). The identifiers are stored only as HMAC-SHA256 hashes with a server-side pepper, so even a database leak does not expose them and they cannot be brute forced.
- Non payment by deferred orgs: a deferred shipment only flies after payment is collected at the hub, and unpaid shipments are cancelled, which voids their pending points. So points can only ever be spent against shipments that were actually paid for (section 6.2).
- Delivered then returned: points are kept, not clawed back, which avoids negative balances and reversing spent points (section 5).
- Expiry never drives a negative balance: only unspent available batches expire, spent points are already redeemed and out of scope, and FIFO consumes soonest expiry first.
- Ruinous or malicious config change: hard bounds in code the panel cannot exceed, a confirm step, a transaction PIN validated against the environment, and an audit log (section 12.2). Role based access control will layer on top later.
- History integrity: every earn, redeem, milestone, and bonus snapshots the rate and base it used, so config changes and campaigns never rewrite past transactions.
- Instrumentation: Sentry on every new server action, and unusual patterns (large redemptions, repeated cancellations, classifier fallbacks) leave breadcrumbs for review.

## 18. Build phases

Each phase is independently shippable.

0. Schema and migration for the ledger and versioned config tables, the `panHash` and `aadhaarHash` identity fields with the HMAC helper and env pepper, and the audit log, plus seed of the default config above.
1. Earn engine, the charge classifier and freight base snapshot, the accrual hook in booking, vesting on delivery and cancel, and the expiry cron.
2. Redemption in the booking wizard, with server side revalidation at confirm, the atomic no double spend check, and both the wallet debit path and the deferred pay-at-hub path.
3. Milestones, welcome bonus (with PAN and Aadhaar dedupe), anniversary bonus, and campaigns, with their crons and idempotency guards.
4. Admin panel under the arena dashboard: every value editable with no constants in code, the config safety layer (hard bounds, confirm, transaction PIN, audit log), and the Reward Simulator.
5. Client rewards tab, explainer dialog, dashboard widget, invoice points line, celebration emails, in app notifications, banners, and confetti.
6. Prepaid conversion nudges and the bait mechanics (section 16).
