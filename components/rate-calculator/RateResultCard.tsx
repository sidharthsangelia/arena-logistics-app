"use client";

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
import { ChevronDown, Clock, FileText, Layers, TrendingDown, Zap } from "lucide-react";
import { RateQuote } from "@/lib/types";

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
}: Props) {
  const tax = quote.totalWithTax - quote.totalWithoutTax;

  // Ring / border highlight logic (shadcn tokens only)
  const ringClass = isCompareSelected
    ? "ring-2 ring-primary bg-muted/40"
    : isCheapest && !compareMode
    ? "ring-2 ring-primary"
    : "hover:ring-1 hover:ring-border";

  const disabledClass = isCompareDisabled
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer";

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

      <div className={viewMode === "list" ? "flex flex-1 items-center" : "flex-1"}>
        <CardHeader className={cn("pb-2", viewMode === "list" && "flex-1 py-3")}>
          <div className="flex items-start justify-between gap-3">
            {/* ── left: badges + name + vendor ── */}
            <div className="min-w-0 flex-1 space-y-1.5">
              {!compareMode && (isCheapest || isFastest) && (
                <div className="flex flex-wrap gap-1.5">
                  {isCheapest && (
                    <Badge className="gap-1 text-[10px] font-semibold">
                      <TrendingDown className="h-2.5 w-2.5" />
                      Best price
                    </Badge>
                  )}
                  {isFastest && (
                    <Badge variant="secondary" className="gap-1 text-[10px] font-semibold">
                      <Zap className="h-2.5 w-2.5" />
                      Fastest
                    </Badge>
                  )}
                </div>
              )}

              <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
                {quote.productName}
              </h3>

              <Badge variant="outline" className="w-fit text-[10px] font-medium">
                {quote.vendorName}
              </Badge>
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
                  <span className="text-[10px] text-muted-foreground">excl.</span>
                </p>
                {tax > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Tax: {fmt(tax, quote.currency)}
                  </p>
                )}
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
              {quote.charges.length} charge{quote.charges.length !== 1 ? "s" : ""}
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
                      <span className="text-muted-foreground">{charge.name}</span>
                      <div className="text-right">
                        <span className="font-medium text-foreground">
                          {fmt(charge.amount, charge.currency)}
                        </span>
                        {charge.taxAmount !== undefined && charge.taxAmount > 0 && (
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
