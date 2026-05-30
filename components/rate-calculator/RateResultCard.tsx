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

// ─── vendor badge colour map ----─

const VENDOR_BADGE: Record<string, string> = {
  skart:  "bg-blue-100   text-blue-800   border-blue-200",
  aramex: "bg-orange-100 text-orange-800 border-orange-200",
};

function vendorBadgeClass(id: string) {
  return VENDOR_BADGE[id] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

// ─── formatters -----──

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── component -----───

export default function RateResultCard({
  quote,
  rank,
  isCheapest,
  isFastest,
  compareMode,
  isCompareSelected,
  isCompareDisabled,
  viewMode,
  onClick,
}: Props) {
  const tax = quote.totalWithTax - quote.totalWithoutTax;

  // Ring / border highlight logic
  const ringClass = isCompareSelected
    ? "ring-2 ring-blue-500 bg-blue-50/20"
    : isCheapest && !compareMode
    ? "ring-2 ring-emerald-400"
    : "hover:ring-1 hover:ring-slate-300";

  // Disabled state in compare mode when 3 already selected
  const disabledClass = isCompareDisabled
    ? "opacity-50 cursor-not-allowed"
    : "cursor-pointer";

  return (
    <Card
      className={`transition-all select-none ${ringClass} ${disabledClass} ${
        compareMode ? "hover:ring-2 hover:ring-blue-300" : "hover:shadow-md"
      } ${viewMode === "list" ? "flex flex-row items-stretch" : ""}`}
      onClick={isCompareDisabled ? undefined : onClick}
    >
      {/* list-mode: left accent strip */}
      {viewMode === "list" && (
        <div
          className={`w-1 shrink-0 rounded-l-lg ${
            isCheapest && !compareMode ? "bg-emerald-400" : "bg-transparent"
          }`}
        />
      )}

      <div className={viewMode === "list" ? "flex flex-1 items-center" : "flex-1"}>
        <CardHeader
          className={`pb-2 ${viewMode === "list" ? "flex-1 py-3" : ""}`}
        >
          <div className="flex items-start justify-between gap-3">
            {/* ── left: badges + name + vendor -- -── */}
            <div className="min-w-0 flex-1 space-y-1.5">
              {/* status badges */}
              {!compareMode && (isCheapest || isFastest) && (
                <div className="flex flex-wrap gap-1.5">
                  {isCheapest && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <TrendingDown className="h-2.5 w-2.5" />
                      Best price
                    </span>
                  )}
                  {isFastest && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                      <Zap className="h-2.5 w-2.5" />
                      Fastest
                    </span>
                  )}
                </div>
              )}

              <h3 className="truncate text-sm font-semibold leading-tight text-slate-800">
                {quote.productName}
              </h3>

              <Badge
                variant="outline"
                className={`w-fit text-[10px] font-medium ${vendorBadgeClass(quote.vendorId)}`}
              >
                {quote.vendorName}
              </Badge>
            </div>

            {/* ── right: price OR compare checkbox -─────── */}
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
                <p className="text-lg font-bold text-slate-900">
                  {fmt(quote.totalWithTax, quote.currency)}
                </p>
                <p className="text-[10px] text-slate-400">incl. tax</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {fmt(quote.totalWithoutTax, quote.currency)}{" "}
                  <span className="text-[10px] text-slate-400">excl.</span>
                </p>
                {tax > 0 && (
                  <p className="text-[10px] text-slate-400">
                    Tax: {fmt(tax, quote.currency)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── meta row - -─-*/}
          <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
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
              <span className="ml-auto flex items-center gap-1 text-blue-400">
                <FileText className="h-3 w-3" />
                <span className="text-[10px]">Get quote</span>
              </span>
            )}
          </div>
        </CardHeader>

        {/* ── charges collapsible (grid view only, hides in list for compactness) ── */}
        {!compareMode && viewMode === "grid" && quote.charges.length > 0 && (
          <CardContent className="pt-0">
            <Separator className="mb-2" />
            <Collapsible>
              <CollapsibleTrigger
                className="group flex items-center gap-1 text-[10px] text-slate-400 transition-colors hover:text-slate-700"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
                View charge breakdown
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2.5 space-y-1.5">
                  {quote.charges.map((charge, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-slate-500">{charge.name}</span>
                      <div className="text-right">
                        <span className="font-medium text-slate-700">
                          {fmt(charge.amount, charge.currency)}
                        </span>
                        {charge.taxAmount !== undefined && charge.taxAmount > 0 && (
                          <span className="ml-1.5 text-slate-400">
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