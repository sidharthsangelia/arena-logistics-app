"use server";

import { requireOrg } from "@/utils/auth-helper";
import { prisma } from "@/utils/db";
import { getOrCreateWallet } from "@/utils/wallet/service";
import type { WalletHistoryRangeDays } from "@/lib/wallet/historyRange";

const MAX_ROWS = 200;

/**
 * Scoped to a rolling window (default 7 days) rather than the whole ledger —
 * an org that's been active for years would otherwise drag the wallet page
 * on every load. walletId+createdAt is indexed, so this stays cheap even at
 * the 90-day end.
 */
export async function getWalletTransactionsAction(
  days: WalletHistoryRangeDays = 7,
) {
  const org = await requireOrg();
  const wallet = await getOrCreateWallet(org.id);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  return {
    currency: wallet.currency,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: t.amount.toString(),
      balanceAfter: t.balanceAfter?.toString() ?? null,
      shipmentId: t.shipmentId,
      createdAt: t.createdAt.toISOString(),
      notes: t.notes,
    })),
  };
}
