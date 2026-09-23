/**
 * READING ARAMEX'S NOTIFICATIONS
 * -----------------------------------------------------------------------------
 * Aramex answers HTTP 200 to almost everything. An unserviceable lane, a
 * rejected weight, a duplicate reference and an expired account PIN all come
 * back as `HasErrors: true` with nothing but free text to tell them apart.
 *
 * So this module reads the wording, which is exactly the fragile approach the
 * typed errors elsewhere in the codebase exist to avoid, and is used here
 * because Aramex leaves nothing else to look at.
 *
 * Every matcher below is deliberately ONE-SIDED. Think about which way a wrong
 * answer hurts before widening one:
 *
 *   - A missed auth failure costs a sweep one wasted vendor run, which the
 *     per-vendor failure-rate alert catches anyway. A false positive stops a
 *     vendor that was working. So the auth patterns stay narrow and specific
 *     rather than matching anything containing "invalid".
 *
 *   - A missed duplicate turns a confusing message into a slightly more
 *     confusing one. A false positive tells ops a booking already exists when
 *     it does not, and they go looking for an AWB that was never issued. So the
 *     duplicate patterns require the word "duplicate" or "already exists".
 */

import type { AramexBaseResponse, AramexNotification } from "./types";

/** Every notification on a response, flattened into one readable sentence. */
export function describeNotifications(
  notifications: AramexNotification[] | null | undefined,
  fallback = "Aramex reported an error but described it as nothing.",
): string {
  const parts = (notifications ?? [])
    .map((n) => {
      const message = n?.Message?.trim();
      const code = n?.Code?.trim();
      if (message && code) return `${message} (${code})`;
      return message || code || "";
    })
    .filter(Boolean);

  return parts.length > 0 ? parts.join("; ") : fallback;
}

/** Same, for any response carrying the standard envelope. */
export function describeResponseErrors(
  response: AramexBaseResponse,
  fallback?: string,
): string {
  return describeNotifications(response.Notifications, fallback);
}

/**
 * Aramex does not give credential failures their own field, code or HTTP
 * status: an expired account PIN comes back as HasErrors with a notification
 * that reads like any other rejection.
 *
 * Kept exported from lib/rate-adapters/vendors/aramex/aramex.adapter.ts as well,
 * because that is where it lived when the rate sweep's tests pinned it.
 */
export function looksLikeAramexAuthFailure(message: string): boolean {
  const text = message.toLowerCase();

  return (
    text.includes("invalid credential") ||
    text.includes("invalid user") ||
    text.includes("invalid account") ||
    text.includes("account number") ||
    text.includes("account pin") ||
    text.includes("unauthorized") ||
    text.includes("unauthorised") ||
    text.includes("authentication")
  );
}

/**
 * Aramex refusing a shipment because it already holds one under this reference.
 *
 * This is the single most valuable thing to recognise in the booking adapter.
 * Aramex documents ForeignHAWB as having to be unique across their system, and
 * enforces it — which turns a duplicate create into a REFUSAL rather than a
 * second export at full price. When we see this, the honest message is "you
 * probably already have an AWB, go and look" rather than "booking failed".
 */
export function looksLikeAramexDuplicate(message: string): boolean {
  const text = message.toLowerCase();

  return (
    text.includes("duplicate") ||
    text.includes("already exists") ||
    text.includes("already used") ||
    text.includes("already been used")
  );
}
