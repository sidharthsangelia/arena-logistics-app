import * as Sentry from "@sentry/nextjs";
import { revalidateTag, unstable_cache } from "next/cache";

import { prisma } from "@/utils/db";

/**
 * Per-org revalidation tag. Scoped to the org so one tenant's top-up never
 * invalidates another tenant's cached balance.
 */
export function walletBalanceTag(orgId: string) {
  return `wallet-balance:${orgId}`;
}

export interface WalletBalanceDTO {
  /** Decimal serialised as a string — Decimal survives neither the cache nor
   *  the server → client boundary. */
  balance: string;
  currency: string;
  /** False when the org has no wallet row yet (never topped up). */
  exists: boolean;
}

const NO_WALLET: WalletBalanceDTO = {
  balance: "0",
  currency: "INR",
  exists: false,
};

// ---------------------------------------------------------------------------
// readWalletBalance — uncached, straight to the DB
//
// Used by the refresh button, which exists precisely to bypass the cache.
// ---------------------------------------------------------------------------

export async function readWalletBalance(
  orgId: string,
): Promise<WalletBalanceDTO> {
  const wallet = await prisma.wallet.findUnique({
    where: { orgId },
    select: { balance: true, currency: true },
  });

  if (!wallet) return NO_WALLET;

  return {
    balance: wallet.balance.toString(),
    currency: wallet.currency,
    exists: true,
  };
}

// ---------------------------------------------------------------------------
// getCachedWalletBalance
//
// The header chip renders on every tenant page, so the balance is cached with
// `revalidate: false` — no time-based expiry at all. It is only ever refreshed
// by one of two things:
//
//   1. A wallet write invalidating walletBalanceTag(orgId).
//   2. The tenant pressing refresh, which reads the DB directly.
//
// ─── CONTRACT ──────────────────────────────────────────────────────────────
// Because there is no expiry ceiling, EVERY code path that changes
// Wallet.balance must call invalidateWalletBalance(orgId) after its transaction
// commits, or the chip will serve a stale number indefinitely. The current
// writers all do:
//
//   - actions/book/createShipment.action.ts   (shipment debit)
//   - app/api/webhooks/razorpay/route.ts      (top-up credit)
//   - actions/wallet/adminWallet.action.ts    (manual credit / debit by an admin)
//   - utils/wallet/service.ts refundWalletForShipment — not yet wired to a
//     caller; whoever wires it up owns the invalidation.
//
// Anything that mutates a balance without invalidating is a bug. This is the
// deliberate trade for a number that costs nothing to render on every page.
// ───────────────────────────────────────────────────────────────────────────
//
// Errors are rethrown so a failed read is never cached as a zero balance. A
// wrong balance is worse than a missing one, and unstable_cache does not store
// a result that threw.
// ---------------------------------------------------------------------------

export function getCachedWalletBalance(orgId: string) {
  return unstable_cache(
    async () => {
      try {
        return await readWalletBalance(orgId);
      } catch (error) {
        Sentry.captureException(error, {
          tags: { location: "getCachedWalletBalance" },
          extra: { orgId },
        });
        throw error;
      }
    },
    [`wallet-balance:${orgId}`],
    { tags: [walletBalanceTag(orgId)], revalidate: false },
  )();
}

// ---------------------------------------------------------------------------
// invalidateWalletBalance
//
// Call after any committed change to Wallet.balance. Safe from both Server
// Actions and Route Handlers — the webhook that credits a top-up is a Route
// Handler, which rules out updateTag.
// ---------------------------------------------------------------------------

export function invalidateWalletBalance(orgId: string) {
  // Next 16 requires the cacheLife argument; "max" gives stale-while-revalidate.
  revalidateTag(walletBalanceTag(orgId), "max");
}
