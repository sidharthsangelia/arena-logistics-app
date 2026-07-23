"use client";

import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Clock,
  FileText,
  Layers,
  TrendingDown,
  Zap,
} from "lucide-react";
import { RateQuote } from "@/lib/types";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { carrierLogo } from "@/lib/carrierLogo";

interface Props {
  quote: RateQuote;
  rank: number;
  isCheapest: boolean;
  isFastest: boolean;
  compareMode: boolean;
  isCompareSelected: boolean;
  isCompareDisabled: boolean;
  viewMode: "grid" | "list";
  onClick: () => void;
  /** International only. Domestic cards pass nothing and show no carrier logo. */
  showCarrierLogo?: boolean;
}

// ─── vendor badge colours (visual cue per carrier) ──────────────────────────

const VENDOR_BADGE: Record<string, string> = {
  skart:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  aramex:
    "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
  shipmozo:
    "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800",
};

function vendorBadgeClass(id: string) {
  return VENDOR_BADGE[id] ?? "bg-muted text-muted-foreground border-border";
}

// ─── formatters ─────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── component ───────────────────────────────────────────────────────────────

export default function RateResultCard({
  quote,
  isCheapest,
  isFastest,
  compareMode,
  isCompareSelected,
  isCompareDisabled,
  viewMode,
  onClick,
  showCarrierLogo = false,
}: Props) {
  const logo = carrierLogo(quote.productName);

  // Ring / border highlight logic. Emerald cue = best price (savings);
  // primary ring = selected for compare.
  const ringClass = isCompareSelected
    ? "ring-2 ring-primary bg-muted/40"
    : isCheapest && !compareMode
      ? "ring-2 ring-emerald-400 dark:ring-emerald-500"
      : "hover:ring-1 hover:ring-border";

  const disabledClass = isCompareDisabled
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer";

  const isArena = useIsArenaOrg();

  return (
    <Card
      className={cn(
        "transition-all select-none",
        ringClass,
        disabledClass,
        compareMode ? "hover:ring-2 hover:ring-primary/40" : "hover:shadow-md",
        viewMode === "list" && "flex flex-row items-stretch",
      )}
      onClick={isCompareDisabled ? undefined : onClick}
    >
      {/* list-mode: left accent strip */}
      {viewMode === "list" && (
        <div
          className={cn(
            "w-1 shrink-0 rounded-l-lg",
            isCheapest && !compareMode ? "bg-primary" : "bg-transparent",
          )}
        />
      )}

      <div
        className={viewMode === "list" ? "flex flex-1 items-center" : "flex-1"}
      >
        <CardHeader
          className={cn("pb-2", viewMode === "list" && "flex-1 py-3")}
        >
          <div className="flex items-start justify-between gap-3">
            {/* ── left: badges + name + vendor ── */}
            <div className="min-w-0 flex-1 space-y-1.5">
              {!compareMode && (isCheapest || isFastest) && (
                <div className="flex flex-wrap gap-1.5">
                  {isCheapest && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                      <TrendingDown className="h-2.5 w-2.5" />
                      Cheapest
                    </span>
                  )}
                  {isFastest && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-400">
                      <Zap className="h-2.5 w-2.5" />
                      Fastest
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {showCarrierLogo && (
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    width={logo.width}
                    height={logo.height}
                    className="h-4 w-auto max-w-10 shrink-0 object-contain"
                  />
                )}
                <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
                  {quote.productName}
                </h3>
              </div>

              {isArena ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit text-[10px] font-medium",
                    vendorBadgeClass(quote.vendorId),
                  )}
                >
                  {quote.vendorName}
                </Badge>
              ) : null}
            </div>

            {/* ── right: price OR compare checkbox ── */}
            {compareMode ? (
              <div className="flex shrink-0 items-center pt-0.5">
                <Checkbox
                  checked={isCompareSelected}
                  disabled={isCompareDisabled}
                  onCheckedChange={() => !isCompareDisabled && onClick()}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4"
                />
              </div>
            ) : (
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold text-foreground">
                  {fmt(quote.totalWithTax, quote.currency)}
                </p>
                <p className="text-[10px] text-muted-foreground">incl. tax</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {fmt(quote.totalWithoutTax, quote.currency)}{" "}
                  <span className="text-[10px] text-muted-foreground">
                    excl.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* ── meta row ── */}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {quote.tatDays > 0
                ? `${quote.tatDays} day${quote.tatDays !== 1 ? "s" : ""}`
                : "TAT TBD"}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {quote.charges.length} charge
              {quote.charges.length !== 1 ? "s" : ""}
            </span>
            {!compareMode && (
              <span className="ml-auto flex items-center gap-1 text-primary">
                <FileText className="h-3 w-3" />
                <span className="text-[10px]">Get quote</span>
              </span>
            )}
          </div>
        </CardHeader>

        {/* ── charges collapsible (grid view only) ── */}
        {!compareMode && viewMode === "grid" && quote.charges.length > 0 && (
          <CardContent className="pt-0">
            <Separator className="mb-2" />
            <Collapsible>
              <CollapsibleTrigger
                className="group flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                View charge breakdown
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2.5 space-y-1.5">
                  {quote.charges.map((charge, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {charge.name}
                      </span>
                      <div className="text-right">
                        <span className="font-medium text-foreground">
                          {fmt(charge.amount, charge.currency)}
                        </span>
                        {charge.taxAmount !== undefined &&
                          charge.taxAmount > 0 && (
                            <span className="ml-1.5 text-muted-foreground">
                              (+{fmt(charge.taxAmount, charge.currency)} tax)
                            </span>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        )}
      </div>
    </Card>
  );
}
