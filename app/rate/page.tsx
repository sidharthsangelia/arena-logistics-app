"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import Image from "next/image";
import RateCalculatorForm from "@/components/rate-calculator/RateCalculatorForm";

import { fetchRates } from "@/lib/api";
import { RateRequest, RateQuote, VendorError, VendorId } from "@/lib/types";
import RateResultsList from "@/components/rate-calculator/RateResultList";

export default function HomePage() {
  // Split quotes and vendorErrors into separate state so RateResultsList can
  // render a "partial failure" warning alongside whatever quotes did come back.
  const [quotes, setQuotes] = useState<RateQuote[] | null>(null);
  const [vendorErrors, setVendorErrors] = useState<VendorError[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: RateRequest, vendors: VendorId[]) => {
    setLoading(true);
    setError(null);
    setQuotes(null);
    setVendorErrors([]);

    try {
      // Pass the vendor filter; empty array means "query all"
      const selectedVendors = vendors.length < 2 ? vendors : [];
      const res = await fetchRates(data, selectedVendors);

      setQuotes(res.quotes);
      setVendorErrors(res.vendorErrors);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Image
            src="/arena_logo.png"
            alt="Arena Cargo And Logistics"
            width={128}
            height={32}
          />
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-none">
              Arena Cargo And Logistics
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              International Rate Calculator
            </p>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <RateCalculatorForm onSubmit={handleSubmit} loading={loading} />

        {/* Hard error (network failure, 5xx, non-JSON response, etc.) */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results — shown as soon as we have a response, even if partial */}
        {quotes !== null && (
          <RateResultsList quotes={quotes} vendorErrors={vendorErrors} />
        )}
      </div>
    </main>
  );
}