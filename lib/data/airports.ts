import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/utils/db";

/**
 * lib/data/airports.ts
 * -----------------------------------------------------------------------------
 * Cached accessors for the Airport reference table.
 *
 * Airports are IMMUTABLE seed/reference data — there is no create/update/delete
 * of `Airport` anywhere in the app — so unlike wallet balances, org markup, or
 * shipment status (all of which must never be cached), airport rows are safe to
 * cache aggressively and cross-request. Every rate calc that validated an IATA
 * code was otherwise hitting the DB on the hot path for data that never changes.
 *
 * TTL is a long safety net for the rare case someone edits the table out of
 * band (e.g. a manual SQL activation toggle). Both accessors are tagged
 * `airports`, so a future admin airport-management flow can call
 * `revalidateTag("airports", "max")` to refresh immediately.
 */

const AIRPORTS_TTL_SECONDS = 60 * 60 * 24; // 24h

/** A single airport by its IATA code (primary key), or null if unknown. */
export const getAirportByCode = (iataCode: string) =>
  unstable_cache(
    async () => prisma.airport.findUnique({ where: { iataCode } }),
    [`airport:${iataCode}`],
    { tags: ["airports", `airport:${iataCode}`], revalidate: AIRPORTS_TTL_SECONDS },
  )();

/** All currently-active airports, ordered by code — for pickers/dropdowns. */
export const getActiveAirports = unstable_cache(
  async () =>
    prisma.airport.findMany({
      where: { isActive: true },
      orderBy: { iataCode: "asc" },
    }),
  ["airports:active"],
  { tags: ["airports"], revalidate: AIRPORTS_TTL_SECONDS },
);
