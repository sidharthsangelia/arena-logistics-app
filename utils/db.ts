import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaNeon({
      connectionString: process.env.DATABASE_URL!,
    }),

    /**
     * ── WHY THESE ARE SET, AND WHY THE DEFAULTS WERE WRONG HERE ─────────────
     * Prisma defaults an interactive transaction to `timeout: 5000` and
     * `maxWait: 2000`. Both are sized for an application server sitting next to
     * its database. This one is not: serverless functions talk to Neon over the
     * open internet, and a transaction's cost is its number of round trips
     * multiplied by that latency, not the work the database does.
     *
     * That default quietly broke the rate sweep for months. One swept cell wrote
     * its call row and every product row inside a single transaction, which cost
     * three round trips per product. At eight products (the USA, and every other
     * well-served lane) that is 27 sequential round trips, which fits in 5s only
     * while latency stays under about 185ms. Above that the transaction expired,
     * the whole cell rolled back, and the lane died having recorded nothing — so
     * the busiest destinations were precisely the ones with no rates stored.
     *
     * The write path has since been rewritten to a constant six round trips
     * (lib/rateSweep/execute.ts), so the sweep no longer needs a long budget.
     * These stay raised anyway, because every other multi-statement transaction
     * in the app was one latency spike away from the same failure and none of
     * them had noticed either.
     *
     * Raising a timeout cannot break a transaction that was already committing;
     * it only stops one that was working from being cut off part-way.
     */
    transactionOptions: {
      /** Longer than any transaction here should ever need, short enough that a
       *  genuinely wedged one still surfaces as an error rather than hanging. */
      timeout: 20_000,
      /** How long to wait for a free connection before giving up. */
      maxWait: 10_000,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
