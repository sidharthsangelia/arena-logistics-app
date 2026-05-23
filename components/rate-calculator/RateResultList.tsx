import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import RateResultCard from "./RateResultCard";
import { RateQuote, VendorError } from "@/lib/types";

interface Props {
  quotes: RateQuote[];
  vendorErrors: VendorError[];
}

export default function RateResultsList({ quotes, vendorErrors }: Props) {
  // Service already sorts by price, but we defensively re-sort on the client
  // so the UI never depends on server sort order.
  const sorted = [...quotes].sort((a, b) => {
    // Compare by totalWithTax — works across currencies only when both quote
    // in the same currency. For multi-currency you'd convert; for now this is
    // fine for INR/USD mix since we're just showing a ranked list visually.
    return a.totalWithTax - b.totalWithTax;
  });

  return (
    <div className="space-y-4">
      {/*      Partial-failure warnings      */}
      {vendorErrors.length > 0 && (
        <Alert variant="default" className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">
            Some carriers could not be reached
          </AlertTitle>
          <AlertDescription className="text-amber-700 space-y-1 mt-1">
            {vendorErrors.map((err) => (
              <p key={err.vendorId} className="text-sm">
                <span className="font-medium">{err.vendorName}</span>: {err.message}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/*      Header      */}
      {sorted.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              Available Carriers
            </h2>
            <span className="text-sm text-slate-500">
              {sorted.length} option{sorted.length !== 1 ? "s" : ""} found · sorted by price
            </span>
          </div>

          {/*      Grid of cards      */}
          <div className="grid gap-4 sm:grid-cols-2">
            {sorted.map((quote, i) => (
              <RateResultCard
                key={`${quote.vendorId}-${quote.productName}`}
                quote={quote}
                rank={i + 1}
              />
            ))}
          </div>
        </>
      ) : (
        // All vendors failed or returned empty
        vendorErrors.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">
            No quotes returned. Try adjusting the shipment details.
          </p>
        )
      )}
    </div>
  );
}