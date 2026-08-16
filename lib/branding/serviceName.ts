import { isBigFourCarrier } from "@/lib/carrierLogo";

/**
 * SOURCING-VENDOR BRAND RULES
 * -----------------------------------------------------------------------------
 * One row per company we buy rates from. Two independent questions per row, and
 * conflating them is what let a leak survive:
 *
 *   `token`       — how that vendor's brand is spelled inside a service label.
 *                   Every vendor gets a row, whether or not we may rebrand it,
 *                   because the token is what must never reach a customer.
 *
 *   `whiteLabel`  — whether we hold written permission to resell that vendor's
 *                   OWN-BRAND services under the Arena name. A permission flag,
 *                   not a feature toggle: it decides what a customer reads on a
 *                   quote and an invoice.
 *
 *     - Shipmozo: written permission held (carrierBranding.md D7). ON.
 *     - ShipGlobal: ON (D17). "ShipGlobal Direct" reads as "Arena Direct".
 *       Deliberately NOT behind an env flag: a missing or mistyped variable in
 *       production would fail open and leak the vendor on the revenue path.
 *     - sKart: OFF (D9). No white-label permission, so its own-brand services
 *       may not be sold as Arena.
 *     - SpeedoPost: OFF. Same position as sKart. Its labels normally name the
 *       underlying courier ("Blue Dart Freight"), so the row is a backstop for
 *       the day one comes back naming SpeedoPost itself.
 *
 * ── WHY EVERY VENDOR HAS A ROW, INCLUDING THE ONES WE MAY NOT REBRAND ───────
 * This table used to hold only the two vendors we may rebrand, which made it a
 * permission list masquerading as a safety net: a label from any OTHER vendor
 * passed through verbatim. carrierBranding.md 12.2 recorded the consequence as
 * an accepted tradeoff — a customer reading "sKartedge" can search for sKart and
 * buy direct, which is the exact risk this whole feature exists to remove.
 *
 * PRODUCTION-READINESS-TENANT.md H3 asks for that hole closed, so the table is
 * now a deny-list first and a permission list second. Permission decides WHAT
 * replaces the token; it no longer decides WHETHER the token is removed.
 *
 * ── WHY THE UNLICENSED CASE STRIPS RATHER THAN SWAPS ────────────────────────
 * Replacing "sKart" with "Arena" would close the leak and break D9 in the same
 * line — we would be selling their own-brand network under our name without the
 * agreement that permits it. So an unlicensed token is REMOVED and the rest of
 * the label is kept: "sKart Self International" reads as "Self International",
 * which names no one and claims nothing.
 *
 * Vendors sold under a reseller's banner that we do not own (e.g. "Xpressbees
 * International" via Shipmozo) never appear here — the token has to be the
 * SOURCING vendor's own brand, not a third party's.
 */
interface VendorBrandRule {
  /** Matches `vendorId` in lib/types.ts, so the two lists can be diffed by eye. */
  vendorId: string;
  /**
   * Regex source, not a literal, so the module can never carry `lastIndex`
   * state between calls on a shared /g/ instance.
   *
   * Each pattern ends in `\w*` on purpose. A trailing `\b` would match "sKart"
   * but not "sKartedge", because there is no word boundary in the middle of a
   * word — and "sKartedge" is a real service name. Consuming the rest of the
   * word removes the whole brand rather than leaving the "edge" half behind.
   */
  token: string;
  whiteLabel: boolean;
}

const VENDOR_BRAND_RULES: readonly VendorBrandRule[] = [
  { vendorId: "shipmozo", token: "\\bshipmozo\\w*", whiteLabel: true },
  // "ShipGlobal" and the spaced "Ship Global" both count as their brand token.
  { vendorId: "shipglobal", token: "\\bship\\s?global\\w*", whiteLabel: true },
  // "sKart", "Skart", "sKartedge", "sKart Express".
  { vendorId: "skart", token: "\\bs\\s?kart\\w*", whiteLabel: false },
  { vendorId: "speedopost", token: "\\bspeedo\\s?post\\w*", whiteLabel: false },
];

/**
 * What a customer sees when redaction consumed the entire label.
 *
 * Only reachable for an unlicensed vendor's own-brand service whose name is
 * nothing but the brand ("sKartedge"). Deliberately says nothing we cannot
 * stand behind: not "Arena" (D9 forbids it without permission), and no speed or
 * duty claim, because the label is exactly where those would be a lie.
 *
 * carrierBranding.md §5 Mode B is the upgrade path — a transit-day tier, which
 * needs `tatDays` and therefore a wider signature than a string in and a string
 * out. Worth doing when a curated map lands; not worth widening 12 call sites
 * for a case one vendor's naming can reach.
 */
const REDACTED_SERVICE_LABEL = "Courier service";

/** Whitespace left behind by a removed token is not the customer's problem. */
function collapse(value: string): string {
  return value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([),.\-–—])/g, "$1")
    .replace(/^[\s\-–—·|]+|[\s\-–—·|]+$/g, "")
    .trim();
}

/**
 * brandServiceName
 * -----------------------------------------------------------------------------
 * Turns a raw vendor service label into one that is safe to show a customer.
 *
 * The invariant, and the only thing worth remembering: **no sourcing vendor's
 * brand survives this function.** Everything below is how that is achieved
 * without misdescribing the shipment.
 *
 * Three rules decide the output, in this order:
 *
 *   1. A big-4 carrier (DHL / FedEx / UPS / Aramex) keeps its real carrier
 *      name. Detection is shared with the logo layer via isBigFourCarrier().
 *      This is what lets ShipGlobal's "UPS Promotional" through untouched.
 *
 *   2. Any sourcing-vendor brand token is removed. Where we hold white-label
 *      rights AND the label does not already name a real carrier, "Arena" takes
 *      its place ("Shipmozo Drift" -> "Arena Drift"). Otherwise the token is
 *      simply dropped.
 *
 *      The big-4 interaction is the subtle part: "Shipmozo DHL Express" must
 *      become "DHL Express", not "Arena DHL Express". Rule 1 says the carrier
 *      name stays, so the reseller's brand is dropped rather than swapped —
 *      claiming a DHL shipment as an Arena-branded service would be the same
 *      misdescription rule 1 exists to prevent.
 *
 *   3. If nothing survives, the neutral label above is used.
 *
 * Third-party couriers a vendor resells ("Xpressbees International") carry no
 * token and come through untouched — we have no permission to rebrand those.
 *
 * IMPORTANT — this is a PURE, DISPLAY-ONLY transform:
 *   - Callers apply it only for customers (non-Arena orgs). Arena staff keep the
 *     raw name; see displayServiceName.
 *   - It never touches persistence. The raw vendor `productName` is what gets
 *     stored on Quote/Shipment (the sourcing record of truth, D12) and it is
 *     also the key the booking layer matches against vendor courier catalogues
 *     (lib/booking-adapters/vendors/skart/*). Sanitising at the adapter, as the
 *     H3 note first suggested, would corrupt that key and silently break
 *     booking; the boundary is here, at render time, where display is the only
 *     thing that changes.
 */
export function brandServiceName(productName: string | null | undefined): string {
  const name = (productName ?? "").trim();
  if (!name) return name;

  // A label naming a real carrier keeps that carrier, so a vendor token in it is
  // dropped rather than swapped for "Arena".
  const namesRealCarrier = isBigFourCarrier(name);

  let out = name;
  for (const rule of VENDOR_BRAND_RULES) {
    if (!new RegExp(rule.token, "i").test(out)) continue;
    const replacement = rule.whiteLabel && !namesRealCarrier ? "Arena" : " ";
    out = out.replace(new RegExp(rule.token, "gi"), replacement);
  }

  out = collapse(out);
  return out || REDACTED_SERVICE_LABEL;
}

/**
 * displayServiceName
 * -----------------------------------------------------------------------------
 * The single decision point for "which service name does THIS viewer see":
 *   - Arena staff (isArenaOrg) keep the raw vendor productName — they need the
 *     real sourcing detail.
 *   - Customers (every other org) get the masked name via brandServiceName.
 *
 * Use this on every customer-facing surface that renders a productName — the
 * calculator, the compare panel, the quote sheet, the quote PDF, the persisted
 * quote lists, and every post-booking surface — so the branding is applied
 * consistently in one place.
 */
export function displayServiceName(
  productName: string | null | undefined,
  isArenaOrg: boolean,
): string {
  const raw = (productName ?? "").trim();
  return isArenaOrg ? raw : brandServiceName(raw);
}

/**
 * containsVendorBrand
 * -----------------------------------------------------------------------------
 * True when a string still names one of our sourcing vendors. Exported for the
 * guard tests carrierBranding.md §11 asks for: the assertion that no
 * customer-facing payload contains a vendor token is only as good as its list of
 * tokens, and duplicating that list in the test would let the two drift apart in
 * exactly the direction that hides a leak.
 */
export function containsVendorBrand(value: string | null | undefined): boolean {
  const text = value ?? "";
  if (!text) return false;
  return VENDOR_BRAND_RULES.some((rule) => new RegExp(rule.token, "i").test(text));
}
