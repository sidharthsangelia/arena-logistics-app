/**
 * scripts/db-rowcount.ts
 *
 * Read-only sanity check: which database is DATABASE_URL actually pointing at,
 * and does it hold real data? Run before any schema change, because this repo
 * has two Neon databases, no migration history, and uses `prisma db push`.
 *
 *   npx tsx scripts/db-rowcount.ts
 */

import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../generated/prisma";

// Same construction as utils/db.ts. That module is "server-only", which a
// standalone script is not, so the adapter is rebuilt here rather than imported.
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const [orgs, shipments, quotes, invoices, sweepRuns, sweepRates] =
    await Promise.all([
      prisma.org.count(),
      prisma.shipment.count(),
      prisma.quote.count(),
      prisma.invoice.count(),
      prisma.rateSweepRun.count(),
      prisma.vendorRateSnapshot.count(),
    ]);

  console.log(
    JSON.stringify(
      { orgs, shipments, quotes, invoices, sweepRuns, sweepRates },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
