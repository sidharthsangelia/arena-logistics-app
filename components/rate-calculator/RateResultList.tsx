import RateResultCard from "./RateResultCard";
import { RateResult } from "@/lib/types";

interface Props {
  results: RateResult[];
}

export default function RateResultsList({ results }: Props) {
  const sorted = [...results].sort(
    (a, b) => a.grand_total_with_gst - b.grand_total_with_gst
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Available Carriers
        </h2>
        <span className="text-sm text-slate-500">
          {results.length} option{results.length !== 1 ? "s" : ""} found · sorted by price
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {sorted.map((result, i) => (
          <RateResultCard key={result.product_name} result={result} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}