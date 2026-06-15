"use client";

/**
 * app/rates/domestic/DomesticRatesClient.tsx
 *
 * Single "use client" boundary for the domestic rates page. Holds the
 * server-action result in local state and passes it to the results list.
 * No Zustand store — the international flow's store is per-session global
 * app state for multi-vendor API calls; the domestic flow is a single
 * request/response per submit, so component state is sufficient and keeps
 * this page decoupled from the international store.
 */

import { useState } from "react";
 
 
import type { DomesticRateResult } from "@/lib/domestic/domestic.types";
import DomesticRateCalculatorForm from "@/components/rate-calculator/domestic/DomesticRateCalculatorForm";
import DomesticRateResultsList from "@/components/rate-calculator/domestic/DomesticRateResult";

export default function DomesticRatesClient() {
  const [result, setResult] = useState<DomesticRateResult | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-6">
      <DomesticRateCalculatorForm
        onResult={setResult}
        onLoadingChange={setLoading}
      />

      {loading && (
        <p className="py-4 text-center text-sm text-slate-400">
          Querying carrier rate cards…
        </p>
      )}

      {!loading && <DomesticRateResultsList result={result} />}
    </div>
  );
}