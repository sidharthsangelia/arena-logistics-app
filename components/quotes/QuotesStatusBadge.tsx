/**
 * src/components/quotes/QuoteStatusBadge.tsx
 *
 * Renders a shadcn Badge for a QuoteStatus value.
 * Uses only the four Badge variants that ship with shadcn
 * (default, secondary, outline, destructive) — no custom colours.
 */

import { Badge } from "@/components/ui/badge";
import type { QuoteStatus } from "@/generated/prisma";

const CONFIG: Record<
  QuoteStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  DRAFT:     { label: "Draft",     variant: "secondary" },
  SENT:      { label: "Sent",      variant: "default"   },
  ACCEPTED:  { label: "Accepted",  variant: "outline"   },
  EXPIRED:   { label: "Expired",   variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

export default function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}