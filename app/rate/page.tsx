"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import RateCalculatorForm from "@/components/rate-calculator/RateCalculatorForm";
import RateResultsList from "@/components/rate-calculator/RateResultList";
import { fetchRates } from "@/lib/api";
import { RateRequest, RateResult } from "@/lib/types";

export default function HomePage() {
  const [results, setResults] = useState<RateResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: RateRequest) => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetchRates(data);
      setResults(res.data);
    } catch (err: unknown) {
      // If the proxy returned a structured error, show it + raw snippet
      if (err instanceof Error && err.message.includes("non-JSON")) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          {/* <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            SK
          </div> */}
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-none">Arena Cargo And Logistics</h1>
            <p className="text-xs text-slate-500 mt-0.5">International Rate Calculator</p>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <RateCalculatorForm onSubmit={handleSubmit} loading={loading} />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results && <RateResultsList results={results} />}
      </div>
    </main>
  );
}