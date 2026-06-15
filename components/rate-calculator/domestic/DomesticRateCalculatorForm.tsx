"use client";

/**
 * app/rates/domestic/DomesticRateCalculatorForm.tsx
 *
 * RESPONSIBILITY
 * --------------
 * Renders the domestic air rate calculator form (origin/destination IATA
 * codes, cargo type, weight, optional dimensions, carrier filter) and calls
 * the `getDomesticRates` server action directly on submit — no client store,
 * no HTTP API. The result (`quotes` / `vendorErrors`) is reported to the
 * parent via `onResult` so it can be rendered by `DomesticRateResultsList`.
 *
 * Mirrors the international RateCalculatorForm's RHF + Zod pattern, but:
 *   - origin/destination are IATA codes (with a datalist of suggestions)
 *     instead of city/pincode/country
 *   - a single cargoType + weight replace the items[] array
 *   - dimensions are optional, toggled by a checkbox
 *   - vendors are the three domestic carriers (EDS, IndiGo, Air India)
 */

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, ArrowRight, Package, PlaneTakeoff } from "lucide-react";

 
import {
  domesticRateFormSchema,
  type DomesticRateFormValues,
} from "@/lib/domestic/domesticSchema";
import {
  CARGO_TYPES,
  DOMESTIC_VENDORS,
  type DomesticRateResult,
} from "@/lib/domestic/domestic.types";
import { cn } from "@/lib/utils";
import { getDomesticRates } from "@/actions/domesticRates.action";

// ---------------------------------------------------------------------------
// Airport suggestions (datalist) — server still validates against Airport
// table, this is purely a UX convenience for common domestic stations.
// ---------------------------------------------------------------------------

const AIRPORT_SUGGESTIONS = [
  { code: "DEL", city: "Delhi" },
  { code: "BOM", city: "Mumbai" },
  { code: "BLR", city: "Bengaluru" },
  { code: "HYD", city: "Hyderabad" },
  { code: "MAA", city: "Chennai" },
  { code: "CCU", city: "Kolkata" },
  { code: "AMD", city: "Ahmedabad" },
  { code: "PNQ", city: "Pune" },
  { code: "GOI", city: "Goa" },
  { code: "COK", city: "Kochi" },
  { code: "JAI", city: "Jaipur" },
  { code: "LKO", city: "Lucknow" },
];

const CARGO_TYPE_LABELS: Record<(typeof CARGO_TYPES)[number], string> = {
  GCR: "General Cargo (GCR)",
  LEAN: "Leather (LEAN)",
  SCR: "Special Cargo (SCR)",
  HEA: "Heavy (HEA)",
  XPS: "Express (XPS)",
  DGR: "Dangerous Goods (DGR)",
  PRIME: "Prime / Priority",
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultValues: DomesticRateFormValues = {
  origin: "DEL",
  destination: "BOM",
  cargoType: "GCR",
  actualWeightKg: 50,
  useDimensions: false,
  dimensions: { length: 40, width: 30, height: 30, unit: "cm", quantity: 1 },
  vendors: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive mt-1">{message}</p>;
}

function SectionHeading({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DomesticRateCalculatorFormProps {
  onResult: (result: DomesticRateResult | null) => void;
  onLoadingChange: (loading: boolean) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DomesticRateCalculatorForm({
  onResult,
  onLoadingChange,
}: DomesticRateCalculatorFormProps) {
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<DomesticRateFormValues>({
    resolver: zodResolver(domesticRateFormSchema),
    defaultValues,
  });

  const useDimensions = watch("useDimensions");
  const dimensionUnit = watch("dimensions.unit");
  const selectedVendors = watch("vendors");

  const toggleVendor = (id: string, checked: boolean) => {
    const current = selectedVendors ?? [];
    setValue(
      "vendors",
      checked ? [...current, id as never] : current.filter((v) => v !== id),
      { shouldValidate: true },
    );
  };

  const onSubmit = async (data: DomesticRateFormValues) => {
    setLoading(true);
    onLoadingChange(true);
    setFormError(null);
    onResult(null);

    try {
      const result = await getDomesticRates(data);

      if (!result.ok) {
        if (result.fieldErrors.origin) {
          setError("origin", { message: result.fieldErrors.origin });
        }
        if (result.fieldErrors.destination) {
          setError("destination", { message: result.fieldErrors.destination });
        }
        if (result.fieldErrors.form) {
          setFormError(result.fieldErrors.form);
        }
        onResult(null);
        return;
      }

      onResult(result.data);
    } catch (err) {
      setFormError("Something went wrong while fetching rates. Please try again.");
      onResult(null);
    } finally {
      setLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* ── Route ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            Route
          </span>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* Origin */}
            <div className="space-y-1.5">
              <SectionHeading icon={MapPin} label="Origin" />
              <Label className="text-xs mb-1.5 block">Airport (IATA code)</Label>
              <Input
                {...register("origin")}
                 
                maxLength={3}
                list="airport-suggestions"
                className="h-9 text-sm uppercase"
              />
              <FieldError message={errors.origin?.message} />
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center justify-center pt-9">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Destination */}
            <div className="space-y-1.5">
              <SectionHeading icon={MapPin} label="Destination" />
              <Label className="text-xs mb-1.5 block">Airport (IATA code)</Label>
              <Input
                {...register("destination")}
             
                maxLength={3}
                list="airport-suggestions"
                className="h-9 text-sm uppercase"
              />
              <FieldError message={errors.destination?.message} />
            </div>
          </div>

          <datalist id="airport-suggestions">
            {AIRPORT_SUGGESTIONS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.city}
              </option>
            ))}
          </datalist>
        </div>
      </div>

      {/* ── Shipment ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            Shipment Details
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Cargo Type</Label>
              <Controller
                control={control}
                name="cargoType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select cargo type" />
                    </SelectTrigger>
                    <SelectContent>
                      {CARGO_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CARGO_TYPE_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.cargoType?.message} />
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Actual Weight (kg)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                {...register("actualWeightKg", { valueAsNumber: true })}
                className="h-9 text-sm"
              />
              <FieldError message={errors.actualWeightKg?.message} />
            </div>
          </div>

          {/* Dimensions toggle */}
          <div className="rounded-md border bg-muted/30 px-3.5 pt-3 pb-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Controller
                  control={control}
                  name="useDimensions"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(Boolean(v))}
                    />
                  )}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  Provide dimensions (for volumetric weight)
                </span>
              </label>

              {useDimensions && (
                <Controller
                  control={control}
                  name="dimensions.unit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-18 h-6 text-xs px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">cm</SelectItem>
                        <SelectItem value="in">in</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </div>

            {useDimensions && (
              <div className="grid grid-cols-4 gap-3">
                {(["length", "width", "height"] as const).map((dim) => (
                  <div key={dim}>
                    <Label className="text-xs mb-1 block capitalize text-muted-foreground">
                      {dim} ({dimensionUnit})
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      {...register(`dimensions.${dim}`, { valueAsNumber: true })}
                      className="h-9 text-sm"
                    />
                    <FieldError message={errors.dimensions?.[dim]?.message} />
                  </div>
                ))}
                <div>
                  <Label className="text-xs mb-1 block capitalize text-muted-foreground">
                    Qty
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    {...register("dimensions.quantity", { valueAsNumber: true })}
                    className="h-9 text-sm"
                  />
                  <FieldError message={errors.dimensions?.quantity?.message} />
                </div>
              </div>
            )}
            <FieldError message={errors.dimensions?.message} />
          </div>
        </div>
      </div>

      {/* ── Carriers ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <PlaneTakeoff className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            Carriers to query
          </span>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-3">
            {DOMESTIC_VENDORS.map((vendor) => {
              const checked = selectedVendors?.includes(vendor.id) ?? false;
              return (
                <label
                  key={vendor.id}
                  className={cn(
                    "flex items-center gap-2.5 cursor-pointer rounded-lg px-3.5 py-2.5",
                    "border transition-all duration-150 select-none",
                    checked ? "border-primary bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    id={`domestic_vendor_${vendor.id}`}
                    checked={checked}
                    onCheckedChange={(v) => toggleVendor(vendor.id, Boolean(v))}
                    className="pointer-events-none"
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      checked ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {vendor.label}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Leave all unchecked to query every carrier.
          </p>
        </div>
      </div>

      {formError && (
        <p className="text-sm text-destructive text-center">{formError}</p>
      )}

      {/* ── Submit ── */}
      <Button
        type="submit"
        size="lg"
        className="w-full h-11 text-sm font-medium"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Calculating…
          </>
        ) : (
          <>
            Get Domestic Rates
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}