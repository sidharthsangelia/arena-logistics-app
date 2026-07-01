"use server";

import { requireOrg } from "@/utils/auth-helper";
import { prisma } from "@/utils/db";
import { getOrCreateWallet } from "@/utils/wallet/service";

 

export async function getWalletSummaryAction() {
  const org = await requireOrg();
  const wallet = await getOrCreateWallet(org.id);

  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return {
    balance: wallet.balance.toString(),
    currency: wallet.currency,
    orgName: org.name,
    orgEmail: org.email,
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