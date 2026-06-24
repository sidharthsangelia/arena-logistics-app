"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Truck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { BookingFormData, ServiceOption } from "@/types/booking.types";
import { getRatesAction } from "@/actions/rates.action";
 

// ---------------------------------------------------------------------------
// Helpers to map BookingFormData → RateRequest
// ---------------------------------------------------------------------------

function buildRateRequest(data: BookingFormData) {
  const { consignor, consignee, packages } = data;

  return {
    origin: {
      countryCode: consignor.country,
      postalCode: consignor.postalCode,
      city: consignor.city,
    },
    destination: {
      countryCode: consignee.country,
      postalCode: consignee.postalCode,
      city: consignee.city,
    },
    shipment: {
      packages: packages.map((p) => ({
        weightKg: p.weightKg * p.quantity,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        declaredValue: p.declaredValue,
      })),
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
  /** Full form snapshot so we can build the rate request */
  formData: BookingFormData;
}

// ---------------------------------------------------------------------------
// Rate card
// ---------------------------------------------------------------------------

function RateCard({
  quote,
  selected,
  onSelect,
}: {
  quote: ServiceOption & { transitDays: number };
  selected: boolean;
  onSelect: () => void;
}) {
  const isFastest = quote.transitDays <= 2;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative w-full rounded-xl border-2 p-5 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:shadow-sm",
      )}
    >
      {/* fastest badge */}
      {isFastest && (
        <span className="absolute -top-3 left-4 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <Zap className="h-3 w-3" />
          Fastest
        </span>
      )}

      {/* selected check */}
      {selected && (
        <CheckCircle2 className="absolute right-4 top-4 h-5 w-5 text-primary" />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{quote.vendorName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{quote.productName}</p>
        </div>

        <div className="text-right">
          <p className="text-xl font-bold">
            {quote.currency}{" "}
            {quote.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>
          {quote.transitDays} {quote.transitDays === 1 ? "day" : "days"} transit
        </span>
        <Badge variant="outline" className="ml-2 text-xs">
          {quote.productCode}
        </Badge>
      </div>
    </button>
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
  const [vendorErrors, setVendorErrors] = useState<
    { vendorId: string; message: string }[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);

  const selectedService = watch("selectedService");

  const fetchRates = () => {
    setFetchError(null);
    setVendorErrors([]);
    setQuotes([]);

    startTransition(async () => {
      try {
        const request = buildRateRequest(formData);
        const result = await getRatesAction(request as any);

        if (!result.success && result.quotes.length === 0) {
          setFetchError(result.error ?? "No rates returned from carriers.");
          return;
        }

        // Map canonical RateQuote → ServiceOption expected by the form
        const mapped: ServiceOption[] = result.quotes.map((q: any) => ({
          vendorId: q.vendorId,
          vendorName: q.vendorName,
          productCode: q.productCode ?? q.serviceCode ?? "",
          productName: q.productName ?? q.serviceName ?? q.productCode ?? "",
          transitDays: q.transitDays ?? 0,
          price: q.totalWithTax ?? q.total ?? 0,
          currency: q.currency ?? "INR",
        }));

        setQuotes(mapped);
        setVendorErrors(result.vendorErrors ?? []);
        setHasFetched(true);
      } catch (err) {
        setFetchError(
          err instanceof Error ? err.message : "Unexpected error fetching rates.",
        );
      }
    });
  };

  // Auto-fetch when step mounts
  useEffect(() => {
    if (!hasFetched) fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (quote: ServiceOption) => {
    setValue("selectedService", quote, { shouldValidate: true });
  };

  const serviceError = errors.selectedService?.message as string | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Select Shipping Service</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rates are live quotes from our carrier network based on your package
            details and destination.
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
          <RefreshCw className={cn("mr-2 h-4 w-4", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Loading skeleton */}
      {isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border-2 border-border bg-muted/40"
            />
          ))}
        </div>
      )}

      {/* Top-level fetch error */}
      {!isPending && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Could not fetch rates</p>
            <p className="mt-0.5 text-muted-foreground">{fetchError}</p>
          </div>
        </div>
      )}

      {/* Partial vendor errors */}
      {!isPending && vendorErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-medium text-amber-800">
            Some carriers could not be reached:
          </p>
          <ul className="space-y-0.5 text-xs text-amber-700">
            {vendorErrors.map((e) => (
              <li key={e.vendorId}>
                <span className="font-medium">{e.vendorId}</span> — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rate cards */}
      {!isPending && quotes.length > 0 && (
        <div className="space-y-3">
          {quotes.map((quote) => (
            <RateCard
              key={`${quote.vendorId}-${quote.productCode}`}
              quote={quote}
              selected={
                selectedService?.vendorId === quote.vendorId &&
                selectedService?.productCode === quote.productCode
              }
              onSelect={() => handleSelect(quote)}
            />
          ))}
        </div>
      )}

      {/* Empty state after fetch */}
      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-12 text-center">
          <Truck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No rates available for this route
          </p>
          <p className="text-xs text-muted-foreground">
            Try adjusting package dimensions or check the destination postal code.
          </p>
        </div>
      )}

      {/* Validation error (no service selected) */}
      {serviceError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {serviceError}
        </p>
      )}
    </div>
  );
}