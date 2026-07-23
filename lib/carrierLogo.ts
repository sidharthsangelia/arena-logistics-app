/**
 * carrierLogo / carrier detection
 *
 * `carrierLogo` maps a rate's product name to one of the big-4 carrier logos,
 * purely as a lightweight visual cue on international rate cards. When none of
 * the four is detected, it falls back to the Arena logo.
 *
 * `isBigFourCarrier` exposes the same detection (minus the logo) so other
 * presentation-layer code — e.g. white-labelling Shipmozo's own-brand services
 * as "Arena" (see lib/branding/serviceName.ts) — can share one source of truth
 * for "is this actually a DHL/FedEx/UPS/Aramex service".
 *
 * Detection rules and their order mirror carrierBranding.md §5: Aramex is
 * matched first (it is also a vendor name), and UPS is case-sensitive on
 * purpose so a lowercase "ups" inside another word never matches.
 *
 * Logos live in /public and are served from the site root. Each entry carries
 * its intrinsic pixel dimensions so `next/image` can compute the aspect ratio
 * and serve an optimised, correctly-sized asset instead of shipping the full
 * source PNG (the Arena logo alone is ~670KB) to render at 16px tall.
 */
export type CarrierLogo = { src: string; alt: string; width: number; height: number };

// Ordered detection rules. First match wins. Kept as one list so carrierLogo
// and isBigFourCarrier can never drift apart. UPS is case-sensitive on purpose.
const CARRIER_RULES: { pattern: RegExp; logo: CarrierLogo }[] = [
  { pattern: /\baramex\b/i, logo: { src: "/aramex.png", alt: "Aramex", width: 1413, height: 360 } },
  { pattern: /\bdhl\b/i, logo: { src: "/dhl.png", alt: "DHL", width: 900, height: 295 } },
  { pattern: /fed\s?ex/i, logo: { src: "/fedex.png", alt: "FedEx", width: 1198, height: 457 } },
  { pattern: /\bUPS\b/, logo: { src: "/ups.png", alt: "UPS", width: 300, height: 355 } },
];

export const ARENA_LOGO: CarrierLogo = {
  src: "/arena_logo.png",
  alt: "Arena",
  width: 1600,
  height: 536,
};

export function carrierLogo(productName: string | null | undefined): CarrierLogo {
  const name = productName ?? "";
  return CARRIER_RULES.find((r) => r.pattern.test(name))?.logo ?? ARENA_LOGO;
}

/**
 * True when the product name belongs to one of the big-4 carriers Arena does
 * NOT white-label (DHL, FedEx, UPS, Aramex). Those keep their real carrier name
 * on customer-facing surfaces; only non-big-4 Shipmozo own-brand services are
 * rebranded to Arena.
 */
export function isBigFourCarrier(productName: string | null | undefined): boolean {
  const name = productName ?? "";
  return CARRIER_RULES.some((r) => r.pattern.test(name));
}

// ---------------------------------------------------------------------------
// Brand grouping — used by the international results brand filter so customers
// can narrow to "all DHL services", "all Aramex services", etc. Shares the
// exact same detection rules as the logo above, so the filter and the logo can
// never disagree about what a service is.
// ---------------------------------------------------------------------------

export type CarrierBrand = "Aramex" | "DHL" | "FedEx" | "UPS";

/** Sentinel brand key for everything that is not a big-4 carrier. */
export const OTHER_BRAND = "OTHER" as const;

/** Big-4 brand names in detection order, each with its logo for chips. */
export const CARRIER_BRANDS: { brand: CarrierBrand; logo: CarrierLogo }[] =
  CARRIER_RULES.map((r) => ({ brand: r.logo.alt as CarrierBrand, logo: r.logo }));

/**
 * Resolve a product name to its big-4 brand, or `OTHER_BRAND` when it is one of
 * Arena's own-brand / third-party services.
 */
export function carrierBrand(
  productName: string | null | undefined,
): CarrierBrand | typeof OTHER_BRAND {
  const name = productName ?? "";
  const rule = CARRIER_RULES.find((r) => r.pattern.test(name));
  return rule ? (rule.logo.alt as CarrierBrand) : OTHER_BRAND;
}
