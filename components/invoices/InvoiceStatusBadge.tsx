import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InvoiceStatus } from "@/generated/prisma";
import {
  INVOICE_STATUS_CONFIG,
  deriveInvoiceStatusView,
  type InvoiceViewStatus,
} from "@/lib/invoices/config";

interface Props {
  status: InvoiceStatus;
  dueDate: string | Date | null | undefined;
  className?: string;
}

/**
 * Renders the DISPLAY status, not the stored one: an unpaid invoice past its due
 * date shows as "Overdue" in red, even though the DB still holds UNPAID.
 */
export function InvoiceStatusBadge({ status, dueDate, className }: Props) {
  return (
    <InvoiceViewStatusBadge
      view={deriveInvoiceStatusView(status, dueDate)}
      className={className}
    />
  );
}

/**
 * The same pill for a status that has already been derived — the merged tenant
 * feed does that on the server, because one of its two sources has no due date
 * to derive from in the first place.
 */
export function InvoiceViewStatusBadge({
  view,
  className,
}: {
  view: InvoiceViewStatus;
  className?: string;
}) {
  const cfg = INVOICE_STATUS_CONFIG[view];
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", cfg.className, className)}
    >
      {cfg.label}
    </Badge>
  );
}
