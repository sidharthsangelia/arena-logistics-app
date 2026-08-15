/**
 * scripts/backfill-rate-carrier.ts
 *
 * Fills carrier / dutyMode / contentType / pickupIncluded / restrictionNote on
 * VendorRateSnapshot rows written before those columns existed.
 *
 *   npx tsx scripts/backfill-rate-carrier.ts --dry-run   # show what would change
 *   npx tsx scripts/backfill-rate-carrier.ts             # apply
 *
 * ── WHY IT GROUPS BY NAME ───────────────────────────────────────────────────
 * The classification depends on productName and on nothing else, and a sweep
 * produces a few dozen distinct names across many thousands of rows. So this
 * classifies each distinct name once and issues one updateMany per name, which
 * turns ~9,000 row updates into ~45 statements. It also makes the dry run
 * readable: a human can check forty-five decisions, not nine thousand.
 *
 * ── SAFE TO RE-RUN ──────────────────────────────────────────────────────────
 * The write is a pure function of productName, so running it twice produces the
 * same values. Re-run it after any change to the rules in
 * lib/rateSweep/carrier.ts, because a rule change that is not backfilled leaves
 * the table holding two different answers for the same service label depending
 * on which night it was swept.
 */

import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient, type RateContentType, type RateDutyMode } from "../generated/prisma";
import { classifyService, UNMAPPED_CARRIER } from "../lib/rateSweep/carrier";

// Same construction as utils/db.ts, which is "server-only" and so cannot be
// imported by a standalone script.
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const names = await prisma.vendorRateSnapshot.groupBy({
    by: ["productName"],
    _count: { _all: true },
  });

  if (names.length === 0) {
    console.log("No rate snapshots to backfill.");
    return;
  }

  names.sort((a, b) => b._count._all - a._count._all);

  let rowsTouched = 0;
  const unmapped: { productName: string; rows: number }[] = [];

  for (const group of names) {
    const rows = group._count._all;
    const service = classifyService(group.productName);

    if (service.carrier === UNMAPPED_CARRIER) {
      unmapped.push({ productName: group.productName, rows });
    }

    const attributes = [
      service.dutyMode !== "UNKNOWN" ? service.dutyMode.toLowerCase().replace("_", " ") : null,
      service.contentType !== "UNKNOWN"
        ? service.contentType.toLowerCase().replace("_", " ")
        : null,
      service.pickupIncluded === true ? "pickup" : null,
      service.pickupIncluded === false ? "no pickup" : null,
      service.restrictionNote,
    ].filter(Boolean);

    console.log(
      `${service.carrier.padEnd(16)} ${String(rows).padStart(5)}  ${group.productName}` +
        (attributes.length > 0 ? `  [${attributes.join(", ")}]` : ""),
    );

    if (!DRY_RUN) {
      const result = await prisma.vendorRateSnapshot.updateMany({
        where: { productName: group.productName },
        data: {
          carrier: service.carrier,
          dutyMode: service.dutyMode as RateDutyMode,
          contentType: service.contentType as RateContentType,
          pickupIncluded: service.pickupIncluded,
          restrictionNote: service.restrictionNote,
        },
      });
      rowsTouched += result.count;
    } else {
      rowsTouched += rows;
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would update" : "Updated"} ${rowsTouched} rows across ${names.length} service names.`,
  );

  // Printed last so it is the thing left on screen. An unmapped name is not an
  // error, but it is the one output of this script that needs a human decision:
  // either it is a carrier that deserves a rule, or it is a reseller product
  // that is correctly filed under OTHER.
  if (unmapped.length > 0) {
    console.log(`\n${unmapped.length} service names matched no carrier rule:`);
    for (const row of unmapped) {
      console.log(`  ${String(row.rows).padStart(5)}  ${row.productName}`);
    }
    console.log("\nAdd a rule in lib/rateSweep/carrier.ts and re-run if any of these is a carrier.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
