import type { ElementType } from "react";
import {
  Banknote,
  CreditCard,
  Landmark,
  MoreHorizontal,
  ReceiptText,
  Smartphone,
} from "lucide-react";

import type { PaymentCollectionMethod, PaymentCollectionStatus } from "@/generated/prisma";

/**
 * Shared, framework-free logic and copy for deferred payment collection. No
 * Prisma client and no server imports, so both the mutation path and the client
 * components can use it and agree on exactly what a status means.
 */

/**
 * One paisa. Money is stored to four decimal places, so comparing a running total
 * against a quoted total with `>=` can leave a booking one hundredth of a rupee
 * short of COLLECTED forever, which reads as a bug to whoever is chasing it.
 */
const SETTLEMENT_TOLERANCE = 0.01;

/**
 * Derive a shipment's collection status from what has actually been collected.
 *
 * The single place this decision is made. Both recording a payment and reversing
 * one recompute through here from the sum of live collections, rather than nudging
 * the status along a path, so the status can never drift out of step with the rows
 * behind it.
 *
 * WRITTEN_OFF is deliberately sticky while nothing has been collected: an admin
 * decided this money is not coming, and reversing an unrelated payment should not
 * quietly reopen that decision. As soon as money does arrive, it stops being
 * written off, because it plainly was collectable after all.
 */
export function deriveCollectionStatus(params: {
  collected: number;
  quotedTotal: number | null;
  currentStatus: PaymentCollectionStatus;
}): PaymentCollectionStatus {
  const { collected, quotedTotal, currentStatus } = params;

  if (collected <= 0) {
    return currentStatus === "WRITTEN_OFF" ? "WRITTEN_OFF" : "PENDING";
  }

  if (quotedTotal != null && collected >= quotedTotal - SETTLEMENT_TOLERANCE) {
    return "COLLECTED";
  }

  return "PART_PAID";
}

/** What is still owed, floored at zero. */
export function amountOwed(quotedTotal: number | null, collected: number): number {
  return Math.max(0, (quotedTotal ?? 0) - collected);
}

/** True when the two figures are close enough to call settled. */
export function isSettled(quotedTotal: number | null, collected: number): boolean {
  if (quotedTotal == null) return false;
  return collected >= quotedTotal - SETTLEMENT_TOLERANCE;
}

// ---------------------------------------------------------------------------
// Display config
// ---------------------------------------------------------------------------

export type CollectionStatusConfig = {
  label: string;
  /** Plain language, for a tooltip. Says what it means, not what it is called. */
  hint: string;
  chip: string;
};

export const COLLECTION_STATUS_CONFIG: Record<
  PaymentCollectionStatus,
  CollectionStatusConfig
> = {
  NOT_REQUIRED: {
    label: "Paid at booking",
    hint: "This was paid from the wallet when it was booked, so there is nothing to collect.",
    chip: "bg-secondary text-muted-foreground border-border",
  },
  PENDING: {
    label: "Not paid yet",
    hint: "Booked without paying. The full amount is still owed.",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
  },
  PART_PAID: {
    label: "Part paid",
    hint: "Some money has come in. A balance is still owed.",
    chip: "bg-sky-50 text-sky-700 border-sky-200",
  },
  COLLECTED: {
    label: "Fully paid",
    hint: "The whole amount has been collected. Nothing left to chase.",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  WRITTEN_OFF: {
    label: "Written off",
    hint: "An admin decided this money is not coming back. It no longer counts as owed.",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export type PaymentMethodConfig = { label: string; icon: ElementType };

export const PAYMENT_METHOD_CONFIG: Record<PaymentCollectionMethod, PaymentMethodConfig> = {
  CASH: { label: "Cash", icon: Banknote },
  UPI: { label: "UPI", icon: Smartphone },
  BANK_TRANSFER: { label: "Bank transfer", icon: Landmark },
  CHEQUE: { label: "Cheque", icon: ReceiptText },
  CARD: { label: "Card", icon: CreditCard },
  OTHER: { label: "Something else", icon: MoreHorizontal },
};

/** What to ask for in the reference field, given how they paid. */
export const REFERENCE_PLACEHOLDER: Record<PaymentCollectionMethod, string> = {
  CASH: "Receipt number, if you gave one",
  UPI: "UPI reference number",
  BANK_TRANSFER: "Bank UTR number",
  CHEQUE: "Cheque number",
  CARD: "Last 4 digits or terminal reference",
  OTHER: "Anything that identifies this payment",
};

/**
 * How overdue something is, for colouring a row. Buckets match the aging report
 * on the overview tab so the two never disagree.
 */
export function agingTone(ageDays: number): "fresh" | "watch" | "late" | "stale" {
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 15) return "watch";
  if (ageDays <= 30) return "late";
  return "stale";
}

export const AGING_TONE_CLASS: Record<ReturnType<typeof agingTone>, string> = {
  fresh: "text-muted-foreground",
  watch: "text-amber-600",
  late: "text-orange-600",
  stale: "text-red-600",
};
