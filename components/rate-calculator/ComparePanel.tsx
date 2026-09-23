"use client";

/**
 * ComparePanel.tsx
 *
 * RESPONSIBILITY
 * --------------
 * Fixed bottom overlay that shows a side-by-side comparison of up to 3
 * selected quotes. Extracted from RateResultsList to reduce that component's
 * size and to make this reusable (e.g. could appear in a dedicated compare
 * page in the future).
 *
 * DATA SOURCE
 * -----------
 * Reads compare state and quotes directly from the Zustand store. Takes
 * no props — it finds everything it needs itself.
 */

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { RateQuote } from "@/lib/types";
import { useAppStore } from "@/store";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { aramexAccountShortLabel } from "@/lib/aramex/accountKeys";
import { displayServiceName } from "@/lib/branding/serviceName";
import { fmt } from "@/utils/helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


/**
 * Stable identity for a quote within one result list. Drives compare selection,
 * the cheapest/fastest badges and the React keys in RateResultList.
 *
 * `courierId` IS PART OF THE IDENTITY, and it has to be. Arena staff see one
 * row per sourcing account, so a lane can return two quotes with the same
 * vendor and the same product name that are genuinely different options at
 * different prices. Keyed on vendor + product alone they would share an
 * identity: selecting one for comparison would select both, the badges would
 * land on whichever matched first, and React would warn on duplicate keys.
 *
 * Price is deliberately NOT in the key. It changes on every re-quote, and an
 * identity that moves with it cannot survive a refresh.
 */
export function quoteKey(q: RateQuote): string {
  return `${q.vendorId}::${q.productName}::${q.courierId ?? ""}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ComparePanel() {
  const compareIds = useAppStore((s) => s.compareIds);
  const allQuotes = useAppStore((s) => s.quotes);
  const toggleCompareId = useAppStore((s) => s.toggleCompareId);
  const disableCompareMode = useAppStore((s) => s.disableCompareMode);
  const isArena = useIsArenaOrg();

  const selected = compareIds
    .map((id) => allQuotes.find((q) => quoteKey(q) === id))
    .filter((q): q is RateQuote => q !== undefined);

  // Panel only renders when 2+ quotes are selected
  if (selected.length < 2) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-2xl">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">
            Comparing {selected.length} option{selected.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={disableCompareMode}
            className="h-7 gap-1 text-xs"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </Button>
        </div>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${selected.length}, 1fr)` }}
        >
          {selected.map((q) => {
            const id = quoteKey(q);
            return (
              <div
                key={id}
                className="relative rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <button
                  onClick={() => toggleCompareId(id)}
                  className="absolute right-2 top-2 text-slate-300 hover:text-slate-500 transition-colors"
                  aria-label={`Remove ${q.productName} from comparison`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                {/*
                  Arena staff see the sourcing vendor and, for Aramex, WHICH of
                  Arena's contracts quoted it — the compare panel is where two
                  rates are weighed against each other, so "the cheaper one, on
                  which account" is exactly the question being asked here.
                  Renders nothing for every other vendor.
                */}
                {isArena && (
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 mb-1">
                    {q.vendorName}
                    {aramexAccountShortLabel(q.courierId) && (
                      <span className="text-slate-400/80">
                        {" · "}
                        {aramexAccountShortLabel(q.courierId)}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-sm font-semibold text-slate-800 pr-5 leading-snug mb-2">
                  {displayServiceName(q.productName, isArena)}
                </p>

                <div className="space-y-1 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Price (incl.)</span>
                    <span className="font-semibold text-slate-800">
                      {fmt(q.totalWithTax, q.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price (excl.)</span>
                    <span>{fmt(q.totalWithoutTax, q.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Transit</span>
                    <span>{q.tatDays > 0 ? `${q.tatDays} days` : "TBD"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Charges</span>
                    <span>{q.charges.length}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}