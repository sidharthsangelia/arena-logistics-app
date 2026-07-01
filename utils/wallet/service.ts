// Import paths aligned to your actual project: prisma client lives at
// @/utils/db, generated enums/Decimal at @/generated/prisma.
import { prisma } from "@/utils/db";
import { WalletTxnType, WalletTxnStatus } from "@/generated/prisma";
import { Decimal } from "@/generated/prisma/runtime/client";

// Same structural trick your createShipmentAction.ts already uses for its
// own PrismaTx type — kept local here so this file has no dependency on
// how (or whether) your generated client exports a `Prisma` namespace.
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export class InsufficientFundsError extends Error {
  constructor(
    public shortfallRupees: number,
    public availableRupees: number,
  ) {
    super(`Insufficient wallet balance. Short by ₹${shortfallRupees.toFixed(2)}.`);
    this.name = "InsufficientFundsError";
  }
}

export async function getOrCreateWallet(orgId: string) {
  return prisma.wallet.upsert({
    where: { orgId },
    create: { orgId, balance: 0, currency: "INR" },
    update: {},
  });
}

/**
 * Atomically debits `amountRupees` from the org's wallet and records the
 * transaction, all inside the CALLER's transaction (pass your `tx` from
 * createShipmentAction's `prisma.$transaction(async (tx) => {...})`).
 *
 * Race-safety: the `WHERE balance >= amount` clause is what actually
 * prevents overdraft. Postgres takes a row lock on the wallet row for the
 * duration of this UPDATE, so two concurrent bookings against the same
 * wallet can't both read "sufficient funds" and both succeed — this is
 * safer than a separate SELECT-then-UPDATE, which has a TOCTOU race under
 * concurrent requests.
 *
 * Throws InsufficientFundsError if funds are short — let it propagate out
 * of your $transaction callback so Prisma rolls back everything else
 * (shipment row, addresses, packages, invoice doc) created earlier in the
 * same transaction. No orphaned PENDING_PAYMENT shipment is left behind.
 */
export async function debitWalletForShipment(
  tx: PrismaTx,
  orgId: string,
  amountRupees: number,
  shipmentId: string,
) {
  if (amountRupees <= 0) {
    throw new Error(`debitWalletForShipment called with non-positive amount: ${amountRupees}`);
  }

  const wallet = await tx.wallet.findUnique({ where: { orgId } });
  if (!wallet) {
    throw new InsufficientFundsError(amountRupees, 0);
  }

  const rows = await tx.$queryRaw<{ balance: unknown }[]>`
    UPDATE "Wallet"
    SET balance = balance - ${amountRupees}, "updatedAt" = now()
    WHERE id = ${wallet.id} AND balance >= ${amountRupees}
    RETURNING balance
  `;

  if (rows.length === 0) {
    // Re-read current balance for an accurate shortfall figure — someone
    // else may have debited it between our findUnique and this UPDATE.
    const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    throw new InsufficientFundsError(
      amountRupees - Number(current.balance),
      Number(current.balance),
    );
  }

  const balanceAfter = rows[0].balance as Decimal;

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: WalletTxnType.SHIPMENT_DEBIT,
      status: WalletTxnStatus.SUCCESS,
      amount: new Decimal(amountRupees.toFixed(4)),
      currency: wallet.currency,
      balanceAfter,
      shipmentId,
    },
  });

  return { balanceAfter };
}

/**
 * Credits a wallet back — e.g. on shipment cancellation. Not wired to
 * anything automatically yet; call it from wherever your cancellation flow
 * transitions Shipment.status to CANCELLED.
 */
export async function refundWalletForShipment(
  tx: PrismaTx,
  walletId: string,
  amountRupees: number,
  shipmentId: string,
  reason: string,
) {
  const rows = await tx.$queryRaw<{ balance: unknown }[]>`
    UPDATE "Wallet"
    SET balance = balance + ${amountRupees}, "updatedAt" = now()
    WHERE id = ${walletId}
    RETURNING balance
  `;
  const balanceAfter = rows[0].balance as Decimal;

  await tx.walletTransaction.create({
    data: {
      walletId,
      type: WalletTxnType.REFUND,
      status: WalletTxnStatus.SUCCESS,
      amount: new Decimal(amountRupees.toFixed(4)),
      currency: "INR",
      balanceAfter,
      shipmentId,
      notes: reason,
    },
  });
}