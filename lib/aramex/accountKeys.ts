/**
 * ARAMEX ACCOUNT KEYS AND LABELS
 * -----------------------------------------------------------------------------
 * The account list with NO environment access, so a client component can import
 * it to put a name next to a stored key without dragging credentials into a
 * bundle. ./accounts.ts holds the half that reads env and is server-only in
 * practice; this half is data.
 *
 * Read the header of ./accounts.ts before changing anything here. The short
 * version: these keys are persisted on shipments and rate snapshots, so they may
 * be added to and retired, but never renamed.
 */

export interface AramexAccountDefinition {
  /** Stable, persisted onto Shipment.selectedCourierId. Never rename. */
  key: string;
  /**
   * Arena-staff-only wording, for a standalone field that has to name the
   * vendor itself (the ops booking page's "Vendor account"). Never rendered on
   * a customer surface.
   */
  adminLabel: string;
  /**
   * Arena-staff-only wording for somewhere the vendor is ALREADY named, such as
   * the rate calculator's card, where the badge beside it reads "Aramex".
   * Repeating the vendor there is noise on a list an operator scans.
   *
   * Says "account" rather than standing alone as "UPS": beside a carrier logo
   * and an "Aramex" badge, a bare "UPS" reads as the carrier rather than as
   * which of our contracts quoted.
   */
  shortLabel: string;
  /**
   * Appended to every ARAMEX_* variable name. "" means the unsuffixed pair,
   * which is the account this integration had before there was more than one —
   * so the original env vars keep working untouched.
   */
  envSuffix: string;
}

export const ARAMEX_ACCOUNT_DEFINITIONS: readonly AramexAccountDefinition[] = [
  {
    key: "aramex-direct",
    adminLabel: "Aramex account",
    shortLabel: "Direct account",
    envSuffix: "",
  },
  {
    key: "aramex-ups",
    adminLabel: "Aramex (UPS) account",
    shortLabel: "UPS account",
    envSuffix: "_UPS",
  },
];

/**
 * ARENA-STAFF-ONLY label for a stored account key, or null when the key is not
 * one of ours.
 *
 * Null for every other vendor's courier id, which is what lets an ops screen
 * call this unconditionally on `selectedCourierId` and render the field only
 * when it says something. Never call it on a customer-facing surface: naming the
 * account is exactly what carrierBranding.md exists to prevent.
 */
export function aramexAccountLabel(
  courierId: string | null | undefined,
): string | null {
  const key = courierId?.trim();
  if (!key) return null;
  return (
    ARAMEX_ACCOUNT_DEFINITIONS.find((d) => d.key === key)?.adminLabel ?? null
  );
}

/**
 * ARENA-STAFF-ONLY short label, for a surface that already names the vendor.
 *
 * Same contract as aramexAccountLabel: null for every other vendor's courier
 * id, so a caller can render it unconditionally and get nothing where there is
 * nothing to say. Never call it on a customer-facing surface.
 */
export function aramexAccountShortLabel(
  courierId: string | null | undefined,
): string | null {
  const key = courierId?.trim();
  if (!key) return null;
  return (
    ARAMEX_ACCOUNT_DEFINITIONS.find((d) => d.key === key)?.shortLabel ?? null
  );
}

/**
 * What the customer is told, whichever account wins.
 *
 * DELIBERATELY ACCOUNT-NEUTRAL, and this is a commercial rule rather than a
 * cosmetic one. Which of our Aramex contracts a parcel flies on is our own
 * business: carrierBranding.md exists to stop a customer learning how we source
 * a shipment, and "Aramex (UPS)" on a quote tells them precisely that.
 *
 * It is also why this string must not name UPS even though the UPS-channel
 * account genuinely moves parcels on UPS. `brandServiceName` passes big-4
 * carrier names straight through to customers untouched (that is its rule 1),
 * so a "UPS" in here would not be masked — it would be published.
 *
 * The value is unchanged from the single-account integration on purpose. It is
 * matched on by the rate sweep's carrier classifier and stored verbatim on
 * every shipment ever quoted by Aramex; there is nothing to gain from churning
 * it and a quiet reclassification to lose.
 */
export const ARAMEX_CUSTOMER_PRODUCT_NAME = "Aramex Express";

/**
 * True when a stored courier id is one of Arena's Aramex account keys.
 *
 * Exists for the publication boundary. `courierId` is normally a VENDOR's own
 * opaque service id and the partner API publishes it verbatim, promising it
 * "carries no branding". Aramex's is not a vendor service id at all — it is
 * Arena's internal name for which of our contracts quoted, and "aramex-ups"
 * would tell an external integrator exactly how we sourced the rate.
 *
 * So the key stays readable for the people who need it (ops, reconciling an
 * invoice) and is suppressed where it would be published. Same principle as
 * brandServiceName: mask at the boundary, never at the adapter, so the
 * database stays the sourcing record of truth.
 */
export function isAramexAccountKey(
  courierId: string | null | undefined,
): boolean {
  return aramexAccountLabel(courierId) !== null;
}
