/**
 * scripts/perf-bench.ts
 *
 * Read-only. Nothing is written, so it is safe to point at production.
 *
 *   npx tsx scripts/perf-bench.ts
 *
 * ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
 * The admin screens were slow and the instinct was that the SQL was bad. It was
 * not. Production holds tens of orgs and tens of wallet transactions; no query
 * here does meaningful work. What costs time is talking to Neon at all.
 *
 * So the number that matters is not "how long did this query take" but "how many
 * separate statements did this page need, and was the connection pool warm".
 * This script measures both, and every conclusion drawn from it is written into
 * the code it justifies.
 *
 * ── WHAT THE NUMBERS MEANT WHEN THIS WAS WRITTEN (Mumbai fn → Singapore DB) ──
 *
 *   warm round trip .................  ~75ms   the floor; you cannot beat it
 *   8 statements in parallel, warm ...  ~80ms   parallelism is FREE when warm
 *   8 statements in parallel, cold ... ~340ms   each new pooled connection
 *                                               costs a ~250ms WS+TLS+auth
 *                                               handshake
 *   8 statements sequentially ........ ~630ms   never chain what can be parallel
 *
 * Read that as two rules:
 *
 *   1. Never await one query before starting another that does not depend on it.
 *      Sequential chaining is the one mistake that is expensive at every
 *      temperature.
 *   2. Prefer fewer statements anyway. Warm, ten parallel queries cost the same
 *      as one; cold, they cost ten handshakes. Vercel Fluid Compute keeps
 *      instances (and so pools) warm between requests, which is why cold cost is
 *      mostly a first-visit problem rather than a per-request one — but the first
 *      visit is exactly when someone decides the app is slow.
 *
 * If these numbers drift a long way from the above, check the Vercel function
 * region and the Neon region before rewriting any SQL.
 */

import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../generated/prisma";

// Same construction as utils/db.ts. That module is "server-only", which a
// standalone script is not, so the adapter is rebuilt here rather than imported.
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
});

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  console.log(`${(performance.now() - t0).toFixed(0).padStart(7)}ms  ${label}`);
  return out;
}

const ping = () => prisma.$queryRaw`SELECT 1`;

async function main() {
  console.log("=== round-trip cost ===");
  await time("cold: first query (includes connection handshake)", ping);
  await time("warm: single round trip", ping);
  await time("3 parallel, pool cold for two of them", () =>
    Promise.all([ping(), ping(), ping()]),
  );
  await time("8 parallel, pool cold for five of them", () =>
    Promise.all(Array.from({ length: 8 }, ping)),
  );

  // Unmeasured. The run above left the pool holding eight connections; without
  // this the next line would still be opening some of them and "warm" would be
  // measuring handshakes.
  await Promise.all(Array.from({ length: 8 }, ping));
  await time("8 parallel, pool genuinely warm", () =>
    Promise.all(Array.from({ length: 8 }, ping)),
  );
  await time("8 sequential (the shape to avoid)", async () => {
    for (let i = 0; i < 8; i++) await ping();
  });

  console.log("\n=== how much data is actually here ===");
  const [sizes] = await time("row counts (single statement)", () =>
    prisma.$queryRaw<Record<string, bigint>[]>`
      SELECT
        (SELECT count(*) FROM "Org")               AS orgs,
        (SELECT count(*) FROM "Wallet")            AS wallets,
        (SELECT count(*) FROM "WalletTransaction") AS wallet_txns,
        (SELECT count(*) FROM "Client")            AS clients,
        (SELECT count(*) FROM "ClientDocument")    AS client_documents,
        (SELECT count(*) FROM "Shipment")          AS shipments,
        (SELECT count(*) FROM "ShipmentInvoice")   AS shipment_invoices,
        (SELECT count(*) FROM "ManualInvoice")     AS manual_invoices,
        (SELECT count(*) FROM "Invoice")           AS account_invoices,
        (SELECT count(*) FROM "BillingParty")      AS billing_parties
    `,
  );
  console.table(
    Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, Number(v)])),
  );

  console.log("\n=== the page queries, as the pages run them ===");
  await time("wallets: org balances tab", () =>
    Promise.all([
      prisma.org.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          companyName: true,
          isBusinessAssociate: true,
          skipPayment: true,
          wallet: { select: { id: true, balance: true, currency: true } },
        },
      }),
      prisma.walletTransaction.groupBy({
        by: ["walletId", "type"],
        where: { status: "SUCCESS" },
        _sum: { amount: true },
        _max: { createdAt: true },
      }),
    ]),
  );

  await time("clients: page 1 + total", () =>
    Promise.all([
      prisma.client.findMany({
        where: { deletedAt: null },
        include: { org: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.client.count({ where: { deletedAt: null } }),
    ]),
  );

  await time("document vault: page 1 + total", () =>
    Promise.all([
      prisma.clientDocument.findMany({
        where: { client: { deletedAt: null } },
        orderBy: [{ uploadedAt: "desc" }],
        take: 25,
        select: {
          id: true,
          label: true,
          description: true,
          docType: true,
          fileUrl: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          uploadedAt: true,
          org: { select: { id: true, name: true, slug: true } },
          client: { select: { id: true, companyName: true, contactName: true } },
        },
      }),
      prisma.clientDocument.count({ where: { client: { deletedAt: null } } }),
    ]),
  );

  await time("billing customers: page 1 + total", () =>
    Promise.all([
      prisma.billingParty.findMany({
        where: { deletedAt: null },
        orderBy: { legalName: "asc" },
        take: 25,
      }),
      prisma.billingParty.count({ where: { deletedAt: null } }),
    ]),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
