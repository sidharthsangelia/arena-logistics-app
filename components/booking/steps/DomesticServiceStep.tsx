"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Truck,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  MapPin,
  Scale,
  Wallet,
  Banknote,
} from "lucide-react";
import { UseFormSetValue, UseFormWatch, FieldErrors } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { BookingFormData } from "@/types/booking.types";
import type { RateQuote } from "@/lib/types";
import { getDomesticRatesAction } from "@/actions/domesticRateCalculator.action";
import {
  buildDomesticRateRequest,
  domesticCodAmount,
  domesticPickupSource,
} from "@/lib/booking/domesticRequest";
import { totalBoxCount, totalChargeableWeight } from "@/lib/booking/cargo";
import { RateOptionPicker, quoteToServiceOption } from "../RateOptionPicker";
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";

// ---------------------------------------------------------------------------
// DomesticServiceStep
//
// Live Shipmozo courier quotes for an India → India door-to-door move, with the
// org's markup already applied by getDomesticRatesAction.
//
// The one thing this step does that its international twin does not is offer
// cash on delivery, and it is offered HERE rather than on the payment step for
// a reason: couriers charge a COD collection fee that differs between them, so
// a COD shipment has to be PRICED as COD. Toggling it therefore refetches, and
// the prices on the cards move.
//
// Worth being clear about what COD is and is not. It does not change how the
// customer pays Arena — the freight still comes out of their wallet at booking
// exactly as on a prepaid shipment. It is Shipmozo collecting the goods value
// from the receiver at the door and remitting it onward.
// ---------------------------------------------------------------------------

interface Props {
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  formData: BookingFormData;
  onChange: (patch: Partial<BookingFormData>) => void;
}

function fmtInr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function RouteSummary({ data }: { data: BookingFormData }) {
  const source = domesticPickupSource(data);
  const chargeable = totalChargeableWeight(data.boxes);
  const totalPieces = totalBoxCount(data.boxes);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {source.city || "Origin"} {source.postalCode}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium text-foreground">
        {data.consignee.city || "Destination"} {data.consignee.postalCode}
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
          <Skeleton key={i} className="h-36 rounded-xl border" />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        Finding couriers for this route…
      </p>
    </div>
  );
}

/** Prepaid vs cash on delivery. Changing it reprices every card. */
function PaymentModePicker({
  codEnabled,
  codAmount,
  onChange,
  disabled,
}: {
  codEnabled: boolean;
  codAmount: number;
  onChange: (cod: boolean) => void;
  disabled: boolean;
}) {
  const options = [
    {
      cod: false,
      icon: Wallet,
      title: "Prepaid",
      blurb: "Nothing is collected at the door.",
    },
    {
      cod: true,
      icon: Banknote,
      title: "Cash on delivery",
      blurb: `The courier collects ${fmtInr(codAmount)} from the receiver.`,
    },
  ];

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Payment mode"
        className="grid gap-2 sm:grid-cols-2"
      >
        {options.map((option) => {
          const selected = option.cod === codEnabled;
          const Icon = option.icon;
          return (
            <button
              key={option.title}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.cod)}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/40",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  selected ? "text-primary" : "text-muted-foreground",
                )}
              />
              <div>
                <p className="text-sm font-medium">{option.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {option.blurb}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {codEnabled && (
        <p className="rounded-md border-l-2 border-amber-400 bg-amber-50/60 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800 dark:border-amber-600 dark:bg-amber-950/20 dark:text-amber-300">
          Cash on delivery covers the {fmtInr(codAmount)} value of your goods,
          not the shipping. Shipping is still paid from your Arena wallet when
          you place this booking, and the amount collected at the door is
          remitted to you separately. Couriers add a collection fee, which is
          already included in the prices below.
        </p>
      )}
    </div>
  );
}

export default function DomesticServiceStep({
  watch,
  setValue,
  errors,
  formData,
  onChange,
}: Props) {
  const [quotes, setQuotes] = useState<RateQuote[]>([]);
  const [vendorErrors, setVendorErrors] = useState<
    { vendorId: string; message: string }[]
  >([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);
  const isArena = useIsArenaOrg();

  const selectedService = watch("selectedService");
  const serviceError = errors.selectedService?.message as string | undefined;

  const codEnabled = formData.codEnabled;
  const codAmount = domesticCodAmount(formData);

  const fetchRates = (overrides?: Partial<BookingFormData>) => {
    setFetchError(null);
    setVendorErrors([]);
    setQuotes([]);

    startTransition(async () => {
      try {
        const request = buildDomesticRateRequest({ ...formData, ...overrides });
        const result = await getDomesticRatesAction(request);

        if (!result.success || result.quotes.length === 0) {
          setFetchError(
            (!result.success && result.error) ||
              "No couriers are available between these pincodes.",
          );
          setHasFetched(true);
          return;
        }

        const sorted = [...result.quotes].sort(
          (a, b) => a.totalWithTax - b.totalWithTax,
        );
        setQuotes(sorted);
        setVendorErrors(result.vendorErrors ?? []);
        setHasFetched(true);
      } catch (err) {
        setFetchError(
          err instanceof Error
            ? err.message
            : "Unexpected error fetching rates.",
        );
        setHasFetched(true);
      }
    });
  };

  useEffect(() => {
    if (!hasFetched) fetchRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching payment mode reprices everything, so the previous selection is
  // dropped rather than left showing a price that no longer applies to it.
  const handleCodChange = (cod: boolean) => {
    if (cod === codEnabled) return;
    onChange({ codEnabled: cod });
    setValue("selectedService", null, { shouldValidate: false });
    fetchRates({ codEnabled: cod });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Pick your courier
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live quotes for a door-to-door delivery. Surface and air sit on
            separate tabs; open any card to see what makes up the price.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => fetchRates()}
          className="shrink-0"
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isPending && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {formData.boxes.length > 0 && <RouteSummary data={formData} />}

      <PaymentModePicker
        codEnabled={codEnabled}
        codAmount={codAmount}
        onChange={handleCodChange}
        disabled={isPending}
      />

      {isPending && <RateSkeleton />}

      {!isPending && fetchError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Couldn&apos;t fetch rates</p>
            <p className="mt-0.5 text-muted-foreground">{fetchError}</p>
            <button
              type="button"
              onClick={() => fetchRates()}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Try again <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {!isPending && isArena && vendorErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="mb-1 font-medium">Some couriers didn&apos;t respond:</p>
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
          onSelect={(q) =>
            setValue("selectedService", quoteToServiceOption(q), {
              shouldValidate: true,
            })
          }
          showCarrierLogo
          splitByMode
        />
      )}

      {!isPending && hasFetched && quotes.length === 0 && !fetchError && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <Truck className="h-7 w-7 text-muted-foreground/40" />
          <p className="text-sm font-medium">No couriers serve this route</p>
          <p className="text-xs text-muted-foreground">
            Check the pickup and delivery pincodes, or try prepaid if you asked
            for cash on delivery — not every courier offers it.
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
