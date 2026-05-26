"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

import RateCalculatorForm from "@/components/rate-calculator/RateCalculatorForm";
import RateResultsList from "@/components/rate-calculator/RateResultList";

import { RateRequest, RateQuote, VendorError, VendorId } from "@/lib/types";
import { fetchRates } from "@/lib/api";

export default function RatesClient() {
  const [quotes, setQuotes] = useState<RateQuote[] | null>(null);
  const [vendorErrors, setVendorErrors] = useState<VendorError[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<RateRequest | null>(null); // ← add this

  const handleSubmit = async (data: RateRequest, vendors: VendorId[]) => {
    setLoading(true);
    setError(null);
    setQuotes(null);
    setVendorErrors([]);
    setRequest(data); // ← save the request here

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
    <>
      <RateCalculatorForm onSubmit={handleSubmit} loading={loading} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {quotes !== null && request && ( // ← guard on request too
        <RateResultsList quotes={quotes} vendorErrors={vendorErrors} request={request} />
      )}
    </>
  );
}
