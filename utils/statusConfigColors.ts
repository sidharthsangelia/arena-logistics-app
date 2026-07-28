import { ShipmentStatus } from "@/generated/prisma";

export const STATUS_CONFIG: Record<
  ShipmentStatus,
  {
    label: string;
    description: string;
    className: string;
    dotClassName: string;
  }
> = {
  DRAFT: {
    label: "Draft",
    description:
      "Your booking is being prepared and has not been submitted yet.",
    className: "bg-secondary text-secondary-foreground border-border",
    dotClassName: "bg-muted-foreground/40",
  },
  PENDING_PAYMENT: {
    label: "Pending Payment",
    description:
      "Your shipment is awaiting payment confirmation before it can be processed.",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
    dotClassName: "bg-amber-500",
  },
  BOOKED: {
    label: "Booked",
    description:
      "Your shipment has been confirmed and is in the operations queue for processing.",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
    dotClassName: "bg-blue-500",
  },
  PROCESSING: {
    label: "Processing",
    description:
      "Our operations team is preparing your shipment: labels, AWB, and carrier booking.",
    className:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800",
    dotClassName: "bg-indigo-500",
  },
  DOCUMENTS_PENDING: {
    label: "Documents Pending",
    description:
      "We need additional documents from you to proceed. Please check your email or contact support.",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
    dotClassName: "bg-orange-500",
  },
  IN_TRANSIT: {
    label: "In Transit",
    description:
      "Your shipment has been handed over to the carrier and is on its way to the destination.",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
    dotClassName: "bg-sky-500",
  },
  CUSTOMS_HOLD: {
    label: "Customs Hold",
    description:
      "Your shipment is being held at customs. Our team is working to resolve this. We will contact you if any action is needed.",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
    dotClassName: "bg-red-500",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    description: "Your shipment is out for final delivery today.",
    className:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
    dotClassName: "bg-violet-500",
  },
  DELIVERED: {
    label: "Delivered",
    description:
      "Your shipment has been successfully delivered to the destination.",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    description:
      "This shipment has been cancelled. Contact support if you believe this is an error.",
    className: "bg-secondary text-muted-foreground border-border",
    dotClassName: "bg-muted-foreground/30",
  },
  ON_HOLD: {
    label: "On Hold",
    description:
      "Your shipment is temporarily on hold. Our team will reach out with more information.",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
    dotClassName: "bg-yellow-500",
  },
};