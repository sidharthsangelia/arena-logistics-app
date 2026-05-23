import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, Clock, Layers } from "lucide-react";
import { RateQuote } from "@/lib/types";

interface Props {
  quote: RateQuote;
  rank: number; // 1 = cheapest
}

// ── Vendor badge colour ───────────────────────────────────────────────────────
// Keyed by vendorId (stable, from the adapter registry)
const VENDOR_BADGE: Record<string, string> = {
  skart:  "bg-blue-100   text-blue-800   border-blue-200",
  aramex: "bg-orange-100 text-orange-800 border-orange-200",
};

function vendorBadgeClass(vendorId: string) {
  return VENDOR_BADGE[vendorId] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

// ── Currency formatter ────────────────────────────────────────────────────────
// Handles both INR and USD (and any future currency the adapters return).
function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function tatLabel(days: number) {
  if (days <= 0) return "TAT TBD";
  return `${days} day${days !== 1 ? "s" : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RateResultCard({ quote, rank }: Props) {
  const tax = quote.totalWithTax - quote.totalWithoutTax;

  return (
    <Card
      className={`transition-shadow hover:shadow-md ${
        rank === 1 ? "ring-2 ring-blue-500" : ""
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">

          {/* Left: vendor + product info */}
          <div className="flex flex-col gap-1.5 min-w-0">
            {rank === 1 && (
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                ✦ Best Price
              </span>
            )}
            <h3 className="font-semibold text-base leading-tight truncate">
              {quote.productName}
            </h3>
            <Badge
              variant="outline"
              className={`w-fit text-xs ${vendorBadgeClass(quote.vendorId)}`}
            >
              {quote.vendorName}
            </Badge>
          </div>

          {/* Right: pricing */}
          <div className="text-right shrink-0">
            <div className="text-xl font-bold text-slate-900">
              {fmt(quote.totalWithTax, quote.currency)}
            </div>
            <div className="text-xs text-slate-500">incl. tax</div>
            <div className="text-sm text-slate-600 mt-0.5">
              {fmt(quote.totalWithoutTax, quote.currency)}{" "}
              <span className="text-xs text-slate-400">excl.</span>
            </div>
            {tax > 0 && (
              <div className="text-xs text-slate-400">
                Tax: {fmt(tax, quote.currency)}
              </div>
            )}
          </div>
        </div>

        {/* Meta row: TAT + charge count */}
        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {tatLabel(quote.tatDays)}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {quote.charges.length} charge{quote.charges.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>

      {/* Charges collapsible */}
      {quote.charges.length > 0 && (
        <CardContent className="pt-0">
          <Separator className="mb-3" />
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors group">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
              View charge breakdown
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 space-y-2">
                {quote.charges.map((charge, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600">{charge.name}</span>
                    <div className="text-right">
                      <span className="font-medium">
                        {fmt(charge.amount, charge.currency)}
                      </span>
                      {charge.taxAmount !== undefined && charge.taxAmount > 0 && (
                        <span className="text-xs text-slate-400 ml-1.5">
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
    </Card>
  );
}