"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Truck,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  MapPin,
  Scale,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { BookingFormData } from "@/types/booking.types";
import type { RateRequest, RateQuote } from "@/lib/types";
import { getRatesAction } from "@/actions/rates.action";
import { COUNTRY_TO_ISO } from "@/utils/data";
import {
  boxesToRatePackages,
  totalActualWeight,
  totalBoxCount,
  totalChargeableWeight,
  totalDeclaredValue,
} from "@/lib/booking/cargo";
import { RateOptionPicker, quoteToServiceOption } from "../RateOptionPicker";

function toISO(country: string): string {
  if (!country) return "";
  if (country.length === 2) return country.toUpperCase();
  return COUNTRY_TO_ISO[country] ?? country.slice(0, 2).toUpperCase();
}

/**
 * Builds the rate request payload.
 *
 * Sends the real per-box `packages` array (one entry per line item, each
 * with its own per-box weight, dimensions and quantity). The adapters decide
 * per vendor how to consume it: Shipmozo takes the multi-box array natively;
 * Skart and Aramex collapse it to one chargeable weight via
 * lib/pricing/chargeableWeight (per-package max → sum). This replaces the old
 * "sum weight + largest single box" hack that mispriced mixed shipments.
 *
 * The legacy single `weight`/`quantity`/`dimensions` fields are still derived
 * as a fallback so any external consumer of the same shape keeps working, but
 * `packages` is the source of truth once present.
 *
 * `declaredValue` (total declared goods value) is sent for Shipmozo's customs
 * duty calculation.
 */
function buildRateRequest(data: BookingFormData): RateRequest {
  const boxes = data.boxes;
  if (!boxes.length) throw new Error("At least one box is required.");

  const packages = boxesToRatePackages(boxes);

  const totalWeight = totalActualWeight(boxes);
  const totalPieces = totalBoxCount(boxes);
  const declaredValue = totalDeclaredValue(boxes);
  const firstDescription = boxes[0]?.contents[0]?.description || "General Cargo";

  return {
    origin: {
      city: data.consignor.city,
      pincode: data.consignor.postalCode,
      countryCode: toISO(data.consignor.country),
      country: data.consignor.country.toUpperCase(),
      line1: data.consignor.addressLine1,
    },
    destination: {
      city: data.consignee.city,
      pincode: data.consignee.postalCode,
      countryCode: toISO(data.consignee.country),
      country: data.consignee.country.toUpperCase(),
      line1: data.consignee.addressLine1,
    },
    shipment: {
      // Preferred multi-piece path.
      packages,
      declaredValue,
      description: firstDescription,
      // Legacy aggregate fallback (first box represents dimensions).
      weight: totalWeight,
      quantity: totalPieces,
      dimensions: {
        length: Math.max(Number(boxes[0]?.lengthCm) || 0, 1),
        width: Math.max(Number(boxes[0]?.widthCm) || 0, 1),
        height: Math.max(Number(boxes[0]?.heightCm) || 0, 1),
        unit: "cm" as const,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ServiceSelectionStepProps {
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  formData: BookingFormData;
}

// ---------------------------------------------------------------------------
// Route summary
// ---------------------------------------------------------------------------

function RouteSummary({ data }: { data: BookingFormData }) {
  const chargeable = totalChargeableWeight(data.boxes);
  const totalPieces = totalBoxCount(data.boxes);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">{data.consignor.city || "Origin"}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {data.consignee.city || "Destination"}, {data.consignee.country}
      </span>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <span className="text-xs text-muted-foreground">
        {totalPieces} box{totalPieces !== 1 ? "es" : ""}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Scale className="h-3.5 w-3.5" />
        {chargeable.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg chargeable
      </span>
    </div>
  );
}

function RateSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        Fetching live rates from carriers…
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceSelectionStep
// ---------------------------------------------------------------------------

export default function ServiceSelectionStep({
  watch,
  setValue,
  errors,
  formData,
}: ServiceSelectionStepProps) {
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [vendorErrors, setVendorErrors] = useState<{ vendorId: string; message: string }[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);

  const selectedService = watch("selectedService");
  const serviceError = errors.selectedService?.message as string | undefined;

  const fetchRates = () => {
    setFetchError(null);
    setVendorErrors([]);
    setQuotes([]);

    startTransition(async () => {
      try {
        const request = buildRateRequest(formData);
        const result = await getRatesAction(request);

        if (!result.success && result.quotes.length === 0) {
          setFetchError(result.error ?? "No rates returned from carriers.");
          return;
        }

        setQuotes(result.quotes);
        setVendorErrors(result.vendorErrors ?? []);
        setHasFetched(true);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Unexpected error fetching rates.");
      }
    });
  };

  useEffect(() => {
    if (!hasFetched) fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pick your shipping service</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live quotes from our carrier network. Sort, filter, and open any
            card to see exactly what makes up the price.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={fetchRates}
          className="shrink-0"
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {formData.boxes.length > 0 && <RouteSummary data={formData} />}

      {isPending && <RateSkeleton />}

      {!isPending && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Couldn&apos;t fetch rates</p>
            <p className="mt-0.5 text-muted-foreground">{fetchError}</p>
            <button
              type="button"
              onClick={fetchRates}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Try again <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {!isPending && vendorErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="mb-1 font-medium">Some carriers didn&apos;t respond:</p>
          <ul className="space-y-0.5 text-amber-700">
            {vendorErrors.map((e) => (
              <li key={e.vendorId}>
                <span className="font-medium">{e.vendorId}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isPending && quotes.length > 0 && (
        <RateOptionPicker
          quotes={quotes}
          selectedKey={selectedService?.productCode ?? null}
          onSelect={(q) => setValue("selectedService", quoteToServiceOption(q), { shouldValidate: true })}
        />
      )}

      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Truck className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No services available for this route</p>
          <p className="text-xs text-muted-foreground">
            Check the destination postal code or adjust the item details.
          </p>
        </div>
      )}

      {serviceError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" aria-live="polite">
          <AlertTriangle className="h-3.5 w-3.5" />
          {serviceError}
        </p>
      )}
    </div>
  );
}
