# Carrier Branding and Vendor Masking

Source of truth for how Arena presents international rates without revealing which
vendor supplied them. Every decision below was signed off by the business owner.
If you are about to change branding behaviour, change this document first.

Status: **specified, not yet built**.
Scope: **international rates only**. Domestic is explicitly out of scope for now.

---

## 1. Why this exists

The international rate calculator and the booking form's service selection step
currently display the sourcing vendor next to every quote: sKart Express,
Shipmozo, Aramex. That is a direct commercial risk:

1. A customer can read the vendor name and contact that vendor directly.
2. The vendor, seeing our volume, can approach the customer and take the account.

We are effectively marketing our suppliers for free. This feature removes the
supplier identity from every customer-facing surface while keeping the full
sourcing record internally, because we still need it to book, reconcile invoices
and support the shipment.

The rule in one line: **customers see carriers, Arena staff see vendors.**

---

## 2. Vocabulary

Three distinct concepts that the current code conflates. Use these terms exactly.

| Term | Meaning | Example | Customer sees it? |
| --- | --- | --- | --- |
| **Vendor** | The company we buy the rate from. Maps to an adapter in the registry. | `shipmozo`, `skart`, `aramex` | **Never** |
| **Carrier** | The brand that physically moves the parcel. | DHL, FedEx, UPS, Aramex, Arena | Yes |
| **Service** | The carrier's own product name for a speed or route tier. | `Express Worldwide`, `Drift` | Yes |

The confusing case: **Aramex is both a vendor and a carrier.** We hold a direct
Aramex channel partnership (vendor `aramex`), and resellers such as Shipmozo and
sKart also sell Aramex services. Both are presented as the carrier "Aramex" and
they compete on price. See section 6.

---

## 3. Decisions

Every row here is a business decision, not an engineering preference. Do not
change one without sign-off.

| # | Decision | Choice | Rationale |
| --- | --- | --- | --- |
| D1 | Row granularity | One row per carrier **plus** service. Do not collapse to one row per carrier. | DHL and UPS publish many services and rename them constantly. We show what the carrier returns. |
| D2 | Service mapping | **No product-code mapping table.** Detect the carrier only, keep the carrier's own service string verbatim. | Carrier list is tiny and stable. Service lists are large and volatile. Mapping services would break every time a carrier renames one. |
| D3 | Dedupe rule | Same carrier **and** identical normalized service name means keep the cheapest. Different service names means show both. | "DHL Express" and "DHL Express International" are genuinely different products. Merging them would quote a wrong transit time. |
| D4 | Name matching | Normalize, then exact match. See section 7. | Catches cosmetic differences in casing and abbreviation without ever merging two different services. |
| D5 | Hub codes | **Keep them.** Do not strip trailing gateway codes such as `DEL`. | Zero risk of merging two services that are not the same. Accepted cost is documented in section 12. |
| D6 | Unknown / unmatched product | Hidden from customers, fully visible to Arena staff with the raw vendor name. | Never leak, never guess. Ops can still quote it manually. |
| D7 | Shipmozo non-big-4 services | **All** become Arena-branded, not just the two named ones. | We hold written white-label permission from Shipmozo. |
| D8 | Arena naming rule | **Mode A (brand token swap)** now. Migrate to **Mode B (curated plus tier fallback)** later. | Mode A needs zero curation to launch. Build both, select by config. |
| D9 | sKart own-brand services | Shown under their own name, for example `sKartedge`. **Not** Arena-branded. | No white-label permission from sKart yet. Revisit when we get it. |
| D10 | Aramex direct vs reseller | Cheapest wins. No preference for our own channel. | Best customer price. We are not protecting margin at the customer's expense. |
| D11 | Who sees raw vendors | Clerk `orgId === ARENA_ORG_ID` only, always raw. Every tenant, BA and client is masked. | Single server-side rule, already enforced by `app/(tenant)` and `app/(arena)` route groups. |
| D12 | Existing quote history | Keep raw in the database. Mask **new** records only. No backfill, no destructive rewrite. | The database must stay the sourcing record of truth for reconciliation. |
| D13 | Vendor filter chips | Become carrier chips: DHL, FedEx, UPS, Aramex, Arena. | The vendor axis cannot survive in a masked UI. |
| D14 | Vendor errors | Hidden entirely from customers. Arena staff keep full per-vendor detail. | A partial-failure banner naming "sKart Express" leaks the vendor. |
| D15 | Domestic calculator | Unchanged for now. Build the layer vendor-agnostic so domestic can be switched on later. | Smallest blast radius on the revenue path. |
| D16 | Production safety | Env kill switch, fail **closed**, pinned unit tests. | This is the main revenue path. See section 11. |

---

## 4. Where this lives in the codebase

### The choke point

`getRatesAction` in [actions/rates.action.ts](actions/rates.action.ts) is the
single entry point for **both** customer-facing surfaces:

- the international rate calculator, via `app/(tenant)/rates/RatesClient.tsx`
- the booking form service step, via
  [ServiceStep.tsx:179](components/booking/steps/ServiceStep.tsx#L179)

It already resolves `orgId` from Clerk auth in order to look up
`Org.markupPercent`. That makes it the correct and only place to decide masking.
No new auth plumbing is needed.

### Pipeline order

Branding runs inside `getRates`
([lib/services/rate-calculator.service.ts](lib/services/rate-calculator.service.ts)),
after markup and before the sort. Order matters because dedupe compares final
customer-facing prices.

```
adapters fan out (Promise.allSettled)
  -> applyMarkup            (existing, lib/pricing/markup)
  -> brandQuotes            (NEW: detect carrier, strip vendor, brand Arena)
  -> dedupeQuotes           (NEW: normalize, collapse exact collisions)
  -> sort cheapest first    (existing)
```

`getRates` gains one option, `audience: "customer" | "internal"`, defaulting to
`"customer"`. **Default to masked.** A caller that forgets to pass the flag must
fail safe, not leak.

### New module

```
lib/rate-adapters/branding/
  carriers.ts        carrier detection rules (the only volatile file)
  normalize.ts       string normalization + abbreviation expansion
  brand.ts           brandQuotes(): raw RateQuote[] -> BrandedRateQuote[]
  dedupe.ts          collapse identical carrier + service pairs
  index.ts           public surface
  __tests__/         pinned raw-string -> expected-output fixtures
```

Nothing under `lib/rate-adapters/vendors/` changes. Adapters keep returning the
truth. Branding is a presentation layer applied on top, which is what makes the
kill switch a one-line revert.

### Type

`BrandedRateQuote` extends `RateQuote` rather than replacing it, so internal
consumers keep the raw fields:

```ts
interface BrandedRateQuote extends RateQuote {
  carrierCode: CarrierCode;   // "DHL" | "FEDEX" | "UPS" | "ARAMEX" | "ARENA" | "OTHER"
  carrierLabel: string;       // "DHL", "Arena", "sKart Express"
  serviceLabel: string;       // "Express Worldwide", "Drift", "" when none
  brandingApplied: boolean;   // false means this quote is raw, internal only
}
```

When `audience === "customer"`, the action strips `vendorId`, `vendorName` and
`productName` from the payload **before returning**. Do not merely hide them in
the component. Anything returned from a server action is inspectable in the
browser devtools network tab.

---

## 5. Carrier detection

The only file that needs occasional edits. Rules are evaluated **in order** and
the first match wins.

| Carrier | Pattern | Notes |
| --- | --- | --- |
| `ARAMEX` | `/\baramex\b/i` | Matched first, because it is also a vendor name. |
| `DHL` | `/\bdhl\b/i` | |
| `FEDEX` | `/fed\s?ex/i` | Covers `FEDEX`, `FedEx`, `Fed Ex`. |
| `UPS` | `/\bUPS\b/` | **Case sensitive on purpose.** A case-insensitive `ups` risks matching inside ordinary words. Every observed vendor string uses uppercase. |

Detection runs against the raw `productName`. Real strings observed in the
vendor API docs:

```
sKart:     "DHL DEL"  "FEDEX DEL"  "UPS Express DEL"  "Aramex Exp DEL"
           "Fedex Import"  "Aramex - Import"  "sKartedge"
Shipmozo:  "DHL Express Worldwide"  "Shipmozo Drift"  ... (varies)
Aramex:    "Aramex Express"  (hardcoded in the adapter)
```

No match means `OTHER`, which routes to section 6.

---

## 6. Branding rules

Applied per quote, after carrier detection.

### Case 1: a big-4 carrier was detected

```
carrierCode  = detected carrier
carrierLabel = "DHL" | "FedEx" | "UPS" | "Aramex"
serviceLabel = productName, with the carrier token and any vendor token removed,
               then trimmed and whitespace-collapsed
```

Applies regardless of which vendor supplied it. Aramex direct and Aramex via
sKart both become carrier `ARAMEX` and compete on price (D10).

If `serviceLabel` comes out empty, show the carrier alone with no service line.

### Case 2: no carrier detected, vendor is `shipmozo`

Arena white-label territory (D7). Two modes, selected by config.

**Mode A, brand token swap. Active now (D8).** Replace the first
whitespace-delimited token with `Arena`, keep the rest verbatim.

```
"Shipmozo Drift"           -> "Arena Drift"
"Shipmozo <second>"        -> "Arena <second>"
"Xpressbees International" -> "Arena International"
"Xpressbees"               -> "Arena"
```

**Mode B, curated plus tier fallback. Future.** A curated map for known services,
falling back to a transit-day tier (`<=5` Express, `6-9` Economy, `10+` Saver).
Build the interface now so switching is a config change, not a rewrite.

In both modes, if two Arena rows normalize to the same label, keep the cheapest
and drop the rest. Same rule as D3.

### Case 3: no carrier detected, vendor is `skart`

Show the raw `productName` as its own label, for example `sKartedge` (D9). No
Arena branding. `carrierCode = "OTHER"`, `carrierLabel = productName`.

### Case 4: no carrier detected, any other vendor

Hidden from customers, visible to Arena staff (D6). Log to Sentry with the
vendor id and raw string so we notice a new supplier product quickly.

---

## 7. Normalization and dedupe

Normalization exists **only** to build the dedupe key. It never changes what is
displayed. The customer always sees the carrier's own wording.

```
lowercase
strip punctuation
collapse whitespace
expand abbreviations:  exp -> express      intl, int'l -> international
                       ww  -> worldwide    eco  -> economy
                       std -> standard
```

Hub codes such as `DEL` are **not** stripped (D5).

Dedupe key: `` `${carrierCode}::${normalized(serviceLabel)}` ``.
Identical key means keep the lowest `totalWithTax`, drop the rest.

Worked examples:

```
"DHL Express Worldwide" (skart)     ->  dhl::express worldwide
"DHL EXPRESS WW"        (shipmozo)  ->  dhl::express worldwide
                                        SAME KEY, cheapest wins, ONE row

"DHL Express"           ->  dhl::express
"DHL Express International" -> dhl::express international
                                        DIFFERENT KEYS, TWO rows

"Aramex Express"  (aramex direct)   ->  aramex::express
"Aramex Exp DEL"  (skart)           ->  aramex::express del
                                        DIFFERENT KEYS, TWO rows (see 12.1)
```

---

## 8. Presentation (D1, and the label format)

Carrier is a distinct visual element, service name sits beneath it.

```
+----------------------------+
| DHL                        |
| Express Worldwide          |
| 3-4 days          Rs 8,200 |
+----------------------------+
```

Follow the existing shadcn card structure in
[RateResultCard.tsx](components/rate-calculator/RateResultCard.tsx). Per the
project UI convention, colour stays a functional cue only. Carrier identity is
carried by the logo and the name, not by a decorative tint. The existing
`vendorBadgeClass` helper is deleted, not recoloured.

---

## 9. Surfaces to change

Every confirmed leak site. All of these print a vendor name today.

| File | What leaks | Action |
| --- | --- | --- |
| [RateResultCard.tsx:145](components/rate-calculator/RateResultCard.tsx#L145) | `quote.vendorName` badge | Replace with carrier + service |
| [RateResultCard.tsx:142](components/rate-calculator/RateResultCard.tsx#L142) | `vendorBadgeClass(vendorId)` | Delete helper |
| [RateResultList.tsx:93](components/rate-calculator/RateResultList.tsx#L93) | Vendor filter chips | Carrier chips (D13) |
| [RateResultList.tsx:179](components/rate-calculator/RateResultList.tsx#L179) | Per-vendor error text | Hide from customers (D14) |
| [RateOptionPicker.tsx:162](components/booking/RateOptionPicker.tsx#L162) | `vendorName` badge | Carrier + service |
| [RateOptionPicker.tsx:53](components/booking/RateOptionPicker.tsx#L53) | React key includes `vendorId` | Key on carrier + service + price |
| [RateOptionPicker.tsx:267](components/booking/RateOptionPicker.tsx#L267) | Vendor filter list | Carrier list |
| [ServiceStep.tsx:250](components/booking/steps/ServiceStep.tsx#L250) | Prints raw `vendorId` in errors | Hide from customers |
| [ReviewStep.tsx:253](components/booking/steps/ReviewStep.tsx#L253) | `service.vendorName` badge | Carrier label |
| [ReviewStep.tsx:284](components/booking/steps/ReviewStep.tsx#L284) | `firstMile.vendorName` | Review separately, first mile may differ |
| [QuoteSheet.tsx:367](components/rate-calculator/QuoteSheet.tsx#L367) | `quote.vendorName` | Carrier label |
| [ComparePanel.tsx:90](components/rate-calculator/ComparePanel.tsx#L90) | `quote.vendorName` | Carrier label |
| [QuoteDocument.tsx:573](components/rate-calculator/QuoteDocument.tsx#L573) | Vendor row in the **customer PDF** | Remove the row |
| [QuoteDocument_v2.tsx:151](components/rate-calculator/QuoteDocument_v2.tsx#L151) | `Carrier: {vendorName}` in PDF | Use carrier label |
| [SendQuoteDialog.tsx:94](components/quotes/SendQuoteDialog.tsx#L94) | `Vendor: ...` in **customer email** | Remove the line |
| [QuotesTable.tsx:431](components/quotes/QuotesTable.tsx#L431) | Vendor column, tenant-facing | Carrier column |
| [ClientQuoteHistory.tsx:133](components/clients/clientDetailPage/ClientQuoteHistory.tsx#L133) | Vendor column, tenant-facing | Carrier column |
| [RecentQuotesTable.tsx:75](components/business-assoicates/detail-page/RecentQuotesTable.tsx#L75) | Vendor column, BA-facing | Carrier column |
| [AdminQuotesTable.tsx:330](components/quotes/AdminQuotesTable.tsx#L330) | Vendor column | **Leave as is**, Arena-only surface |

`QuoteDocument.tsx` and `SendQuoteDialog.tsx` are the highest priority in this
list. They leave our system and land in the customer's inbox, where we cannot
retract them.

### Open security finding, unrelated to the UI

`POST /api/rates` ([app/api/rates/route.ts](app/api/rates/route.ts)) has **no
authentication** and **no caller anywhere in the app**. It returns raw
`vendorName` and `productName` to anyone who posts to it. Masking the UI while
leaving this endpoint open defeats the whole feature. Decide one of: delete it,
put it behind auth, or apply the same masking. Recommendation: delete it, since
nothing calls it, and reintroduce it deliberately if an external partner ever
needs it.

---

## 10. Persistence (D12)

The database keeps the truth. Masking is a read-time concern.

**`Quote`** ([prisma/schema.prisma:172](prisma/schema.prisma#L172)) keeps
`vendorId`, `vendorName` and `productName` exactly as they are. Add:

```prisma
carrierCode String?  // "DHL" | "FEDEX" | "UPS" | "ARAMEX" | "ARENA" | "OTHER"
carrierLabel String? // customer-facing carrier name at quote time
serviceLabel String? // customer-facing service name at quote time
```

**`Shipment`** ([prisma/schema.prisma:742](prisma/schema.prisma#L742)) keeps
`selectedVendorId`, `selectedVendorName` and `selectedProductName`. Ops needs
these to actually place the booking. Add the same three `selected*` branded
fields.

All new columns are nullable and there is **no backfill** (D12). A row with a
null `carrierLabel` predates this feature and renders using the old fields. New
rows always populate them, so the customer-facing label is a snapshot frozen at
quote time and will not shift if a detection rule changes later. That mirrors the
existing `chargesSnapshot` philosophy already used across the schema.

---

## 11. Production safety (D16)

This is the revenue path. Three independent protections.

**Kill switch.** `RATE_BRANDING_ENABLED`, defaulting to `true`. Setting it to
`false` reverts every surface to raw vendor display with no deploy. Because
branding is a layer over untouched adapter output, this is genuinely a one-line
bypass and not a risky rollback.

**Fail closed.** If branding throws for a quote, that quote is **dropped** for
customers and **kept raw** for Arena staff, and the exception goes to Sentry with
the vendor id and raw product string. We lose one row, we never leak a name. Per
the project convention, every server action in this path reports to Sentry.

**Pinned tests.** `lib/rate-adapters/branding/__tests__/` holds a fixture table
of every raw string observed from every vendor mapped to its expected
`carrierCode`, `carrierLabel` and `serviceLabel`. Add a row whenever a new vendor
string appears in production. Cover explicitly:

- all real sKart strings, including the `DEL` suffixed ones
- `sKartedge` staying unbranded (D9)
- Arena Mode A token swap, including the single-token case
- `UPS` case sensitivity
- cross-vendor dedupe keeping the cheapest
- `"DHL Express"` and `"DHL Express International"` staying separate
- an unknown product being dropped for customers and kept for Arena staff
- **a snapshot assertion that no customer-facing payload contains any of
  `shipmozo`, `skart`, `sKart Express` or `Shipmozo`**, case insensitive

That last test is the real safety net. It catches a leak from a surface nobody
remembered to update.

---

## 12. Known tradeoffs

Accepted consequences of decisions above, recorded so nobody rediscovers them as
bugs.

**12.1 Hub codes produce near-duplicate rows and odd labels.** From D5. sKart's
`"Aramex Exp DEL"` and Shipmozo's `"Aramex Express"` will show as two Aramex rows
at different prices. Worse, `"DHL DEL"` renders as carrier `DHL` with service
`DEL`, which is meaningless to a customer. The fix is a one-line change:
strip a trailing token when it is in a known Indian gateway list (`DEL`, `BOM`,
`MAA`, `BLR`, `CCU`, `HYD`, `AMD`). Build the normalizer so this is a config
toggle. Revisit once real results are on screen.

**12.2 `sKartedge` still names a vendor.** From D9. A customer reading
`sKartedge` can find sKart and contact them directly, which is the exact risk
this feature exists to remove. Accepted deliberately because we have no
white-label permission from sKart. Getting that permission closes the last leak,
and the code should make enabling it a config flag.

**12.3 We white-label third-party carriers.** From D7. Shipmozo resells other
couriers, so a service like `"Xpressbees International"` becomes
`"Arena International"`. Our permission is from Shipmozo, not from the
underlying carrier. Worth a commercial check that Shipmozo's agreement covers
rebranding what they resell.

**12.4 Mode A can produce awkward names.** From D8. `"Xpressbees"` alone becomes
just `"Arena"`. Mode B fixes this properly. Ship Mode A, watch what real strings
arrive, then curate.

**12.5 Customers cannot tell that results are partial.** From D14. If two of
three vendors time out, the customer sees fewer options with no indication.
Arena staff still see the full error detail. Consider a neutral "showing N
options" line later that does not name anything.

---

## 13. Build order

Each step is independently shippable and testable.

1. `lib/rate-adapters/branding/` with carrier detection, normalization, dedupe
   and the fixture test suite. Pure functions, no UI, no database.
2. Wire into `getRates` behind `RATE_BRANDING_ENABLED`, add the `audience`
   option defaulting to `"customer"`.
3. Strip raw vendor fields in `getRatesAction` for non-Arena orgs.
4. Resolve `POST /api/rates` (section 9).
5. Update the two customer-facing outbound surfaces first: `QuoteDocument` and
   `SendQuoteDialog`.
6. Update the calculator UI: `RateResultCard`, `RateResultList`, `ComparePanel`,
   `QuoteSheet`.
7. Update the booking UI: `RateOptionPicker`, `ServiceStep`, `ReviewStep`.
8. Update the tenant and BA quote tables. Leave `AdminQuotesTable` alone.
9. Prisma migration for the branded columns, populate on write only.
10. Verify end to end as a tenant user and as an Arena user before enabling in
    production.

---

## 14. Revisit list

- Get sKart white-label permission, then flip `sKartedge` to Arena (12.2).
- Move Arena naming from Mode A to Mode B once real service names are known (D8).
- Reconsider hub code stripping after seeing live results (12.1).
- Extend masking to the domestic calculator (D15).
- Confirm Shipmozo's agreement covers carriers they resell (12.3).
