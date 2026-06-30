import { ShipmentStatus } from "@/generated/prisma";

export const STATUS_CONFIG: Record<
  ShipmentStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-secondary text-secondary-foreground border-border",
  },
  PENDING_PAYMENT: {
    label: "Pending Payment",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  },
  BOOKED: {
    label: "Booked",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  PROCESSING: {
    label: "Processing",
    className:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800",
  },
  DOCUMENTS_PENDING: {
    label: "Docs Pending",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
  },
  IN_TRANSIT: {
    label: "In Transit",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
  },
  CUSTOMS_HOLD: {
    label: "Customs Hold",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    className:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
  },
  DELIVERED: {
    label: "Delivered",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-secondary text-muted-foreground border-border",
  },
  ON_HOLD: {
    label: "On Hold",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
  },
};