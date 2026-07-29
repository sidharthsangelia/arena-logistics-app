import { Badge } from "@/components/ui/badge";
import type { QuoteStatus } from "@/generated/prisma";
import { QUOTE_STATUS_LABELS } from "@/lib/utils";

type Props = {
  counts: Array<{ status: QuoteStatus; _count: { _all: number } }>;
};

const STATUS_VARIANT: Record<QuoteStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "outline",
  SENT: "secondary",
  ACCEPTED: "default",
  EXPIRED: "outline",
  CANCELLED: "destructive",
};

export default function QuoteStatusBreakdown({ counts }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Quote pipeline
      </span>
      {counts.map(({ status, _count }) => (
        <Badge key={status} variant={STATUS_VARIANT[status]} className="font-normal">
          {QUOTE_STATUS_LABELS[status]} · {_count._all}
        </Badge>
      ))}
    </div>
  );
}