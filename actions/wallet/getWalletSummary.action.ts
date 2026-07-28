"use server";

import { requireOrg } from "@/utils/auth-helper";
import { getOrCreateWallet } from "@/utils/wallet/service";

/**
 * Balance + org info only — deliberately excludes transaction history so
 * callers that just need the balance (header chip, booking payment summary,
 * the wallet page's balance card) never pay for a history query. History
 * lives in getWalletTransactionsAction, fetched separately.
 */
export async function getWalletSummaryAction() {
  const org = await requireOrg();
  const wallet = await getOrCreateWallet(org.id);

  return {
    balance: wallet.balance.toString(),
    currency: wallet.currency,
    orgName: org.name,
    orgEmail: org.email,
  };
}