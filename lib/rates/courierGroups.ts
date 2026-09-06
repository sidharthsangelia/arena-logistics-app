/**
 * ONE CARD PER COURIER, NOT ONE PER WEIGHT SLAB
 * -----------------------------------------------------------------------------
 * Collapses a domestic quote list into one row per courier per mode, showing
 * the cheapest of each and keeping the rest reachable behind a disclosure.
 *
 * ── WHAT IS AND IS NOT HIDDEN ───────────────────────────────────────────────
 * Nothing is dropped. Every quote lands in exactly one group and every group
 * carries all of its members, so the "3 more Delhivery rates" disclosure is a
 * complete list, not a sample. This is a PRESENTATION transform over quotes the
 * server already returned; it must never be used to filter what a customer is
 * allowed to buy, because a quote that is not in the tree cannot be selected
 * and a booking that cannot re-find its quote fails at the vendor.
 *
 * ── WHY SURFACE AND AIR ARE DIFFERENT GROUPS ────────────────────────────────
 * A courier's surface rate is nearly always cheaper than its air rate, so
 * merging the two would make "cheapest wins" quietly bury the only fast option
 * that courier offers. Speed is the axis people actually choose on (it is
 * already the tab split on the booking step), so it stays visible: the group
 * key is family + mode.
 *
 * ── WHY THE TIE-BREAK IS SPELLED OUT ────────────────────────────────────────
 * The representative of a group is what the customer sees, clicks and buys, and
 * lib/booking/domesticCourierResolve.ts later re-quotes the same lane and
 * matches on the stored product name. If two quotes tie on price and we kept
 * whichever arrived first, a reshuffled vendor response would put a DIFFERENT
 * service on the card between one render and the next — the selection would
 * appear to change on its own, and a re-quote could resolve to the other one.
 * So ties break on fewer transit days, then the product name, then the vendor
 * id: total, deterministic, and independent of response ordering.
 */

import { classifyServiceMode, type ServiceMode } from "@/lib/booking/serviceMode";
import { courierFamily } from "./courierFamily";

/**
 * The minimum a quote must expose to be grouped. Structural rather than a
 * concrete RateQuote import so the booking picker and the results list can both
 * pass their own shapes without either growing a dependency on the other.
 */
export interface GroupableQuote {
  vendorId: string;
  productName: string;
  totalWithTax: number;
  tatDays: number;
}

export interface CourierGroup<Q extends GroupableQuote> {
  /** Stable identity for a React key: family + mode. */
  key: string;
  /** Group heading, e.g. "Delhivery". */
  label: string;
  /** Null when the caller did not ask for a surface/air split. */
  mode: ServiceMode | null;
  /** The cheapest member. This is the row that is rendered collapsed. */
  best: Q;
  /** Every other member, cheapest first. Empty for a group of one. */
  alternatives: Q[];
  /** best + alternatives. Saves every caller an off-by-one. */
  size: number;
}

export interface GroupQuotesOptions<Q extends GroupableQuote> {
  /**
   * The name the VIEWER sees, which is what the family is read from. Callers
   * that white-label (see lib/branding/serviceName.ts) must resolve the display
   * name first, or a group heading will print a sourcing vendor's brand.
   */
  displayName: (quote: Q) => string;
  /**
   * Split surface from air. On by default; pass false only where the mode is
   * meaningless (an international list, where everything flies).
   */
  splitByMode?: boolean;
}

/**
 * Group quotes by courier, cheapest first within a group and between groups.
 *
 * Input order does not affect the output. Callers may sort the result however
 * they like afterwards; the WITHIN-group order is fixed here because it decides
 * which quote is the representative.
 */
export function groupQuotesByCourier<Q extends GroupableQuote>(
  quotes: readonly Q[],
  options: GroupQuotesOptions<Q>,
): CourierGroup<Q>[] {
  const splitByMode = options.splitByMode ?? true;

  // Insertion-ordered so a caller that does not re-sort still gets a stable,
  // input-derived order rather than whatever the hash bucket happened to be.
  const buckets = new Map<
    string,
    { label: string; mode: ServiceMode | null; members: Q[] }
  >();

  for (const quote of quotes) {
    const name = options.displayName(quote);
    const family = courierFamily(name);
    const mode = splitByMode ? classifyServiceMode(name) : null;
    const key = mode ? `${family.key}::${mode}` : family.key;

    const bucket = buckets.get(key);
    if (bucket) bucket.members.push(quote);
    else buckets.set(key, { label: family.label, mode, members: [quote] });
  }

  const groups: CourierGroup<Q>[] = [];
  for (const [key, bucket] of buckets) {
    const members = [...bucket.members].sort(compareQuotes);
    const [best, ...alternatives] = members;
    groups.push({
      key,
      label: bucket.label,
      mode: bucket.mode,
      best,
      alternatives,
      size: members.length,
    });
  }

  return groups;
}

/**
 * Cheapest first, then fastest, then by name, then by vendor.
 *
 * Every step after price exists only to make the order TOTAL. Two quotes that
 * compare equal here really are indistinguishable to a customer, and the sort
 * is then stable regardless of the order the vendor returned them in.
 */
export function compareQuotes(a: GroupableQuote, b: GroupableQuote): number {
  if (a.totalWithTax !== b.totalWithTax) return a.totalWithTax - b.totalWithTax;

  // 0 means "transit time unknown" throughout the rate layer, so it sorts last
  // rather than first, which is what a naive numeric compare would do.
  const aTat = a.tatDays > 0 ? a.tatDays : Number.POSITIVE_INFINITY;
  const bTat = b.tatDays > 0 ? b.tatDays : Number.POSITIVE_INFINITY;
  if (aTat !== bTat) return aTat - bTat;

  if (a.productName !== b.productName) {
    return a.productName < b.productName ? -1 : 1;
  }
  if (a.vendorId !== b.vendorId) return a.vendorId < b.vendorId ? -1 : 1;
  return 0;
}
