/**
 * lib/shipmentNumber.ts
 *
 * Generates unique, human-readable shipment numbers via a PostgreSQL sequence.
 *
 * Format:  SHP-{YEAR}-{NNNNN}
 * Example: SHP-2026-00042
 *
 * The year is cosmetic context — the underlying sequence is global and
 * never resets — so numbers are unique across all years. A shipment
 * created in 2027 gets SHP-2027-00043 (not SHP-2027-00001), which means
 * year-rollover can never produce a collision.
 *
 * Thread-safety / concurrency guarantee:
 *   nextval() is atomic at the PostgreSQL kernel level. Calling it from
 *   100 concurrent requests simultaneously still returns 100 distinct
 *   values. No application-level locking or retry loops are needed.
 *
 * Sequence gaps:
 *   If the caller uses the number but the parent DB transaction rolls back
 *   (e.g. wallet debit failed), the number is consumed and a gap appears.
 *   This is normal behaviour — DO NOT attempt to reclaim gaps.
 */

import "server-only";
import { prisma } from "@/utils/db";

// ---------------------------------------------------------------------------
// Constants — change here, not scattered across call sites
// ---------------------------------------------------------------------------

const SEQUENCE_NAME = "shipment_number_seq";
const PREFIX        = "SHP";
const PAD_LENGTH    = 5; // SHP-2026-00042 → 5-digit padding; auto-expands beyond 99999

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

  const seq  = Number(rows[0].nextval); // safe: sequence values fit in JS number
  const year = new Date().getFullYear();
  const padded = String(seq).padStart(PAD_LENGTH, "0");

  return `${PREFIX}-${year}-${padded}`;
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

// ---------------------------------------------------------------------------
// parseShipmentNumber
//
// Utility: extracts the numeric part from a shipment number string.
// Useful for sorting, display, or admin tools.
//
// parseShipmentNumber("SHP-2026-00042") → { year: 2026, seq: 42 }
// Returns null for strings that don't match the expected format.
// ---------------------------------------------------------------------------

export interface ParsedShipmentNumber {
  prefix: string; // "SHP"
  year:   number; // 2026
  seq:    number; // 42
}

export function parseShipmentNumber(
  value: string,
): ParsedShipmentNumber | null {
  const match = value.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    year:   parseInt(match[2], 10),
    seq:    parseInt(match[3], 10),
  };
}