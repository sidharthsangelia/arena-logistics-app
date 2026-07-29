/**
 * Live checks for the Accounts list queries.
 *
 * Run with:
 *   npx tsx scripts/check-accounts.ts
 *
 * queries/accounts.ts imports "server-only" and cannot be pulled into a plain
 * node script, so this exercises the Prisma shapes it depends on directly: the
 * filtered relation counts, the groupBy behind the summary strip, ordering by a
 * relation count, and each health filter. Type checking proves these compile;
 * only a real query proves the database accepts them.
 */

import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma";
import {
  accountFiltersToQuery,
  parseAccountFilters,
} from "../lib/accounts/filters";
import { getSignupHealthFlags } from "../lib/accounts/health";

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

async function main() {
  // ── Pure logic ───────────────────────────────────────────────────────────
  const parsed = parseAccountFilters({
    q: "  acme  ",
    type: "ba",
    health: "never-booked",
    sort: "shipments",
    dir: "asc",
    page: "3",
    pageSize: "50",
  });

  check("parses every filter", parsed.query === "acme" && parsed.type === "ba");
  check("parses pagination", parsed.page === 3 && parsed.pageSize === 50);

  const junk = parseAccountFilters({
    type: "nonsense",
    health: "nope",
    page: "-4",
    pageSize: "9999",
  });
  check(
    "falls back on junk input",
    junk.type === "all" && junk.health === "all" && junk.page === 1 && junk.pageSize === 25,
  );

  const roundTrip = accountFiltersToQuery(parseAccountFilters({}));
  check(
    "defaults serialise to an empty query string",
    Object.values(roundTrip).every((value) => value === undefined),
    roundTrip,
  );

  check(
    "a fresh signup flags all three",
    getSignupHealthFlags({
      profileCompletedAt: null,
      verifiedKycCount: 0,
      shipmentCount: 0,
    }).length === 3,
  );
  check(
    "a trading account flags none",
    getSignupHealthFlags({
      profileCompletedAt: new Date(),
      verifiedKycCount: 2,
      shipmentCount: 5,
    }).length === 0,
  );

  // ── Live reads ───────────────────────────────────────────────────────────
  const rows = await prisma.org.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      isBusinessAssociate: true,
      markupPercent: true,
      profileCompletedAt: true,
      wallet: { select: { balance: true } },
      _count: {
        select: {
          clients: { where: { deletedAt: null } },
          shipments: true,
          quotes: true,
          kycDocuments: { where: { verifiedAt: { not: null } } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 5,
  });

  check("filtered relation counts are queryable", Array.isArray(rows));
  check(
    "markup converts to a number",
    rows.length === 0 || typeof rows[0]!.markupPercent.toNumber() === "number",
  );

  const groups = await prisma.org.groupBy({
    by: ["isBusinessAssociate"],
    where: { deletedAt: null },
    _count: { _all: true },
  });
  const grouped = groups.reduce((sum, g) => sum + g._count._all, 0);
  const total = await prisma.org.count({ where: { deletedAt: null } });
  check("summary groupBy totals match a plain count", grouped === total, {
    grouped,
    total,
  });

  const byShipments = await prisma.org.findMany({
    where: { deletedAt: null },
    select: { id: true, _count: { select: { shipments: true } } },
    orderBy: [{ shipments: { _count: "desc" } }, { id: "desc" }],
    take: 3,
  });
  const descending = byShipments.every(
    (row, index) =>
      index === 0 || byShipments[index - 1]!._count.shipments >= row._count.shipments,
  );
  check("ordering by relation count works", descending, byShipments);

  const [incomplete, noKyc, neverBooked] = await Promise.all([
    prisma.org.count({ where: { deletedAt: null, profileCompletedAt: null } }),
    prisma.org.count({
      where: {
        deletedAt: null,
        kycDocuments: { none: { verifiedAt: { not: null } } },
      },
    }),
    prisma.org.count({ where: { deletedAt: null, shipments: { none: {} } } }),
  ]);

  check("every health filter runs", true);
  console.log(
    `\n${total} accounts: ${groups.find((g) => g.isBusinessAssociate)?._count._all ?? 0} associates, ` +
      `${groups.find((g) => !g.isBusinessAssociate)?._count._all ?? 0} standard`,
  );
  console.log(
    `health: ${incomplete} profile incomplete, ${noKyc} KYC unverified, ${neverBooked} never booked`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
