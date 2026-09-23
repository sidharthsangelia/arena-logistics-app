/**
 * ARAMEX ACCOUNTS
 * -----------------------------------------------------------------------------
 * Arena holds more than one Aramex contract. They are separate accounts with
 * separate account numbers, separate PINs and — this is the whole point —
 * SEPARATE TARIFFS. The same parcel to the same postcode costs different money
 * depending on which one we book it under, and each one is invoiced to us
 * separately at the end of the month.
 *
 * So two things have to be true, and this module exists to make both of them
 * cheap:
 *
 *   1. A quote is the cheapest price across every configured account.
 *   2. The booking goes out on THE ACCOUNT THAT QUOTED IT. Not the cheapest at
 *      booking time, not the first one configured — the one whose tariff
 *      produced the number the customer paid. Anything else is an invoice line
 *      nobody can reconcile against a shipment three weeks later.
 *
 * (2) is delivered by `key` below. The rate adapter stamps the winning account's
 * key onto the quote's `courierId`; the booking layer already snapshots that
 * onto `Shipment.selectedCourierId` at selection and hands it back to the
 * booking adapter as `service.serviceId`. That path was built for Shipmozo's
 * courier ids and needs no change to carry an account key instead.
 *
 * ── THE KEYS ARE PERSISTED. NEVER RENAME ONE. ───────────────────────────────
 * A key lives in `Shipment.selectedCourierId` and in `VendorRateSnapshot.courierId`
 * forever. Renaming "aramex-ups" tomorrow orphans every shipment quoted on it
 * today: the booking adapter would no longer recognise the account that sold
 * the service and would refuse the booking (correctly, and unhelpfully). Add
 * keys, retire keys, but do not rename them.
 *
 * ── ADDING THE THIRD ACCOUNT ────────────────────────────────────────────────
 * One entry in ARAMEX_ACCOUNT_DEFINITIONS (./accountKeys.ts) plus its two env
 * vars. Nothing else in the
 * codebase changes — not the rate adapter, not the booking adapter, not the
 * tracking adapter, not the UI:
 *
 *     { key: "aramex-xyz", adminLabel: "Aramex (XYZ) account", envSuffix: "_XYZ" }
 *
 *     ARAMEX_ACCOUNT_NUMBER_XYZ="..."
 *     ARAMEX_ACCOUNT_PIN_XYZ="..."
 *
 * An account whose number or PIN is missing is simply not queried, so a
 * half-filled env is a quieter production than a hard failure at boot.
 */

import {
  ARAMEX_ACCOUNT_DEFINITIONS,
  type AramexAccountDefinition,
} from "./accountKeys";
import type { AramexClientInfo } from "./types";

export {
  ARAMEX_ACCOUNT_DEFINITIONS,
  ARAMEX_CUSTOMER_PRODUCT_NAME,
  aramexAccountLabel,
} from "./accountKeys";

export interface AramexAccount {
  key: string;
  adminLabel: string;
  accountNumber: string;
  accountPin: string;
  accountEntity: string;
  accountCountryCode: string;
  userName: string;
  password: string;
}

/**
 * Read at call time rather than at module load.
 *
 * Next evaluates a module once per server module graph and keeps it for the
 * process lifetime. Snapshotting `process.env` at the top of this file would
 * mean a credential rotated in the hosting dashboard needs a redeploy to take
 * effect, and would make every test that wants a different account set have to
 * fight the module cache. These are a handful of string reads on a path that
 * then makes an HTTPS call; the cost is not measurable.
 */
function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** Per-account value, falling back to the shared one, then to a default. */
function accountEnv(
  base: string,
  suffix: string,
  fallback = "",
): string {
  return env(`${base}${suffix}`) || env(base) || fallback;
}

function resolveAccount(def: AramexAccountDefinition): AramexAccount {
  return {
    key: def.key,
    adminLabel: def.adminLabel,
    accountNumber: env(`ARAMEX_ACCOUNT_NUMBER${def.envSuffix}`),
    accountPin: env(`ARAMEX_ACCOUNT_PIN${def.envSuffix}`),
    // Entity and country are properties of the CONTRACT, not of the login, and
    // two accounts under one company can sit at different Aramex branches. Each
    // may override; both fall back to the shared value, which is what every
    // existing deployment has set.
    accountEntity: accountEnv("ARAMEX_ACCOUNT_ENTITY", def.envSuffix, "GGN"),
    accountCountryCode: accountEnv(
      "ARAMEX_ACCOUNT_COUNTRY_CODE",
      def.envSuffix,
      "IN",
    ),
    // The aramex.com login is shared across Arena's accounts today, so these
    // fall back to the unsuffixed pair. The override exists because Aramex does
    // not promise that stays true.
    userName: accountEnv("ARAMEX_USERNAME", def.envSuffix),
    password: accountEnv("ARAMEX_PASSWORD", def.envSuffix),
  };
}

/** An account we can actually authenticate with. Anything less is not queried. */
function isUsable(account: AramexAccount): boolean {
  return Boolean(
    account.accountNumber &&
      account.accountPin &&
      account.userName &&
      account.password,
  );
}

/**
 * Every account configured on this deployment, in definition order.
 *
 * Order is the tie-break when two accounts quote the identical price, so it is
 * worth it being deterministic: the direct Aramex contract is listed first and
 * therefore wins a tie, which is the channel with the fewer moving parts.
 */
export function aramexAccounts(): AramexAccount[] {
  return ARAMEX_ACCOUNT_DEFINITIONS.map(resolveAccount).filter(isUsable);
}

/** The one account with this key, or null when it is unknown or unconfigured. */
export function aramexAccountByKey(
  key: string | null | undefined,
): AramexAccount | null {
  const wanted = key?.trim();
  if (!wanted) return null;
  return aramexAccounts().find((a) => a.key === wanted) ?? null;
}

/** True when at least one account can be queried. */
export function isAramexConfigured(): boolean {
  return aramexAccounts().length > 0;
}

/**
 * Which setting is missing, for the operator reading a failed booking.
 *
 * Names the variables rather than saying "credentials are not configured",
 * because on a multi-account vendor that sentence sends someone to re-check a
 * login that was never the problem.
 */
export function aramexConfigurationGap(): string | null {
  if (aramexAccounts().length > 0) return null;

  if (!env("ARAMEX_USERNAME") || !env("ARAMEX_PASSWORD")) {
    return "ARAMEX_USERNAME and ARAMEX_PASSWORD are not set.";
  }

  return (
    "no Aramex account is configured — set ARAMEX_ACCOUNT_NUMBER and " +
    "ARAMEX_ACCOUNT_PIN (and, for the UPS channel, ARAMEX_ACCOUNT_NUMBER_UPS " +
    "and ARAMEX_ACCOUNT_PIN_UPS)."
  );
}

/**
 * The auth block every Aramex endpoint takes, for one account.
 *
 * `Source: 24` is the integration-channel id Aramex issued for this partner and
 * is the same on every call in their own Postman collection. It is not a
 * per-account value.
 */
export function aramexClientInfo(account: AramexAccount): AramexClientInfo {
  return {
    UserName: account.userName,
    Password: account.password,
    Version: "v1.0",
    AccountNumber: account.accountNumber,
    AccountPin: account.accountPin,
    AccountEntity: account.accountEntity,
    AccountCountryCode: account.accountCountryCode,
    Source: 24,
  };
}
