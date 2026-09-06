/**
 * lib/speedopost/courierCatalogue.ts
 * -----------------------------------------------------------------------------
 * Turns a SpeedoPost provider code into something a customer can read.
 *
 * SpeedoPost names providers with internal account labels: `DELHIVERYB2C_VK`,
 * `CLASSIC_STRIPES_B2B`, `MOVINB2B`, `DP World Surface`. Put straight on a rate
 * card those read as a leaked database row, and the same courier looks like a
 * different company depending on which of our vendors quoted it.
 *
 * The transform is PURE and DETERMINISTIC, which matters beyond looks:
 * `lib/booking/domesticCourierResolve.ts` re-quotes a lane and matches the
 * stored product name against the fresh one to recover a courier id. A name
 * that changed between the two quotes would silently fail that lookup.
 *
 * ── THE RULES, IN ORDER ─────────────────────────────────────────────────────
 *   1. Separators become spaces, so `CLASSIC_STRIPES_B2B` splits into words.
 *   2. Segment tags are removed wherever they appear, glued or standalone —
 *      `DELHIVERYB2C` is one token, `GATI B2B` is two.
 *   3. Account-suffix noise is removed. `_VK` is an account marker, not a
 *      service.
 *   4. A name that is PURELY an account label resolves to the carrier behind it
 *      via ACCOUNT_ALIASES. SpeedoPost sells one Delhivery through nine codes,
 *      eight of which are named `VAS...` and mention no carrier at all.
 *   5. A known brand gets its real spelling from the table below.
 *   6. Capacity slabs are dropped from the descriptor: `6CFT` and `10CFT` are
 *      price tiers on one Delhivery service, not two services.
 *   7. Anything still unknown is title-cased and shown anyway. A provider we
 *      have never seen must appear as an option, not vanish because it is
 *      missing from a table.
 *   8. B2B gets " Freight" appended, because it is a materially different
 *      service: palletised, dock delivery, appointment-based. B2C is left bare.
 *
 * Rules 4 and 6 exist so ONE carrier reads as one option. They feed
 * `dedupeSpeedoPostQuotes`, which collapses same-named quotes to the cheapest,
 * so making eleven Delhivery accounts share a name is also what makes the rate
 * card show the cheapest of them and only that one.
 *
 * Rule 7 is the important one. This file is a display polish layer, never a
 * filter. When SpeedoPost adds a provider, the worst outcome is an unpolished
 * name — never a missing quote.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { SpeedoPostOrderType } from "./types";

/**
 * Correct spellings, keyed by the raw name with every non-alphanumeric
 * character stripped and upper-cased. Longest keys are matched first so
 * `DELHIVERYDENSE` never resolves as `DELHIVERY`.
 */
const BRAND_NAMES: Record<string, string> = {
  DELHIVERYDENSE: "Delhivery Dense",
  DELHIVERY: "Delhivery",
  CLASSICSTRIPES: "Classic Stripes",
  DPWORLDSURFACE: "DP World Surface",
  DPWORLDAIR: "DP World Air",
  DPWORLD: "DP World",
  XPRESSBEES: "XpressBees",
  BLUEDART: "Blue Dart",
  ECOMEXPRESS: "Ecom Express",
  SAFEXPRESS: "Safexpress",
  SHADOWFAX: "Shadowfax",
  NEXDROP: "NexDrop",
  OXYZEN: "Oxyzen",
  SMARTR: "Smartr",
  MOVIN: "MOVIN",
  FRETEX: "Fretex",
  PARIVAHAN: "Parivahan",
  EKART: "Ekart",
  GATI: "Gati",
  DTDC: "DTDC",
  VRL: "VRL",
  TCI: "TCI",
};


/**
 * Tokens that carry no meaning for a customer.
 *
 * All three are observed in live responses: `VK` is an account marker on the
 * Delhivery lanes, `PNK` and `DEL` are origin-hub codes on the Blue Dart ones
 * (SpeedoPost returns `Bluedart_PNK` and `Bluedart_DEL` as separate providers).
 *
 * Listed explicitly rather than caught by a "short uppercase token" rule,
 * because such a rule would also eat `DP`, `TCI` and `VRL`. Extend it as new
 * markers turn up; the cost of missing one is an untidy name, never a hidden
 * quote.
 */
const NOISE_TOKENS = new Set(["VK", "PNK", "DEL"]);

/**
 * RAW NAMES THAT ARE AN ACCOUNT LABEL AND NOTHING ELSE.
 *
 * SpeedoPost resells one carrier through several of their own accounts, and
 * names each account rather than the carrier. Live `ServiceProvider` on
 * 2026-09-05 returns eight of these in the B2B segment, none of which contains
 * the word Delhivery, and all eight are Delhivery:
 *
 *     27019481 VASMARKETPLACE15 B2BC    32220410 VASCHANDIGARHRP B2BRC
 *     32220078 VASC6 B2BC               32220532 VASMARKETPLACE04 B2BC
 *     32220162 VASC4 B2BC               32220595 VASMARKET08 B2BC
 *     39114409 VASMARKETPLACECC B2BC    32220653 VASMARKETPLACE10 B2BC
 *
 * Left alone they read as eight unrelated couriers on the rate card, at eight
 * different prices, for what is one carrier. Confirmed by the operator on
 * 2026-09-05.
 *
 * MATCHED BY PREFIX, NOT BY LISTING THE CODES. The set demonstrably grows
 * (VASMARKETPLACECC carries the highest code of the eight, so it is the newest),
 * and a list would let the next account through as a stray ninth Delhivery under
 * a raw account name. The trade is stated plainly: if SpeedoPost ever puts a
 * carrier that is NOT Delhivery behind a VAS account, this mislabels it, which
 * is worse than an untidy name. That is a question for them the moment a VAS
 * provider appears whose price does not track the Delhivery ones.
 */
const ACCOUNT_ALIASES: { pattern: RegExp; brand: string }[] = [
  { pattern: /^VAS/, brand: "Delhivery" },
];

/**
 * Capacity slabs, dropped from the descriptor.
 *
 * `DELHIVERY B2B 6CFT` and `DELHIVERY B2B 10CFT` are cubic-feet pricing tiers on
 * one Delhivery service, not two services. SpeedoPost only quotes a slab that
 * can actually take the consignment, so every slab that comes back is a valid
 * way to ship the same boxes with the same carrier, and the only thing that
 * separates them is the price. Dropping the token lets the de-duplication in
 * rateShape collapse them to the cheapest, which is the honest answer: the
 * customer cannot act on the difference.
 *
 * The slab still reaches the booking, because that travels on the provider code
 * (`courierId`), never on the display name.
 */
const SLAB_TOKEN = /^\d+CFT$/;

/**
 * Segment tags, stripped wherever they appear.
 *
 * Matched by shape rather than by membership because live data carries variants
 * their documentation never showed: `DELHIVERY B2BC 10CFT` and
 * `VASCHANDIGARHRP B2BRC`. `B2` plus up to three letters covers B2B, B2C, B2X,
 * B2BC and B2BRC without needing to predict the next one, and no carrier brand
 * we have ever seen is shaped that way.
 */
const SEGMENT_TAG = /^B2[A-Z]{1,3}$/;

/** Words that are acronyms, not words, so title-casing must leave them alone. */
const ACRONYMS = new Set(["DP", "DTDC", "VRL", "TCI", "EMS", "DHL", "UPS", "NDD", "SDD"]);

/** Strip everything but letters and digits, then upper-case. */
function squash(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Split a raw provider name into meaningful words.
 *
 * Segment tags are peeled off glued tokens (`DELHIVERYB2C` -> `DELHIVERY`)
 * before the token is judged, because SpeedoPost writes them both ways.
 */
function tokenize(raw: string): string[] {
  return raw
    .split(/[^a-zA-Z0-9]+/)
    .flatMap((token) => {
      if (!token) return [];

      // Peel a trailing segment tag off a glued token.
      const glued = token.toUpperCase().match(/^(.*?)(B2[A-Z]{1,3})$/);
      const core = glued && glued[1] ? glued[1] : token;

      const upper = core.toUpperCase();
      if (!upper) return [];
      if (SEGMENT_TAG.test(upper)) return [];
      if (NOISE_TOKENS.has(upper)) return [];
      return [core];
    })
    .filter(Boolean);
}

/** "CLASSIC" -> "Classic", "DP" -> "DP", "6CFT" -> "6CFT". */
function titleCaseToken(token: string): string {
  const upper = token.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  // A token carrying a digit is a size or slab code, not a word: live names
  // include "6CFT" and "10CFT" (cubic-feet slabs on the Delhivery B2B lanes).
  // Sentence-casing those produces "6cft", which reads as a typo.
  if (/\d/.test(token)) return upper;
  // A token that is already mixed case is somebody's deliberate spelling
  // ("NexDrop"); leave it as it came.
  if (token !== upper && token !== token.toLowerCase()) return token;
  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

/**
 * Which network a raw provider name belongs to, read from the name itself.
 *
 * The rate path never needs this — it knows which segment it asked for — but
 * the tracking path does: SpeedoPost echoes a provider name with no segment
 * field beside it, and `GATI B2B` has to display as "Gati Freight" there for
 * the same reason it does on the rate card.
 *
 * B2C is the default because it is the larger network and the safer wrong
 * answer: labelling a freight consignment as a parcel understates the handling,
 * while the reverse tells a customer to expect a dock delivery that is not
 * coming.
 */
export function inferSpeedoPostSegment(
  rawProviderName: string | null | undefined,
): SpeedoPostOrderType {
  return /b2b/i.test(rawProviderName ?? "") ? "B2B" : "B2C";
}

/**
 * Peel a known brand off the FRONT of the token list.
 *
 * Longest match wins, so `DP World Surface` resolves as one brand rather than
 * `DP World` plus a leftover, and `Delhivery Surface 10 Kg` resolves as
 * `Delhivery` plus the descriptor that makes it a distinct product.
 */
function splitBrand(tokens: string[]): { brand: string | null; rest: string[] } {
  // An account label describes no service, so a match consumes the whole name
  // and leaves no descriptor behind: `VASMARKETPLACE15` is not a Delhivery
  // product called "Marketplace 15", it is Delhivery.
  const squashed = squash(tokens.join(""));
  for (const alias of ACCOUNT_ALIASES) {
    if (alias.pattern.test(squashed)) return { brand: alias.brand, rest: [] };
  }

  for (let take = tokens.length; take > 0; take--) {
    const key = squash(tokens.slice(0, take).join(""));
    if (BRAND_NAMES[key]) {
      return { brand: BRAND_NAMES[key], rest: tokens.slice(take) };
    }
  }
  return { brand: null, rest: tokens };
}

/**
 * The customer-facing name for one SpeedoPost provider.
 *
 * `orderType` decides only whether " Freight" is appended; it never changes the
 * brand itself. Passing it is what keeps a provider that appears in BOTH
 * segments from producing two identically-named quotes, which the booking
 * flow's name-matching resolution could not tell apart.
 */
export function speedoPostServiceName(
  rawProviderName: string | null | undefined,
  orderType: SpeedoPostOrderType,
): string {
  const raw = (rawProviderName ?? "").trim();
  const suffix = orderType === "B2B" ? "Freight" : "";

  if (!raw) {
    // Nameless provider. Still shown, still distinguishable by segment.
    return suffix ? `Courier ${suffix}` : "Courier";
  }

  const { brand, rest } = splitBrand(tokenize(raw));
  const descriptor = rest
    .filter((token) => !SLAB_TOKEN.test(token.toUpperCase()))
    .map(titleCaseToken)
    .join(" ");

  let name = [brand, descriptor].filter(Boolean).join(" ").trim();

  if (!name) name = "Courier";

  // Never append a word the name already carries.
  if (suffix && !new RegExp(`\\b${suffix}\\b`, "i").test(name)) {
    name = `${name} ${suffix}`;
  }

  return name;
}
