/**
 * WALLET CONFIG
 * -----------------------------------------------------------------------------
 * Single source of truth for wallet display thresholds so they aren't scattered
 * as magic numbers across pages.
 */

/**
 * Balance (in rupees) at or below which the dashboard surfaces a "low balance"
 * top-up nudge.
 *
 * PER-ORG FOLLOW-UP: this is a launch default. Business Associates run large
 * float balances where a flat ₹5,000 line is meaningless, so this is expected
 * to become an optional per-org override (Org.lowBalanceThreshold) later. Route
 * reads through `resolveLowBalanceThreshold` so that swap is a one-liner.
 */
export const DEFAULT_LOW_WALLET_BALANCE = 5000;

/**
 * Resolve the low-balance threshold for an org. Falls back to the default when
 * the org has no override configured.
 */
export function resolveLowBalanceThreshold(
  orgThreshold?: number | null,
): number {
  return orgThreshold ?? DEFAULT_LOW_WALLET_BALANCE;
}
