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
  // Only this calculator's own results should show. Because the store is a
  // single shared singleton across both routes, a client-side navigation can
  // leave the other calculator's results in the store; the scope gate below
  // hides them until a fresh search for THIS scope runs.
  const isThisScope = useAppStore((s) => s.activeScope === scope);
  const resetCalculator = useAppStore((s) => s.resetCalculator);

  // Full ephemeral reset when this calculator mounts (or the scope changes), so
  // a fresh visit starts empty — no results, filters, sort, compare, or open
  // quote sheet carried over from the other calculator.
  useEffect(() => {
    resetCalculator();
  }, [scope, resetCalculator]);

  return (
    <div className="space-y-6">
      <RateCalculatorForm scope={scope} />

      {error && isThisScope && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasResults && hasRequest && isThisScope && (
        <RateResultsList variant={scope} />
      )}
    </div>
  );
}