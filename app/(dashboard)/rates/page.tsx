"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import RateCalculatorForm from "@/components/rate-calculator/RateCalculatorForm";
import RateResultsList from "@/components/rate-calculator/RateResultList";
import { fetchRates } from "@/lib/api";
import { RateRequest, RateQuote, VendorError, VendorId } from "@/lib/types";

export default function RatesPage() {
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
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Rate Calculator
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Get live shipping rates from all carriers instantly.
        </p>
      </div>

      <RateCalculatorForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {quotes !== null && (
        <RateResultsList quotes={quotes} vendorErrors={vendorErrors} />
      )}
    </div>
  );
}