/**
 * utils/shipmentNumber.ts
 *
 * Generates unique, human-readable shipment numbers via a PostgreSQL sequence.
 *
 * Format:  {PREFIX}{YYMMDD}{SQIDS}
 * Example: ARN260130748291
 *
 * The sequence is global and never resets, so numbers are unique across all
 * years — the date segment is context for humans, not part of the uniqueness
 * guarantee. Two shipments booked on the same day get different sequence
 * values and therefore different Sqids segments.
 *
 * The encoding itself (prefix, date segment, Sqids alphabet) lives in
 * ./shipmentNumber.encoding, which is free of `server-only` and Prisma so it
 * can be unit-tested. This file owns only the sequence.
 *
 * Thread-safety / concurrency guarantee:
 *   nextval() is atomic at the PostgreSQL kernel level. Calling it from
 *   100 concurrent requests simultaneously still returns 100 distinct
 *   values. No application-level locking or retry loops are needed. Sqids is
 *   a bijection, so distinct sequence values always encode to distinct
 *   strings — the encoding cannot introduce a collision.
 *
 * Sequence gaps:
 *   If the caller uses the number but the parent DB transaction rolls back
 *   (e.g. wallet debit failed), the number is consumed and a gap appears.
 *   This is normal behaviour — DO NOT attempt to reclaim gaps. Gaps are also
 *   invisible to customers now that the sequence value is obfuscated.
 *
 * Legacy numbers:
 *   Shipments booked before this format change keep their old
 *   SHP-2026-00042 numbers. Existing rows are NEVER rewritten, so both
 *   formats coexist in the database permanently. Anything that parses a
 *   shipment number must go through `parseShipmentNumber`, which handles
 *   both. Substring search (`contains`) works unchanged for either.
 */

import "server-only";
import { prisma } from "@/utils/db";
import { encodeShipmentNumber } from "./shipmentNumber.encoding";

export {
  decodeShipmentNumber,
  parseShipmentNumber,
  encodeShipmentNumber,
  PREFIX,
  type ParsedShipmentNumber,
} from "./shipmentNumber.encoding";

// ---------------------------------------------------------------------------
// Constants — change here, not scattered across call sites
// ---------------------------------------------------------------------------

const SEQUENCE_NAME = "shipment_number_seq";

// ---------------------------------------------------------------------------
// generateShipmentNumber
// ---------------------------------------------------------------------------

/**
 * Atomically generates the next unique shipment number.
 *
 * MUST be called inside or before the shipment-creation DB transaction.
 * Calling it outside a transaction is safe — nextval() is not rolled back
 * even if the outer operation fails, which is the intended behaviour.
 *
 * @throws {ShipmentNumberSequenceError} if the sequence doesn't exist
 *   (migration hasn't been run), with a clear actionable message.
 * @throws {Error} for any other database failure.
 */
export async function generateShipmentNumber(): Promise<string> {
  let rows: Array<{ nextval: bigint }>;

  try {
    rows = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval(${SEQUENCE_NAME}::regclass) AS nextval
    `;
  } catch (err) {
    throw wrapSequenceError(err);
  }

  if (!rows || rows.length === 0) {
    throw new ShipmentNumberSequenceError(
      `nextval('${SEQUENCE_NAME}') returned no rows. ` +
      "This is an unexpected PostgreSQL behaviour — check DB connectivity.",
    );
  }

  const seq = Number(rows[0].nextval); // safe: sequence values fit in JS number

  return encodeShipmentNumber(seq);
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ShipmentNumberSequenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShipmentNumberSequenceError";
  }
}

function wrapSequenceError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);

  // Sequence doesn't exist → migration not run
  if (
    msg.includes(SEQUENCE_NAME) &&
    (msg.includes("does not exist") || msg.includes("relation") || msg.includes("regclass"))
  ) {
    return new ShipmentNumberSequenceError(
      `[generateShipmentNumber] The PostgreSQL sequence "${SEQUENCE_NAME}" does not exist.\n` +
      "Run the migration before deploying:\n" +
      "  psql $DATABASE_URL < prisma/migrations/20260701_shipment_number_seq/migration.sql\n" +
      "Or via Prisma:\n" +
      "  npx prisma db execute --file prisma/migrations/20260701_shipment_number_seq/migration.sql",
    );
  }

  // Sequence exhausted (NO CYCLE) — theoretical at ~9 quintillion calls
  if (msg.includes("reached maximum value")) {
    return new ShipmentNumberSequenceError(
      `[generateShipmentNumber] Sequence "${SEQUENCE_NAME}" is exhausted. ` +
      "This should never happen in practice. Check for sequence corruption.",
    );
  }

  return err instanceof Error ? err : new Error(msg);
}
