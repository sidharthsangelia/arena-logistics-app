import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, Clock, Truck } from "lucide-react";
import { RateResult } from "@/lib/types";

interface Props {
  result: RateResult;
  rank: number;
}

const VENDOR_COLORS: Record<string, string> = {
  DHL: "bg-yellow-100 text-yellow-800 border-yellow-200",
  "DHL EXPRESS": "bg-yellow-100 text-yellow-800 border-yellow-200",
  Aramex: "bg-orange-100 text-orange-800 border-orange-200",
  "SKYNET EXPRESS": "bg-purple-100 text-purple-800 border-purple-200",
  Teleport: "bg-cyan-100 text-cyan-800 border-cyan-200",
  "UPS EXPRESS": "bg-amber-100 text-amber-800 border-amber-200",
  "sKart SELF International": "bg-blue-100 text-blue-800 border-blue-200",
};

function vendorColor(vendor: string) {
  return VENDOR_COLORS[vendor] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

function tatLabel(days: number) {
  if (days === 0) return "TAT TBD";
  return `${days} day${days !== 1 ? "s" : ""}`;
}

const fmt = (n: number | string) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function RateResultCard({ result, rank }: Props) {
  const activeCharges = result.charges.filter(
    (c) => parseFloat(c.charge_amount) > 0
  );

  return (
    <Card className={`transition-shadow hover:shadow-md ${rank === 1 ? "ring-2 ring-blue-500" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {rank === 1 && (
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                ✦ Best Price
              </span>
            )}
            <h3 className="font-semibold text-base leading-tight">{result.product_name}</h3>
            <Badge variant="outline" className={`w-fit text-xs ${vendorColor(result.parent_vendor)}`}>
              {result.parent_vendor}
            </Badge>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-bold text-slate-900">{fmt(result.grand_total_with_gst)}</div>
            <div className="text-xs text-slate-500">incl. GST</div>
            <div className="text-sm text-slate-600 mt-0.5">{fmt(result.grand_total_without_gst)} <span className="text-xs text-slate-400">excl.</span></div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
          <Clock className="h-3.5 w-3.5" />
          <span>{tatLabel(result.tat_days)}</span>
          <Truck className="h-3.5 w-3.5 ml-2" />
          <span>{activeCharges.length} charge{activeCharges.length !== 1 ? "s" : ""} apply</span>
        </div>
      </CardHeader>

      {activeCharges.length > 0 && (
        <CardContent className="pt-0">
          <Separator className="mb-3" />
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors group">
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
              View charge breakdown
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5">
                {activeCharges.map((charge) => (
                  <div key={charge.charge_id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{charge.charge_name}</span>
                    <div className="text-right">
                      <span className="font-medium">{fmt(charge.charge_amount)}</span>
                      {parseFloat(charge.igst_amount) > 0 && (
                        <span className="text-xs text-slate-400 ml-1">(+{fmt(charge.igst_amount)} GST)</span>
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