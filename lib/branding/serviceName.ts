import { isBigFourCarrier } from "@/lib/carrierLogo";

/**
 * brandServiceName
 * -----------------------------------------------------------------------------
 * White-labels Shipmozo's OWN-BRAND international services as "Arena" for
 * customer-facing display. We hold written white-label permission from Shipmozo
 * (carrierBranding.md D7), so a service the Shipmozo API returns as
 * "Shipmozo Drift" is shown to customers as "Arena Drift".
 *
 * Scope of the swap (business decisions, confirmed with the owner):
 *   - Big-4 carriers (DHL / FedEx / UPS / Aramex) keep their real carrier name.
 *     Detection is shared with the logo layer via isBigFourCarrier().
 *   - Only names that literally contain the "Shipmozo" token are rebranded.
 *     Third-party couriers Shipmozo resells (e.g. "Xpressbees International")
 *     are left untouched — we have no permission to rebrand those.
 *   - The "Shipmozo" token is replaced with "Arena"; the rest of the service
 *     name is kept verbatim ("Shipmozo Drift" -> "Arena Drift").
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

  // Only Shipmozo's own-brand services carry the "Shipmozo" token.
  if (!/\bshipmozo\b/i.test(name)) return name;

  return name
    .replace(/\bshipmozo\b/gi, "Arena")
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
