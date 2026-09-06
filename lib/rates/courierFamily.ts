/**
 * WHICH COURIER IS THIS, REALLY?
 * -----------------------------------------------------------------------------
 * A domestic lane comes back as fifteen-odd rows that are really four or five
 * couriers sold at different weight slabs:
 *
 *     Delhivery Surface 0.5 Kg      Delhivery Surface 1 Kg
 *     Delhivery Surface 5 Kg        Delhivery Dense 10 Kg
 *     Amazon Shipping 0.5           Amazon Shipping 1 Kg
 *
 * Shown flat, that is a wall of near-duplicates the customer has to read to
 * find the one price that matters. This module answers "which courier is behind
 * this label" so the results list can collapse each courier to its cheapest row
 * and tuck the rest behind a disclosure.
 *
 * ── THE INVARIANT THAT MATTERS MOST ─────────────────────────────────────────
 * Two labels merge ONLY when we are confident they are the same courier. The
 * cost of a wrong merge is a rate the customer can no longer see at the price
 * they were shown; the cost of a missed merge is one extra card. So every
 * uncertain case falls back to "its own family", never to a guess.
 *
 * ── HOW A FAMILY IS DECIDED, IN ORDER ───────────────────────────────────────
 *   1. A known brand in the label wins, matched as a whole word against an
 *      ordered table. Longest/most specific patterns sit first, so
 *      "Blue Dart" is never read as two unknown words and "DP World" never
 *      resolves on "World" alone.
 *   2. Otherwise the label is stripped of the noise that distinguishes SLABS
 *      rather than couriers — weight tiers ("0.5 Kg", "10KG", "6CFT"), the
 *      surface/air marker, and B2B/B2C segment tags — and whatever survives
 *      becomes the family. Two labels then merge only when they are character
 *      for character the same courier once the slab is removed, which is the
 *      conservative answer for a courier we have never seen.
 *   3. A label that is nothing but noise keeps its original text as the family,
 *      so it still appears rather than merging into a nameless bucket.
 *
 * ── PASS THE NAME THE VIEWER SEES ───────────────────────────────────────────
 * Callers resolve `displayServiceName` / `brandServiceName` FIRST and hand the
 * result here, exactly as lib/carrierLogo.ts asks. The family label is rendered
 * as a group heading, so deriving it from a raw string would print a sourcing
 * vendor's brand in the one place carrierBranding.md exists to keep it out of.
 *
 * ── WHY THIS TABLE IS NOT lib/rateSweep/carrier.ts ──────────────────────────
 * That module normalises INTERNATIONAL labels for analytics, and its "OTHER"
 * bucket is a review queue. This one groups DOMESTIC labels on a live results
 * list, where an unrecognised courier must stand on its own rather than land in
 * a shared bucket with every other stranger. Same principle as the split
 * between rateSweep/carrier.ts and carrierLogo.ts: shared ordering ideas, no
 * shared table, because a change to one must not silently rewrite the other.
 */

/** A courier family: a stable grouping key plus the heading to render. */
export interface CourierFamily {
  /** Stable across renders and refetches. Safe to use in a React key. */
  key: string;
  /** Human-readable heading, e.g. "Delhivery". */
  label: string;
}

interface BrandRule {
  /** Grouping key. Uppercase, no spaces. */
  code: string;
  /** Display spelling, which is not always the vendor's spelling. */
  label: string;
  pattern: RegExp;
}

/**
 * Ordered; first match wins.
 *
 * Spellings follow lib/speedopost/courierCatalogue.ts so the same courier reads
 * identically whichever vendor quoted it — that is the whole point of grouping
 * across vendors. Patterns are word-bounded: a substring match would file
 * "Airtel Logistics" under a brand that merely shares three letters with it.
 *
 * Two-word brands come before any single-word rule that could shadow them.
 * "Delhivery Dense" resolves to DELHIVERY on purpose: it is Delhivery's own
 * network at a different density tier, and a customer choosing a courier is
 * choosing Delhivery either way. The tier is still visible on the row inside
 * the group.
 */
const BRAND_RULES: readonly BrandRule[] = [
  { code: "BLUEDART", label: "Blue Dart", pattern: /\bblue\s?dart\b/i },
  { code: "ECOMEXPRESS", label: "Ecom Express", pattern: /\becom\s?express\b/i },
  { code: "DPWORLD", label: "DP World", pattern: /\bdp\s?world\b/i },
  { code: "SHREEMARUTI", label: "Shree Maruti", pattern: /\bshree\s?maruti\b/i },
  { code: "CLASSICSTRIPES", label: "Classic Stripes", pattern: /\bclassic\s?stripes\b/i },
  { code: "INDIAPOST", label: "India Post", pattern: /\b(?:india\s?post|speed\s?post)\b/i },
  { code: "DELHIVERY", label: "Delhivery", pattern: /\bdelhivery\b/i },
  { code: "XPRESSBEES", label: "XpressBees", pattern: /\bxpressbees\b/i },
  { code: "SHADOWFAX", label: "Shadowfax", pattern: /\bshadowfax\b/i },
  { code: "AMAZON", label: "Amazon", pattern: /\bamazon\b/i },
  { code: "EKART", label: "Ekart", pattern: /\bekart\b/i },
  { code: "DTDC", label: "DTDC", pattern: /\bdtdc\b/i },
  { code: "SMARTR", label: "Smartr", pattern: /\bsmartr\b/i },
  // MOVIN is spelled both ways in vendor payloads; see lib/booking/serviceMode.ts.
  { code: "MOVIN", label: "MOVIN", pattern: /\bmovin[g]?\b/i },
  { code: "SAFEXPRESS", label: "Safexpress", pattern: /\bsafexpress\b/i },
  { code: "GATI", label: "Gati", pattern: /\bgati\b/i },
  { code: "TRACKON", label: "Trackon", pattern: /\btrackon\b/i },
  { code: "PROFESSIONAL", label: "Professional", pattern: /\bprofessional\b/i },
  { code: "NEXDROP", label: "NexDrop", pattern: /\bnexdrop\b/i },
  { code: "OXYZEN", label: "Oxyzen", pattern: /\boxyzen\b/i },
  { code: "FRETEX", label: "Fretex", pattern: /\bfretex\b/i },
  { code: "PARIVAHAN", label: "Parivahan", pattern: /\bparivahan\b/i },
  { code: "CRITICALOG", label: "Criticalog", pattern: /\bcriticalog\b/i },
  { code: "RAPIDSHYP", label: "Rapidshyp", pattern: /\brapidshyp\b/i },
  { code: "TCI", label: "TCI", pattern: /\btci\b/i },
  { code: "VRL", label: "VRL", pattern: /\bvrl\b/i },
  // Big-4 carriers do appear on domestic lists via resellers. Spellings match
  // lib/carrierLogo.ts; UPS stays case-sensitive there and here for the same
  // reason (a lowercase "ups" inside another word must never match).
  { code: "ARAMEX", label: "Aramex", pattern: /\baramex\b/i },
  { code: "DHL", label: "DHL", pattern: /\bdhl\b/i },
  { code: "FEDEX", label: "FedEx", pattern: /fed\s?ex/i },
  { code: "UPS", label: "UPS", pattern: /\bUPS\b/ },
];

/**
 * Noise that separates one SLAB of a service from another, never one courier
 * from another. Removed before the fallback family is taken.
 *
 * The weight rule has to cope with everything seen in live payloads:
 * "0.5 Kg", "1KG", "0.5 K.G", "10 kg", and the freight capacity tiers "6CFT" /
 * "10 CFT" that courierCatalogue.ts also strips. The number is required, so a
 * courier whose NAME contains "kg" is untouched.
 */
const SLAB_PATTERNS: readonly RegExp[] = [
  /\b\d+(?:\.\d+)?\s*k\.?\s?g\.?s?\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:gms?|grams?)\b/gi,
  /\b\d+(?:\.\d+)?\s*c\.?f\.?t\.?\b/gi,
  /\b\d+(?:\.\d+)?\s*(?:kilo|kilos|kilogram|kilograms)\b/gi,
  // A bare trailing number is a slab too: "Amazon Shipping 0.5".
  /\s\d+(?:\.\d+)?\s*$/g,
  /\b(?:surface|air|aircargo|air\s?cargo|airmail)\b/gi,
  /\b(?:b2b|b2c|d2c)\b/gi,
];

/** Left over once the noise is gone: separators with nothing between them. */
function collapse(value: string): string {
  return value
    .replace(/[\s_\-–—/|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Resolve a DISPLAY service name to the courier behind it.
 *
 * Never throws and never returns an empty key, so a caller can always group on
 * the result. A blank name is its own family rather than a shared "unknown"
 * bucket, for the same reason rule 2 exists: two labels we cannot read are not
 * evidence that they are the same courier.
 */
export function courierFamily(
  productName: string | null | undefined,
): CourierFamily {
  const name = (productName ?? "").trim();
  if (!name) return { key: "unnamed", label: "Courier service" };

  const brand = BRAND_RULES.find((rule) => rule.pattern.test(name));
  if (brand) return { key: brand.code, label: brand.label };

  let stripped = name;
  for (const pattern of SLAB_PATTERNS) {
    // Fresh RegExp per call: the literals above carry /g, and a shared /g
    // instance keeps `lastIndex` between calls, which makes the SECOND call
    // with the same string skip the match. Constructing here is the fix, and
    // the reason the table holds patterns rather than a prebuilt matcher.
    stripped = stripped.replace(new RegExp(pattern.source, pattern.flags), " ");
  }
  stripped = collapse(stripped);

  // Nothing survived the strip ("Air 5 Kg"), so the original label is the only
  // honest family for it.
  const family = stripped || collapse(name);
  return { key: `raw:${family.toLowerCase()}`, label: family };
}
