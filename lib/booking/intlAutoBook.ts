/**
 * IS AUTOMATIC EXPORT BOOKING TURNED ON?
 * -----------------------------------------------------------------------------
 * The rollout gate for international carrier booking.
 *
 * Placing an export automatically is new, and it depends on customs data (IEC,
 * AD code, LUT) that only some orgs have filled in so far. Shipping it wired but
 * dark means the whole path can be deployed, exercised by ops through the retry
 * button on one real shipment, and only then switched on for everyone — rather
 * than discovering a payload problem across every booking at once.
 *
 * With this off, international behaves exactly as it did before this feature
 * existed: nothing is queued at payment, `intlBookingStatus` stays NOT_REQUIRED,
 * and ops place bookings by hand. The ops retry button still works, which is
 * what makes the staged rollout possible.
 *
 * Read through a function rather than a module constant so a deployment can flip
 * the variable without a rebuild pinning the old value into the bundle.
 */

export function intlAutoBookEnabled(): boolean {
  const raw = process.env.INTL_AUTO_BOOK_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
