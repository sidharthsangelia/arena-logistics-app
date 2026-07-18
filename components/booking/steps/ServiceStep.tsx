"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Truck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  TrendingDown,
  ArrowRight,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { BookingFormData, ServiceOption } from "@/types/booking.types";
import type { RateRequest } from "@/lib/types";
import { getRatesAction } from "@/actions/rates.action";
import { COUNTRY_TO_ISO } from "@/utils/data";
import {
  boxesToRatePackages,
  totalActualWeight,
  totalBoxCount,
  totalDeclaredValue,
} from "@/lib/booking/cargo";

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
// Formatters
// ---------------------------------------------------------------------------

function fmt(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
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
// RateCard
// ---------------------------------------------------------------------------

function RateCard({
  quote,
  selected,
  isCheapest,
  isFastest,
  onSelect,
}: {
  quote: ServiceOption;
  selected: boolean;
  isCheapest: boolean;
  isFastest: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full rounded-lg border text-left transition-all duration-150",
        selected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
          : "border-border bg-card hover:border-primary/50 hover:shadow-sm",
      )}
    >
      {(isCheapest || isFastest) && !selected && (
        <div className="flex gap-1.5 border-b border-border/60 px-4 py-2">
          {isCheapest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <TrendingDown className="h-2.5 w-2.5" />
              Best price
            </span>
          )}
          {isFastest && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <Zap className="h-2.5 w-2.5" />
              Fastest
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 px-4 py-4">
        <div
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {selected && <CheckCircle2 className="h-3 w-3" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-tight">
            {quote.productName}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">
              {quote.vendorName}
            </Badge>
            {quote.transitDays > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {quote.transitDays} {quote.transitDays === 1 ? "day" : "days"}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-foreground">
            {fmt(quote.price, quote.currency)}
          </p>
          <p className="text-[10px] text-muted-foreground">incl. GST</p>
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-1.5 border-t border-primary/20 bg-primary/5 px-4 py-2 text-xs font-medium text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Selected — click Next to confirm
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Route summary pill
// ---------------------------------------------------------------------------

function RouteSummary({ data }: { data: BookingFormData }) {
  const totalWeight = totalActualWeight(data.boxes);
  const totalPieces = totalBoxCount(data.boxes);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">
        {data.consignor.city} → {data.consignee.city}, {data.consignee.country}
      </span>
      <Separator orientation="vertical" className="h-3" />
      <span>{totalPieces} box{totalPieces !== 1 ? "es" : ""}</span>
      <Separator orientation="vertical" className="h-3" />
      <span>{totalWeight.toFixed(2)} kg</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function RateSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-lg border bg-muted/40"
          style={{ opacity: 1 - i * 0.15 }}
        />
      ))}
      <p className="pt-1 text-center text-xs text-muted-foreground" aria-live="polite">
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
  const [quotes, setQuotes] = useState<ServiceOption[]>([]);
  const [vendorErrors, setVendorErrors] = useState<{ vendorId: string; message: string }[]>([]);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();
  const [hasFetched, setHasFetched]     = useState(false);

  const selectedService = watch("selectedService");
  const serviceError    = errors.selectedService?.message as string | undefined;

  const fetchRates = () => {
    setFetchError(null);
    setVendorErrors([]);
    setQuotes([]);

    startTransition(async () => {
      try {
        const request = buildRateRequest(formData);
        const result  = await getRatesAction(request);

        if (!result.success && result.quotes.length === 0) {
          setFetchError(result.error ?? "No rates returned from carriers.");
          return;
        }

        const mapped: ServiceOption[] = result.quotes.map((q: any) => ({
          vendorId:   q.vendorId,
          vendorName: q.vendorName,
          productCode: `${q.vendorId}-${q.productName}-${q.totalWithTax}`,
          productName: q.productName,
          transitDays: q.tatDays ?? 0,
          price:       q.totalWithTax,
          currency:    q.currency ?? "INR",
        }));

        setQuotes(mapped);
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

  const cheapestPrice = quotes.length > 0 ? Math.min(...quotes.map((q) => q.price)) : Infinity;
  const fastestDays   = quotes.length > 0
    ? Math.min(...quotes.filter((q) => q.transitDays > 0).map((q) => q.transitDays))
    : Infinity;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Choose a Shipping Service</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live quotes from our carrier network, sorted by price.
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
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {formData.boxes.length > 0 && <RouteSummary data={formData} />}

      {isPending && <RateSkeleton />}

      {!isPending && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Couldn't fetch rates</p>
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
          <p className="font-medium mb-1">Some carriers didn't respond:</p>
          <ul className="space-y-0.5 text-amber-700">
            {vendorErrors.map((e) => (
              <li key={e.vendorId}>
                <span className="font-medium">{e.vendorId}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isPending && quotes.length > 0 && (
        <div className="space-y-2">
          {quotes.map((quote) => (
            <RateCard
              key={`${quote.vendorId}-${quote.productName}-${quote.price}`}
              quote={quote}
              selected={
                selectedService?.vendorId === quote.vendorId &&
                selectedService?.productCode === quote.productCode
              }
              isCheapest={quote.price === cheapestPrice}
              isFastest={quote.transitDays > 0 && quote.transitDays === fastestDays}
              onSelect={() => setValue("selectedService", quote, { shouldValidate: true })}
            />
          ))}
          <p className="pt-1 text-center text-xs text-muted-foreground">
            {quotes.length} service{quotes.length !== 1 ? "s" : ""} available · Prices include GST
          </p>
        </div>
      )}

      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed py-12 text-center">
          <Truck className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No services available for this route</p>
          <p className="text-xs text-muted-foreground">
            Check the destination postal code or adjust item details.
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