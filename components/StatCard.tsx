import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Info } from "lucide-react";
import { Skeleton } from "./ui/skeleton";

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tooltip,
}: {
  label: string;
  /** The figure. Pass <StatCardValueSkeleton /> while it loads; label and icon stay real. */
  value: React.ReactNode;
  /** Pass <StatCardSubSkeleton /> when the line is data-driven and still loading. */
  sub?: React.ReactNode;
  icon: React.ElementType;
  tooltip?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
/** The figure's 32px line, with a bar inside it, so the card keeps its height. */
export function StatCardValueSkeleton({ className = "w-12" }: { className?: string }) {
  return (
    <span className="flex h-8 items-center">
      <Skeleton className={`h-6 ${className}`} />
    </span>
  );
}

/** A data-driven 16px sub line. Static sub lines should be passed as text instead. */
export function StatCardSubSkeleton({ className = "w-28" }: { className?: string }) {
  return (
    <span className="flex h-4 items-center">
      <Skeleton className={`h-3 ${className}`} />
    </span>
  );
}
