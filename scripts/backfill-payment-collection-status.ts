/**
 * ONE-OFF BACKFILL — safe to re-run, does nothing on a second pass.
 *
 * `Shipment.paymentCollectionStatus` was added with a default of NOT_REQUIRED,
 * which is correct for shipments paid from the wallet at booking time but wrong
 * for the ones already booked with payment deferred. Those owe us money and
 * belong in the collections queue, so they move to PENDING.
 *
 * DRAFT and CANCELLED are left alone: a draft never created a liability, and a
 * cancelled booking is not money we are going to chase.
 *
 * Run with:  npx tsx scripts/backfill-payment-collection-status.ts
 */

import { prisma } from "../utils/db";

async function main() {
  const candidates = await prisma.shipment.findMany({
    where: {
      paymentDeferred: true,
      paymentCollectionStatus: "NOT_REQUIRED",
      status: { notIn: ["DRAFT", "CANCELLED"] },
    },
    select: { id: true, shipmentNumber: true, status: true, quotedTotal: true },
  });

  if (candidates.length === 0) {
    console.log("Nothing to backfill. Every deferred shipment already has a collection status.");
    return;
  }

  console.log(`Moving ${candidates.length} deferred shipment(s) to PENDING:`);
  for (const s of candidates) {
    console.log(`  ${s.shipmentNumber}  ${s.status}  ${s.quotedTotal ?? "no total"}`);
  }

  const result = await prisma.shipment.updateMany({
    where: { id: { in: candidates.map((s) => s.id) } },
    data: { paymentCollectionStatus: "PENDING" },
  });

  console.log(`Done. ${result.count} row(s) updated.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
