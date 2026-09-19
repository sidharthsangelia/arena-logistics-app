/**
 * lib/publicApi/keys.ts
 * -----------------------------------------------------------------------------
 * Who is calling /api/v1, decided from one env var.
 *
 * ── THE CONFIG ──────────────────────────────────────────────────────────────
 *   ARENA_API_KEYS='[{"name":"arena-web","key":"ak_live_…","orgId":"org_…",
 *                     "markupIntlPercent":35,"markupDomesticPercent":25,
 *                     "scopes":["rates:international","rates:domestic","track"]}]'
 *
 * A bare string is also accepted (`ARENA_API_KEYS=ak_live_…`, or several
 * comma-separated) and is read as unnamed consumers with every scope and no
 * org binding. That form exists so a first integration is one line, not a JSON
 * escaping exercise; the object form is what you want the moment there are two
 * consumers, because only it can tell them apart in the logs.
 *
 * ── WHY PARSING IS CACHED AND WHY THAT IS SAFE ──────────────────────────────
 * Parsed once per process and memoised against the raw string. If the env value
 * changes the memo misses and it re-parses, so a redeploy with a rotated key
 * takes effect immediately and there is no stale-key window.
 *
 * ── WHY THE COMPARISON IS TIMING-SAFE ───────────────────────────────────────
 * `===` on secrets leaks length and prefix through response timing. Both sides
 * are hashed to a fixed 32 bytes first, so timingSafeEqual gets equal-length
 * buffers whatever the caller sends, and no comparison can be short-circuited.
 *
 * ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ───────────────────────────────
 * It never returns the key material, and never logs it. An authenticated
 * consumer is identified downstream by `name` alone, which is also what goes
 * into rate-limit keys and Sentry tags.
 */

import { createHash, timingSafeEqual } from "node:crypto";

/** Endpoints a key may be permitted to call. */
export type ApiScope = "rates:international" | "rates:domestic" | "track";

export const ALL_API_SCOPES: ApiScope[] = [
  "rates:international",
  "rates:domestic",
  "track",
];

/** One configured caller. Never contains the key itself. */
export interface ApiConsumer {
  /** Stable label for logs, rate-limit keys and Sentry. */
  name: string;
  /**
   * Clerk org this key may resolve Arena shipment numbers for. Absent means the
   * key can still track a carrier AWB (that is the carrier's number, not ours)
   * but can never look up an ARN. See lib/publicApi/tracking.ts.
   */
  orgId?: string;
  /** Overrides ARENA_API_MARKUP_PERCENT_INTL for this consumer. */
  markupIntlPercent?: number;
  /** Overrides ARENA_API_MARKUP_PERCENT_DOMESTIC for this consumer. */
  markupDomesticPercent?: number;
  scopes: ApiScope[];
}

/** A consumer plus the digest we match an incoming key against. */
interface ConfiguredKey extends ApiConsumer {
  digest: Buffer;
}

interface ParsedKeys {
  /** Raw env string these were parsed from, so the memo can detect a change. */
  source: string;
  keys: ConfiguredKey[];
  /** Config that could not be read. Surfaced once at boot, never per request. */
  problems: string[];
}

const globalForApiKeys = globalThis as unknown as {
  __arenaApiKeys?: ParsedKeys;
};

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function isScope(value: unknown): value is ApiScope {
  return (
    value === "rates:international" ||
    value === "rates:domestic" ||
    value === "track"
  );
}

/**
 * A percentage from config, or undefined when absent/unusable.
 *
 * Deliberately strict: a markup that cannot be read must NOT silently become
 * zero, because zero markup on a rate endpoint publishes our buying cost. An
 * unreadable value falls through to the env defaults, which have their own
 * guard (lib/publicApi/markup.ts).
 */
function readPercent(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 500) return undefined;
  return n;
}

function parseKeys(raw: string): ParsedKeys {
  const trimmed = raw.trim();
  const problems: string[] = [];

  if (!trimmed) return { source: raw, keys: [], problems };

  // -- Object form ---------------------------------------------------------
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        source: raw,
        keys: [],
        // No key material in the message: this string can reach a log.
        problems: ["ARENA_API_KEYS looks like JSON but does not parse. No key is active."],
      };
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const keys: ConfiguredKey[] = [];

    entries.forEach((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        problems.push(`ARENA_API_KEYS[${index}] is not an object. Skipped.`);
        return;
      }

      const row = entry as Record<string, unknown>;
      const key = typeof row.key === "string" ? row.key.trim() : "";

      if (key.length < 16) {
        // Length, not the value: a short key is a config mistake worth naming,
        // and 16 chars is below anything a generator would produce.
        problems.push(
          `ARENA_API_KEYS[${index}] has no "key", or one shorter than 16 characters. Skipped.`,
        );
        return;
      }

      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : `consumer-${index}`;

      const rawScopes = Array.isArray(row.scopes) ? row.scopes.filter(isScope) : [];

      keys.push({
        name,
        digest: sha256(key),
        orgId: typeof row.orgId === "string" && row.orgId.trim() ? row.orgId.trim() : undefined,
        markupIntlPercent: readPercent(row.markupIntlPercent),
        markupDomesticPercent: readPercent(row.markupDomesticPercent),
        // An entry that lists no usable scope gets all of them, which is the
        // same default as the bare-string form. Omitting `scopes` is how you
        // say "everything"; listing a nonsense scope is a typo, and a typo that
        // silently disabled every endpoint would read as an outage.
        scopes: rawScopes.length > 0 ? rawScopes : [...ALL_API_SCOPES],
      });
    });

    return { source: raw, keys, problems };
  }

  // -- Bare string form ----------------------------------------------------
  const keys = trimmed
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 16)
    .map((k, index) => ({
      name: `consumer-${index}`,
      digest: sha256(k),
      scopes: [...ALL_API_SCOPES],
    }));

  if (keys.length === 0) {
    problems.push("ARENA_API_KEYS is set but contains no key of 16+ characters.");
  }

  return { source: raw, keys, problems };
}

function loadKeys(): ParsedKeys {
  const raw = process.env.ARENA_API_KEYS ?? "";
  const cached = globalForApiKeys.__arenaApiKeys;

  if (cached && cached.source === raw) return cached;

  const parsed = parseKeys(raw);
  globalForApiKeys.__arenaApiKeys = parsed;
  return parsed;
}

/** True when at least one usable key is configured. */
export function hasConfiguredKeys(): boolean {
  return loadKeys().keys.length > 0;
}

/** Config problems worth reporting once, e.g. at first request. */
export function keyConfigProblems(): string[] {
  return loadKeys().problems;
}

/**
 * Match a presented key against the configured ones.
 *
 * Returns the consumer, or null for "no match" — the caller must not be told
 * which of those it was, because "wrong key" and "no keys configured" are both
 * just 401 to anyone outside.
 */
export function resolveConsumer(presented: string | null | undefined): ApiConsumer | null {
  const candidate = (presented ?? "").trim();
  if (!candidate) return null;

  const { keys } = loadKeys();
  if (keys.length === 0) return null;

  const presentedDigest = sha256(candidate);
  let matched: ConfiguredKey | null = null;

  // Every configured key is compared, with no early exit, so the time taken
  // does not depend on the position of the match.
  for (const key of keys) {
    if (timingSafeEqual(presentedDigest, key.digest)) matched = key;
  }

  if (!matched) return null;

  const { digest: _digest, ...consumer } = matched;
  return consumer;
}

/** Test-only: drop the parsed-key memo so a changed env is re-read. */
export function __resetApiKeysForTests(): void {
  globalForApiKeys.__arenaApiKeys = undefined;
}
