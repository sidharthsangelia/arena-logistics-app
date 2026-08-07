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
 *   4. A known brand gets its real spelling from the table below.
 *   5. Anything unknown is title-cased and shown anyway. A provider we have
 *      never seen must appear as an option, not vanish because it is missing
 *      from a table.
 *   6. B2B gets " Freight" appended, because it is a materially different
 *      service: palletised, dock delivery, appointment-based. B2C is left bare.
 *
 * Rule 5 is the important one. This file is a display polish layer, never a
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
 * Segment tags, stripped wherever they appear.
 *
 * Matched by shape rather than by membership because live data carries a
 * variant their documentation never showed: `DELHIVERY B2BC 10CFT`. `B2` plus
 * one or two letters covers B2B, B2C, B2X and B2BC without needing to predict
 * the next one.
 */
const SEGMENT_TAG = /^B2[A-Z]{1,2}$/;

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
      const glued = token.toUpperCase().match(/^(.*?)(B2[A-Z]{1,2})$/);
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
  const descriptor = rest.map(titleCaseToken).join(" ");

  let name = [brand, descriptor].filter(Boolean).join(" ").trim();

  if (!name) name = "Courier";

  // Never append a word the name already carries.
  if (suffix && !new RegExp(`\\b${suffix}\\b`, "i").test(name)) {
    name = `${name} ${suffix}`;
  }

  return name;
}
