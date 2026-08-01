import { isBigFourCarrier } from "@/lib/carrierLogo";

/**
 * WHITE-LABEL RULES
 * -----------------------------------------------------------------------------
 * One row per sourcing vendor whose OWN-BRAND services we are allowed to resell
 * under the Arena name. `enabled` is a permission flag, not a feature toggle:
 * flip it on only when that vendor has actually granted white-label rights,
 * because the swap is what a customer reads on a quote and an invoice.
 *
 *   - Shipmozo: written permission held (carrierBranding.md D7). ON.
 *   - ShipGlobal: no permission yet. OFF by default, so "ShipGlobal Direct"
 *     currently reaches customers verbatim. Set
 *     NEXT_PUBLIC_SHIPGLOBAL_WHITELABEL=true the day they sign off and every
 *     surface switches to "Arena Direct" at once — no code change, no deploy of
 *     the rendering components, and nothing to remember to update in six
 *     different files.
 *   - sKart: deliberately absent (D9). No permission, and adding a row here is
 *     the whole change if that ever comes.
 *
 * Vendors sold under a reseller's banner that we do NOT own (e.g. "Xpressbees
 * International" via Shipmozo) never appear here — the token has to be the
 * vendor's own brand.
 */
const WHITE_LABEL_RULES: { token: string; enabled: boolean }[] = [
  { token: "\\bshipmozo\\b", enabled: true },
  // "ShipGlobal" and the spaced "Ship Global" both count as their brand token.
  {
    token: "\\bship\\s?global\\b",
    enabled: process.env.NEXT_PUBLIC_SHIPGLOBAL_WHITELABEL === "true",
  },
];

/**
 * brandServiceName
 * -----------------------------------------------------------------------------
 * White-labels a sourcing vendor's OWN-BRAND international services as "Arena"
 * for customer-facing display, for every vendor whose row above is enabled. A
 * service the Shipmozo API returns as "Shipmozo Drift" is shown to customers as
 * "Arena Drift".
 *
 * Scope of the swap (business decisions, confirmed with the owner):
 *   - Big-4 carriers (DHL / FedEx / UPS / Aramex) keep their real carrier name.
 *     Detection is shared with the logo layer via isBigFourCarrier(). This is
 *     what lets ShipGlobal's "UPS Promotional" and "Fedex" rows through
 *     untouched while its own-brand rows are governed by the rule table.
 *   - Only names that literally contain an enabled vendor's brand token are
 *     rebranded. Third-party couriers a vendor resells (e.g. "Xpressbees
 *     International") are left untouched — we have no permission to rebrand
 *     those.
 *   - The brand token is replaced with "Arena"; the rest of the service name is
 *     kept verbatim ("Shipmozo Drift" -> "Arena Drift").
 *
 * IMPORTANT — this is a PURE, DISPLAY-ONLY transform:
 *   - Callers apply it only for customers (non-Arena orgs) and only on
 *     international surfaces. Arena staff and domestic rates keep the raw name.
 *   - It never touches persistence. The raw vendor `productName` is what gets
 *     stored on Quote/Shipment (the sourcing record of truth); the "Arena"
 *     label is computed at render time only.
 */
export function brandServiceName(productName: string | null | undefined): string {
  const name = (productName ?? "").trim();
  if (!name) return name;

  // Big-4 carriers are never rebranded.
  if (isBigFourCarrier(name)) return name;

  // Tokens are held as source strings, not RegExp literals, so the module can
  // never carry `lastIndex` state between calls on a shared /g/ instance.
  const rule = WHITE_LABEL_RULES.find(
    (r) => r.enabled && new RegExp(r.token, "i").test(name),
  );
  if (!rule) return name;

  return name
    .replace(new RegExp(rule.token, "gi"), "Arena")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * displayServiceName
 * -----------------------------------------------------------------------------
 * The single decision point for "which service name does THIS viewer see":
 *   - Arena staff (isArenaOrg) keep the raw vendor productName — they need the
 *     real sourcing detail.
 *   - Customers (every other org) get the white-labelled name via
 *     brandServiceName ("Shipmozo Drift" -> "Arena Drift"; everything else is
 *     returned untouched, so it's safe on domestic/big-4/third-party names).
 *
 * Use this on every customer-facing surface that renders a productName — the
 * calculator, the compare panel, the quote sheet, the quote PDF, and the
 * persisted quote lists — so the branding is applied consistently in one place.
 */
export function displayServiceName(
  productName: string | null | undefined,
  isArenaOrg: boolean,
): string {
  const raw = (productName ?? "").trim();
  return isArenaOrg ? raw : brandServiceName(raw);
}
