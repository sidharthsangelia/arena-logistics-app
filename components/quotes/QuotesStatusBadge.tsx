// components/quotes/QuotesStatusBadge.tsx

import type { QuoteStatus } from "@/generated/prisma";

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT:     "Draft",
  SENT:      "Sent",
  ACCEPTED:  "Accepted",
  EXPIRED:   "Expired",
  CANCELLED: "Cancelled",
};

const STATUS_STYLES: Record<QuoteStatus, string> = {
  DRAFT:
    "bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:ring-zinc-700",
  SENT:
    "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-800",
  ACCEPTED:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-800",
  EXPIRED:
    "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-800",
  CANCELLED:
    "bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-800",
};

const STATUS_DOT: Record<QuoteStatus, string> = {
  DRAFT:     "bg-zinc-400 dark:bg-zinc-500",
  SENT:      "bg-blue-500 dark:bg-blue-400",
  ACCEPTED:  "bg-emerald-500 dark:bg-emerald-400",
  EXPIRED:   "bg-amber-500 dark:bg-amber-400",
  CANCELLED: "bg-red-500 dark:bg-red-400",
};

export default function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ${STATUS_STYLES[status]}`}
    >
    
      {STATUS_LABEL[status]}
    </span>
  );
}