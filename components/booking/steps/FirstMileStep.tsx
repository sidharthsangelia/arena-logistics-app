"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Home,
  Warehouse,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { BookingFormData, ServiceOption } from "@/types/booking.types";
import { getDomesticRatesAction } from "@/actions/domesticRateCalculator.action";
import {
  buildFirstMileRequest,
  firstMilePickupSource,
  resolveFirstMileHub,
} from "@/lib/booking/firstMile";

// ---------------------------------------------------------------------------
// Formatter
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

interface FirstMileStepProps {
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  formData: BookingFormData;
}

// ---------------------------------------------------------------------------
// Rate card
// ---------------------------------------------------------------------------

function CourierCard({
  quote,
  selected,
  isCheapest,
  onSelect,
}: {
  quote: ServiceOption;
  selected: boolean;
  isCheapest: boolean;
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
      {isCheapest && !selected && (
        <div className="flex gap-1.5 border-b border-border/60 px-4 py-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <TrendingDown className="h-2.5 w-2.5" />
            Best price
          </span>
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
                {quote.transitDays} {quote.transitDays === 1 ? "day" : "days"} to hub
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
// Route pill (door → hub)
// ---------------------------------------------------------------------------

function RoutePill({ from, hubLabel }: { from: string; hubLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Home className="h-3.5 w-3.5" />
        {from || "Pickup"}
      </span>
      <ArrowRight className="h-3.5 w-3.5" />
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Warehouse className="h-3.5 w-3.5" />
        {hubLabel} hub
      </span>
      <Separator orientation="vertical" className="h-3" />
      <span>Domestic first-mile leg</span>
    </div>
  );
}

function RateSkeleton() {
  return (
    <div className="space-y-2.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-20 animate-pulse rounded-lg border bg-muted/40"
          style={{ opacity: 1 - i * 0.18 }}
        />
      ))}
      <p className="pt-1 text-center text-xs text-muted-foreground" aria-live="polite">
        Finding couriers for door pickup…
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FirstMileStep
// ---------------------------------------------------------------------------

export default function FirstMileStep({
  watch,
  setValue,
  errors,
  formData,
}: FirstMileStepProps) {
  const [quotes, setQuotes] = useState<ServiceOption[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);

  const selectedFirstMile = watch("firstMile");
  const firstMileError = errors.firstMile?.message as string | undefined;

  const hub = useMemo(() => resolveFirstMileHub(formData), [formData]);
  const pickupSource = useMemo(() => firstMilePickupSource(formData), [formData]);

  const fetchRates = () => {
    setFetchError(null);
    setQuotes([]);

    startTransition(async () => {
      try {
        if (!hub) {
          setFetchError("No pickup hub is configured. Please contact support.");
          return;
        }

        const request = buildFirstMileRequest(formData, hub);
        const result = await getDomesticRatesAction(request);

        if (!result.success || result.quotes.length === 0) {
          setFetchError(
            (!result.success && result.error) ||
              "No pickup couriers are available for this pincode.",
          );
          setHasFetched(true);
          return;
        }

        // Persist the hub label the moment we have a live quote list, so the
        // review + shipment snapshot record which hub the parcel routes to.
        setValue("firstMileHubLabel", hub.label);

        const mapped: ServiceOption[] = result.quotes.map((q) => ({
          vendorId: q.vendorId,
          vendorName: q.vendorName,
          productCode: `${q.vendorId}-${q.productName}-${q.totalWithTax}`,
          productName: q.productName,
          transitDays: q.tatDays ?? 0,
          price: q.totalWithTax,
          currency: q.currency ?? "INR",
        }));

        // Cheapest first — mirrors the intl service list ordering.
        mapped.sort((a, b) => a.price - b.price);
        setQuotes(mapped);
        setHasFetched(true);

        // Pre-select the cheapest if nothing is chosen yet (or the prior
        // selection is no longer offered), so the default is the best price.
        const stillOffered =
          selectedFirstMile &&
          mapped.some((m) => m.productCode === selectedFirstMile.productCode);
        if (!stillOffered && mapped[0]) {
          setValue("firstMile", mapped[0], { shouldValidate: true });
        }
      } catch (err) {
        setFetchError(
          err instanceof Error ? err.message : "Unexpected error fetching pickup rates.",
        );
        setHasFetched(true);
      }
    });
  };

  useEffect(() => {
    if (!hasFetched) fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cheapestPrice =
    quotes.length > 0 ? Math.min(...quotes.map((q) => q.price)) : Infinity;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Choose a Door-Pickup Courier
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A domestic courier collects your parcel and delivers it to our
            carrier hub. This first-mile charge is added to your shipping total.
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

      {hub && (
        <RoutePill
          from={[pickupSource.city, pickupSource.postalCode].filter(Boolean).join(" ")}
          hubLabel={hub.label}
        />
      )}

      {isPending && <RateSkeleton />}

      {!isPending && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Couldn't fetch pickup rates</p>
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

      {!isPending && quotes.length > 0 && (
        <div className="space-y-2">
          {quotes.map((quote) => (
            <CourierCard
              key={quote.productCode}
              quote={quote}
              selected={selectedFirstMile?.productCode === quote.productCode}
              isCheapest={quote.price === cheapestPrice}
              onSelect={() => setValue("firstMile", quote, { shouldValidate: true })}
            />
          ))}
          <p className="pt-1 text-center text-xs text-muted-foreground">
            {quotes.length} courier{quotes.length !== 1 ? "s" : ""} available · Prices include GST
          </p>
        </div>
      )}

      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed py-12 text-center">
          <Home className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No pickup couriers for this pincode</p>
          <p className="text-xs text-muted-foreground">
            Check the pickup postal code, or go back and turn off door pickup to
            drop the parcel at the hub yourself.
          </p>
        </div>
      )}

      {firstMileError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" aria-live="polite">
          <AlertTriangle className="h-3.5 w-3.5" />
          {firstMileError}
        </p>
      )}
    </div>
  );
}
