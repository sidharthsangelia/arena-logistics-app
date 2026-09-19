/**
 * lib/publicApi/markup.ts
 * -----------------------------------------------------------------------------
 * What margin a public-API quote carries, and where that number comes from.
 *
 * The tenant calculator reads `Org.markupPercent` from the database, because
 * every tenant has a different one. The public API has no tenant: the caller is
 * an API key belonging to another website of ours. So the number comes from the
 * environment instead, resolved in this order, first hit wins:
 *
 *   1. the consumer's own override in ARENA_API_KEYS (markupIntlPercent /
 *      markupDomesticPercent)
 *   2. ARENA_API_MARKUP_PERCENT_INTL  /  ARENA_API_MARKUP_PERCENT_DOMESTIC
 *   3. ARENA_API_MARKUP_PERCENT
 *   4. DEFAULT_API_MARKUP_PERCENT below
 *
 * Only the resolution lives here. How a percentage becomes a sell price is
 * lib/pricing/markup.ts, the same module the tenant calculator and the booking
 * step use, so the public API can never drift into its own arithmetic.
 *
 * ── WHY ZERO IS REFUSED BY DEFAULT ──────────────────────────────────────────
 * A rate endpoint quoting at 0% markup is not "a free quote", it is our buying
 * price published over HTTP to whoever holds the key. A typo that empties the
 * env var must not be able to do that quietly, so an explicit 0 needs an
 * explicit second switch:
 *
 *   ARENA_API_ALLOW_ZERO_MARKUP=true
 *
 * Without it a configured 0 is treated as misconfiguration, the route answers
 * MISCONFIGURED, and no cost leaves the building. Failing loudly is the correct
 * direction here: a partner site showing an error for ten minutes is recoverable,
 * a competitor reading our cost book is not.
 *
 * ── WHY THERE IS A BUILT-IN DEFAULT AT ALL ──────────────────────────────────
 * An UNSET variable is different from one set to 0. Unset means nobody has made
 * a decision yet, and the safe reading of that is our standard margin, which is
 * what the tenant path already falls back to (`?? 30` in rates.action.ts). Set
 * to 0 means somebody made a decision, and that one has to be deliberate.
 */

import type { ApiConsumer } from "./keys";

/**
 * Used when no markup variable is set at all. Matches the fallback the tenant
 * calculator uses for an org with no markup on record, so an unconfigured
 * public API is never cheaper than an unconfigured tenant.
 */
export const DEFAULT_API_MARKUP_PERCENT = 30;

export type MarkupScope = "international" | "domestic";

export type MarkupResolution =
  | {
      ok: true;
      percent: number;
      /** Where the number came from, for the log line. Never sent to callers. */
      source: "consumer" | "scope-env" | "shared-env" | "default";
    }
  | {
      ok: false;
      /** Operator-facing reason. Never sent to callers verbatim. */
      reason: string;
    };

/**
 * Read one env var as a percentage.
 *
 * Returns `undefined` for unset/blank (fall through to the next source) and
 * `null` for set-but-unusable (a decision was attempted and it is wrong, so
 * stop rather than fall through to a bigger number and quote a price nobody
 * chose).
 */
function readEnvPercent(name: string): number | undefined | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;

  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 500) return null;

  return n;
}

function zeroAllowed(): boolean {
  return (process.env.ARENA_API_ALLOW_ZERO_MARKUP ?? "").trim().toLowerCase() === "true";
}

export function resolveApiMarkup(
  consumer: ApiConsumer,
  scope: MarkupScope,
): MarkupResolution {
  const consumerPercent =
    scope === "international" ? consumer.markupIntlPercent : consumer.markupDomesticPercent;

  if (consumerPercent !== undefined) {
    return guard(consumerPercent, "consumer", `key "${consumer.name}"`);
  }

  const scopeVar =
    scope === "international"
      ? "ARENA_API_MARKUP_PERCENT_INTL"
      : "ARENA_API_MARKUP_PERCENT_DOMESTIC";

  const scoped = readEnvPercent(scopeVar);
  if (scoped === null) {
    return {
      ok: false,
      reason: `${scopeVar} is set to a value that is not a percentage between 0 and 500.`,
    };
  }
  if (scoped !== undefined) return guard(scoped, "scope-env", scopeVar);

  const shared = readEnvPercent("ARENA_API_MARKUP_PERCENT");
  if (shared === null) {
    return {
      ok: false,
      reason:
        "ARENA_API_MARKUP_PERCENT is set to a value that is not a percentage between 0 and 500.",
    };
  }
  if (shared !== undefined) return guard(shared, "shared-env", "ARENA_API_MARKUP_PERCENT");

  return { ok: true, percent: DEFAULT_API_MARKUP_PERCENT, source: "default" };
}

function guard(
  percent: number,
  source: "consumer" | "scope-env" | "shared-env",
  where: string,
): MarkupResolution {
  if (percent === 0 && !zeroAllowed()) {
    return {
      ok: false,
      reason:
        `${where} sets the public API markup to 0%, which would quote raw vendor cost. ` +
        "Set a markup, or set ARENA_API_ALLOW_ZERO_MARKUP=true if that is genuinely intended.",
    };
  }

  return { ok: true, percent, source };
}
