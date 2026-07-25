import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { InvoiceStatus } from "@/generated/prisma";
import {
  INVOICE_STATUS_CONFIG,
  deriveInvoiceStatusView,
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
  const view = deriveInvoiceStatusView(status, dueDate);
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
