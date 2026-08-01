/**
 * lib/tracking/queryShape.ts
 *
 * Is what somebody typed into the track box one of OUR numbers, or a carrier's?
 *
 * Free of `server-only` and Prisma so it can be unit-tested, mirroring the split
 * in utils/shipmentNumber.encoding.ts. The lookup that uses it lives in
 * ./shipmentResolve.
 */

/**
 * Does this look like an Arena shipment number?
 *
 * Both formats count: the current ARN260130748291 and the legacy SHP-2026-00042
 * that pre-format-change rows still carry, since those rows are never rewritten.
 *
 * Deliberately a shape test and not `parseShipmentNumber`, which additionally
 * re-encodes the value to prove it is canonical — a number minted under a
 * different SHIPMENT_ID_ALPHABET would fail that check while still being a
 * perfectly real row in the table. The database is the authority on whether a
 * number exists; this only decides how to phrase the failure when it does not:
 * an ARN-shaped miss is a dead end, anything else is worth asking the carriers
 * about.
 */
export function looksLikeShipmentNumber(value: string): boolean {
  const v = value.trim().toUpperCase();
  return /^ARN[0-9]{8,}$/.test(v) || /^[A-Z]{2,5}-\d{4}-\d+$/.test(v);
}
