"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Home,
  Warehouse,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { BookingFormData } from "@/types/booking.types";
import type { RateQuote } from "@/lib/types";
import { getDomesticRatesAction } from "@/actions/domesticRateCalculator.action";
import {
  buildFirstMileRequest,
  firstMilePickupSource,
  resolveFirstMileHub,
} from "@/lib/booking/firstMile";
import { RateOptionPicker, quoteToServiceOption, quoteKey } from "../RateOptionPicker";

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
// Route pill (door → hub)
// ---------------------------------------------------------------------------

function RoutePill({ from, hubLabel }: { from: string; hubLabel: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Home className="h-4 w-4 text-muted-foreground" />
        {from || "Pickup"}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Warehouse className="h-4 w-4 text-muted-foreground" />
        {hubLabel} hub
      </span>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <span className="text-xs text-muted-foreground">Domestic first-mile leg</span>
    </div>
  );
}

function RateSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
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
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
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

        const sorted = [...result.quotes].sort((a, b) => a.totalWithTax - b.totalWithTax);
        setQuotes(sorted);
        setHasFetched(true);

        // Pre-select the cheapest if nothing is chosen yet (or the prior
        // selection is no longer offered), so the default is the best price.
        const stillOffered =
          selectedFirstMile &&
          sorted.some((q) => quoteKey(q) === selectedFirstMile.productCode);
        if (!stillOffered && sorted[0]) {
          setValue("firstMile", quoteToServiceOption(sorted[0]), { shouldValidate: true });
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

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pick your door-pickup courier</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A local courier collects your parcel and takes it to our carrier
            hub. We&apos;ve pre-picked the cheapest; open any card to see the
            breakdown. This charge is added to your shipping total.
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
            <p className="font-medium text-destructive">Couldn&apos;t fetch pickup rates</p>
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
        <RateOptionPicker
          quotes={quotes}
          selectedKey={selectedFirstMile?.productCode ?? null}
          onSelect={(q) => setValue("firstMile", quoteToServiceOption(q), { shouldValidate: true })}
          tatSuffix="to hub"
        />
      )}

      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
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
