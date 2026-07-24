"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { WalletTxnStatus, WalletTxnType } from "@/generated/prisma";
import { Decimal } from "@/generated/prisma/runtime/client";
import {
  ArenaForbiddenError,
  getActorName,
  requireArenaAdmin,
} from "@/utils/arena-auth";
import { invalidateWalletBalance } from "@/lib/wallet/queries";
import { getWalletTransactionsForExport } from "@/lib/wallet/adminLedger";
import type { TxnSortField } from "@/lib/wallet/adminConfig";
import {
  walletAdjustmentSchema,
  type WalletAdjustmentResult,
} from "@/lib/wallet/schema";
import type { WalletTxnStatus as TxnStatus, WalletTxnType as TxnType } from "@/generated/prisma";

/**
 * Manually moving money in a tenant's wallet, and exporting the ledger.
 *
 * Admin only, checked here rather than trusted from the route. proxy.ts redirects
 * non-admins away from /arena-dashboard/wallets, but a server action is a public
 * endpoint reachable by POST without ever loading that page.
 */

const ADJUSTMENT_PATHS = ["/arena-dashboard/wallets", "/arena-dashboard"];

/**
 * Add money to or remove money from an org's wallet by hand.
 *
 * Exists because Razorpay is not the only way money arrives. BAs pay by NEFT and
 * cheque, and before this the credit had no route into the system at all.
 *
 * Safety properties:
 *   - The balance update and the ledger row are one transaction, so a wallet can
 *     never move without a matching record of who moved it and why.
 *   - A debit uses `WHERE balance >= amount`, the same row-lock trick as a
 *     shipment debit, so it cannot push a wallet negative and cannot race another
 *     debit. A negative balance would misbehave in the booking flow, which treats
 *     the balance as spendable.
 *   - The cache invalidation runs after commit, never inside the transaction. See
 *     the CONTRACT note in lib/wallet/queries.ts: the header chip caches with no
 *     expiry, so skipping this leaves every tenant seeing a stale balance forever.
 */
export async function adjustWalletBalanceAction(
  input: unknown,
): Promise<WalletAdjustmentResult> {
  try {
    const admin = await requireArenaAdmin();

    const parsed = walletAdjustmentSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
    }

    const { orgId, direction, amount, reason, reference } = parsed.data;

    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, companyName: true, deletedAt: true },
    });

    if (!org || org.deletedAt) {
      return { ok: false, error: "That organisation no longer exists." };
    }

    // Snapshotted onto the row so the ledger reads without a Clerk lookup per
    // line and still names the right person after they leave the team.
    const actorName = await getActorName(admin.userId);

    // A wallet is created on demand: an offline payment may well be the first
    // money an org ever has, so there is nothing to credit into yet.
    const wallet = await prisma.wallet.upsert({
      where: { orgId },
      create: { orgId, balance: 0, currency: "INR" },
      update: {},
      select: { id: true, currency: true, balance: true },
    });

    const notes = reference ? `${reason} (ref: ${reference})` : reason;

    const result = await prisma.$transaction(async (tx) => {
      if (direction === "credit") {
        const rows = await tx.$queryRaw<{ balance: unknown }[]>`
          UPDATE "Wallet"
          SET balance = balance + ${amount}, "updatedAt" = now()
          WHERE id = ${wallet.id}
          RETURNING balance
        `;
        return { balanceAfter: rows[0].balance as Decimal, shortfall: false as const };
      }

      // Debit. The guard in the WHERE clause is what prevents a negative balance
      // under concurrency; a read-then-write would have a race here.
      const rows = await tx.$queryRaw<{ balance: unknown }[]>`
        UPDATE "Wallet"
        SET balance = balance - ${amount}, "updatedAt" = now()
        WHERE id = ${wallet.id} AND balance >= ${amount}
        RETURNING balance
      `;

      if (rows.length === 0) return { balanceAfter: null, shortfall: true as const };

      return { balanceAfter: rows[0].balance as Decimal, shortfall: false as const };
    });

    if (result.shortfall || result.balanceAfter === null) {
      // Re-read rather than reuse the balance from before the transaction, so the
      // figure quoted back is current even if someone else just spent from it.
      const current = await prisma.wallet.findUnique({
        where: { id: wallet.id },
        select: { balance: true },
      });

      return {
        ok: false,
        error: `That would take the wallet below zero. There is ${Number(
          current?.balance ?? 0,
        ).toLocaleString("en-IN", {
          style: "currency",
          currency: wallet.currency,
        })} available to remove.`,
      };
    }

    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: direction === "credit" ? WalletTxnType.MANUAL_CREDIT : WalletTxnType.MANUAL_DEBIT,
        status: WalletTxnStatus.SUCCESS,
        amount: new Decimal(amount.toFixed(4)),
        currency: wallet.currency,
        balanceAfter: result.balanceAfter,
        notes,
        createdByUserId: admin.userId,
        createdByName: actorName,
      },
    });

    invalidateWalletBalance(orgId);
    for (const path of ADJUSTMENT_PATHS) revalidatePath(path);

    Sentry.addBreadcrumb({
      level: "info",
      message: `Manual wallet ${direction} of ${amount} for org ${orgId}`,
      data: { orgId, direction, amount, by: admin.userId },
    });

    return {
      ok: true,
      balance: result.balanceAfter.toString(),
      currency: wallet.currency,
    };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return { ok: false, error: error.message };
    }

    Sentry.captureException(error, { tags: { location: "adjustWalletBalanceAction" } });
    return { ok: false, error: "Could not update the wallet. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

/** Wraps a field for CSV: quotes it, and doubles any quote inside it. */
function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_HEADERS = [
  "Date",
  "Organisation",
  "Type",
  "Status",
  "Amount",
  "Balance after",
  "Currency",
  "Shipment",
  "Reference",
  "Recorded by",
  "Notes",
];

export type ExportLedgerFilters = {
  orgId?: string;
  types?: TxnType[];
  statuses?: TxnStatus[];
  from?: string;
  to?: string;
  query?: string;
  sortField?: TxnSortField;
  sortDir?: "asc" | "desc";
};

export type ExportLedgerResult =
  | { ok: true; csv: string; filename: string; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

/**
 * The filtered ledger as CSV text. Returned as a string for the browser to turn
 * into a download rather than streamed from a route handler, because it keeps the
 * admin check and the filter parsing in one place and the volumes involved are
 * small. `getWalletTransactionsForExport` caps the row count.
 *
 * Amounts are signed, so the column sums to the net movement in a spreadsheet
 * without anyone having to reason about which types mean outgoing.
 */
export async function exportWalletTransactionsAction(
  filters: ExportLedgerFilters,
): Promise<ExportLedgerResult> {
  try {
    await requireArenaAdmin();

    const { rows, truncated } = await getWalletTransactionsForExport({
      sortField: filters.sortField ?? "createdAt",
      sortDir: filters.sortDir ?? "desc",
      orgId: filters.orgId,
      types: filters.types,
      statuses: filters.statuses,
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
      query: filters.query,
    });

    const lines = [
      CSV_HEADERS.join(","),
      ...rows.map((r) =>
        [
          csvCell(r.createdAt),
          csvCell(r.orgName),
          csvCell(r.type),
          csvCell(r.status),
          csvCell(r.signedAmount.toFixed(2)),
          csvCell(r.balanceAfter?.toFixed(2) ?? ""),
          csvCell(r.currency),
          csvCell(r.shipmentNumber),
          csvCell(r.razorpayPaymentId),
          csvCell(r.actorName),
          csvCell(r.notes),
        ].join(","),
      ),
    ];

    const stamp = new Date().toISOString().slice(0, 10);

    return {
      ok: true,
      csv: lines.join("\n"),
      filename: `arena-wallet-transactions-${stamp}.csv`,
      rowCount: rows.length,
      truncated,
    };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return { ok: false, error: error.message };
    }

    Sentry.captureException(error, { tags: { location: "exportWalletTransactionsAction" } });
    return { ok: false, error: "Could not build the export. Please try again." };
  }
}
