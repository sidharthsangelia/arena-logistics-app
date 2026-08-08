/**
 * Seeds the charge-type catalog from lib/invoices/manual/catalog.ts.
 *
 *   npx tsx scripts/seedChargeTypes.ts
 *
 * IDEMPOTENT, AND DELIBERATELY CONSERVATIVE. It upserts on `code` and on an
 * existing row it updates NOTHING except reactivating it. A rate, SAC or label
 * an admin corrected in the UI is the truth; this file is only a starting
 * point. Adding an entry to the catalog and re-running is how a new charge
 * ships. Editing an existing entry here has no effect on rows already in the
 * database, which is the point.
 *
 * To genuinely reset a row to its catalog values, pass --force. That will
 * discard admin edits, so it asks first unless --yes is also given.
 */

import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma";
import { CHARGE_TYPE_SEED } from "../lib/invoices/manual/catalog";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

const force = process.argv.includes("--force");
const confirmed = process.argv.includes("--yes");

async function main() {
  if (force && !confirmed) {
    console.error(
      "--force overwrites labels, SAC codes and rates that an admin may have " +
        "corrected. Re-run with --yes if that is what you want.",
    );
    process.exitCode = 1;
    return;
  }

  let created = 0;
  let reactivated = 0;
  let overwritten = 0;
  let untouched = 0;

  for (const seed of CHARGE_TYPE_SEED) {
    const existing = await prisma.chargeType.findUnique({
      where: { code: seed.code },
      select: { id: true, isActive: true },
    });

    const values = {
      label: seed.label,
      description: seed.description ?? null,
      sacCode: seed.sacCode ?? "996812",
      defaultRatePercent: seed.defaultRatePercent ?? 18,
      defaultReimbursement: seed.defaultReimbursement ?? false,
      applicability: seed.applicability ?? "ANY",
      sortOrder: seed.sortOrder,
      isSystem: true,
      isActive: true,
    } as const;

    if (!existing) {
      await prisma.chargeType.create({ data: { code: seed.code, ...values } });
      created += 1;
      continue;
    }

    if (force) {
      await prisma.chargeType.update({ where: { code: seed.code }, data: values });
      overwritten += 1;
      continue;
    }

    if (!existing.isActive) {
      await prisma.chargeType.update({
        where: { code: seed.code },
        data: { isActive: true },
      });
      reactivated += 1;
      continue;
    }

    untouched += 1;
  }

  console.log(
    [
      `charge types in catalog: ${CHARGE_TYPE_SEED.length}`,
      `created:      ${created}`,
      `reactivated:  ${reactivated}`,
      force ? `overwritten:  ${overwritten}` : `left alone:   ${untouched}`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
