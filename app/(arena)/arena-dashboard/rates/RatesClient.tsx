"use client";

/**
 * RatesClient.tsx
 *
 * RESPONSIBILITY
 * --------------
 * Thin orchestrator that renders the form, an error banner, and the results
 * list. It owns NO local state — everything comes from the Zustand store.
 *
 * WHY NO LOCAL STATE HERE
 * -----------------------
 * This component sits at the top of the rate-calculator subtree. If it held
 * useState for loading/error/quotes, every child would need those values
 * passed as props. With Zustand, children read exactly what they need from
 * the store with granular selectors and only re-render when their slice
 * actually changes.
 *
 * WHAT THIS COMPONENT DOES NOT DO
 * --------------------------------
 * - Does not call fetch()
 * - Does not call the Server Action directly (the store's fetchRates does)
 * - Does not manage sort/filter/compare state (ui.slice and compare.slice do)
 */

import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

import RateCalculatorForm from "@/components/rate-calculator/RateCalculatorForm";
import { useAppStore } from "@/store";
import RateResultsList from "@/components/rate-calculator/RateResultList";
import type { RateScope } from "@/lib/types";


export default function RatesClient({
  scope = "international",
}: {
  /** Which calculator to render. Defaults to international. */
  scope?: RateScope;
}) {
  const error = useAppStore((s) => s.error);
  const hasResults = useAppStore(
    (s) => s.quotes.length > 0 || s.vendorErrors.length > 0
  );
  const hasRequest = useAppStore((s) => s.request !== null);
  const clearRates = useAppStore((s) => s.clearRates);

  // The rate store is shared between the international and domestic calculators
  // (separate routes, one in-memory store). Clear any prior result when this
  // calculator mounts so a fresh visit starts empty — results appear only after
  // the user fills the form and clicks Get rates, never carried over from the
  // other calculator.
  useEffect(() => {
    clearRates();
  }, [scope, clearRates]);

  return (
    <div className="space-y-6">
      <RateCalculatorForm scope={scope} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasResults && hasRequest && <RateResultsList />}
    </div>
  );
}