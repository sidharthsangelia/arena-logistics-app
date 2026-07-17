"use client";

/**
 * RateCalculatorForm.tsx
 *
 * International freight rate calculator form.
 *
 * WHAT IT DOES
 * ------------
 * Collects a route + a real multi-piece package list + declared value, then
 * dispatches a fully-typed RateRequest to the Zustand store's fetchRates.
 *
 * MULTI-PIECE (the important bit)
 * -------------------------------
 * Every box line carries its OWN per-box weight, dimensions and quantity, and
 * all of them are sent as `shipment.packages`. The adapters decide per vendor
 * how to consume it (Shipmozo natively; Skart/Aramex normalise to one
 * chargeable weight via lib/pricing/chargeableWeight). The form shows the
 * computed chargeable weight live so the number that drives the price is never
 * a mystery — "compare per package, then sum", divisor 5000.
 *
 * REUSED FROM THE BOOKING FLOW
 * ----------------------------
 * - CountryCombobox (searchable, flag, stores country NAME)
 * - usePostalLookup  (debounced pincode → city autofill, race-safe)
 * These give the calculator the same address UX as the booking wizard.
 *
 * STYLING
 * -------
 * shadcn design tokens only (bg-card / bg-muted / border-border / text-*).
 * No hardcoded slate/white or off-palette colours.
 */

import * as React from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  Box,
  Check,
  Loader2,
  MapPin,
  Package,
  Plus,
  Scale,
  Trash2,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { CountryCombobox } from "@/components/booking/CountryComboBox";
import { usePostalLookup } from "@/hooks/usePostalLookup";
import { AVAILABLE_VENDORS, type VendorId, type RateRequest } from "@/lib/types";
import { COUNTRY_TO_ISO } from "@/utils/data";
import {
  computeShipmentWeights,
  INTERNATIONAL_VOLUMETRIC_DIVISOR,
} from "@/lib/pricing/chargeableWeight";
import { useAppStore } from "@/store";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const endpointSchema = z.object({
  country: z.string().min(1, "Select a country"),
  pincode: z.string().trim().min(1, "Required"),
  city: z.string().trim().min(1, "Required"),
});

const boxSchema = z.object({
  quantity: z.number({ error: "Required" }).int().min(1, "Min 1"),
  weightKg: z.number({ error: "Required" }).positive("> 0"),
  lengthCm: z.number({ error: "Required" }).positive("> 0"),
  widthCm: z.number({ error: "Required" }).positive("> 0"),
  heightCm: z.number({ error: "Required" }).positive("> 0"),
});

const formSchema = z.object({
  origin: endpointSchema,
  destination: endpointSchema,
  dimensionUnit: z.enum(["cm", "in"]),
  declaredValue: z.number({ error: "Required" }).min(0, "Cannot be negative"),
  boxes: z.array(boxSchema).min(1, "Add at least one package"),
  vendors: z.array(z.string()).min(1, "Select at least one carrier"),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoFromName(name: string): string {
  if (!name) return "";
  return COUNTRY_TO_ISO[name] ?? name.slice(0, 2).toUpperCase();
}

function toCmFactor(unit: "cm" | "in"): number {
  return unit === "in" ? 2.54 : 1;
}

const defaultBox: FormValues["boxes"][number] = {
  quantity: 1,
  weightKg: 1,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

const defaultValues: FormValues = {
  origin: { country: "India", pincode: "110059", city: "New Delhi" },
  destination: { country: "Australia", pincode: "2000", city: "Sydney" },
  dimensionUnit: "cm",
  declaredValue: 1000,
  boxes: [defaultBox],
  vendors: AVAILABLE_VENDORS.map((v) => v.id),
};

// ---------------------------------------------------------------------------
// Small presentational bits
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RouteEndpoint — country + pincode(autofill) + city for one side
// ---------------------------------------------------------------------------

interface RouteEndpointProps {
  prefix: "origin" | "destination";
  title: string;
  control: ReturnType<typeof useForm<FormValues>>["control"];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  watch: ReturnType<typeof useForm<FormValues>>["watch"];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}

function RouteEndpoint({
  prefix,
  title,
  control,
  register,
  watch,
  setValue,
  errors,
}: RouteEndpointProps) {
  const country = watch(`${prefix}.country`);
  const pincode = watch(`${prefix}.pincode`);
  const e = errors[prefix];

  const lookupState = usePostalLookup(country, pincode, (city) => {
    setValue(`${prefix}.city`, city, { shouldValidate: true });
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <SectionLabel>{title}</SectionLabel>
      </div>

      <Controller
        control={control}
        name={`${prefix}.country`}
        render={({ field }) => (
          <CountryCombobox
            value={field.value}
            label="Country"
            onChange={(name) => {
              field.onChange(name);
              // Reset dependent fields so a stale city can't survive a change.
              setValue(`${prefix}.pincode`, "");
              setValue(`${prefix}.city`, "");
            }}
            error={e?.country?.message}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>
            Postal / ZIP <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              {...register(`${prefix}.pincode`)}
              placeholder="Postal code"
              className="pr-8"
            />
            {lookupState === "loading" && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {lookupState === "found" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3 w-3" /> City auto-filled
            </p>
          ) : (
            <FieldError message={e?.pincode?.message} />
          )}
        </div>

        <div className="space-y-1">
          <Label>
            City <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register(`${prefix}.city`)}
            placeholder={lookupState === "loading" ? "Looking up…" : "City"}
          />
          <FieldError message={e?.city?.message} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoxRow — one package line (per-box weight + dims + qty)
// ---------------------------------------------------------------------------

interface BoxRowProps {
  index: number;
  unit: "cm" | "in";
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  canRemove: boolean;
  onRemove: () => void;
}

function BoxRow({ index, unit, register, errors, canRemove, onRemove }: BoxRowProps) {
  const be = errors.boxes?.[index];

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
            {index + 1}
          </div>
          <span className="text-xs font-medium text-muted-foreground">Package</span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[110px_110px]">
          <div>
            <Label className="mb-1.5 block text-xs">Weight / box (kg)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              {...register(`boxes.${index}.weightKg`, { valueAsNumber: true })}
            />
            <FieldError message={be?.weightKg?.message} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">No. of boxes</Label>
            <Input
              type="number"
              min="1"
              step="1"
              {...register(`boxes.${index}.quantity`, { valueAsNumber: true })}
            />
            <FieldError message={be?.quantity?.message} />
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Dimensions per box
            </span>
            <span className="text-xs text-muted-foreground">({unit})</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["lengthCm", "widthCm", "heightCm"] as const).map((dim, i) => (
              <div key={dim}>
                <Label className="mb-1 block text-xs capitalize text-muted-foreground">
                  {["Length", "Width", "Height"][i]}
                </Label>
                <Input
                  type="number"
                  min="1"
                  step="0.1"
                  {...register(`boxes.${index}.${dim}`, { valueAsNumber: true })}
                />
                <FieldError message={be?.[dim]?.message} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChargeableSummary — live "this is the billable weight" bar
// ---------------------------------------------------------------------------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function ChargeableSummary({
  boxes,
  unit,
}: {
  boxes: FormValues["boxes"];
  unit: "cm" | "in";
}) {
  const weights = React.useMemo(() => {
    const factor = toCmFactor(unit);
    const packages = boxes.map((b) => ({
      quantity: Math.max(1, Math.trunc(Number(b.quantity) || 1)),
      weightKg: Number(b.weightKg) || 0,
      lengthCm: (Number(b.lengthCm) || 0) * factor,
      widthCm: (Number(b.widthCm) || 0) * factor,
      heightCm: (Number(b.heightCm) || 0) * factor,
    }));
    return computeShipmentWeights(packages);
  }, [boxes, unit]);

  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Scale className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">Chargeable weight</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {weights.totalPieces} pc{weights.totalPieces !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Actual" value={`${weights.totalActualKg} kg`} />
        <Metric label="Volumetric" value={`${weights.totalVolumetricKg} kg`} />
        <Metric label="Billed on" value={`${weights.totalChargeableKg} kg`} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Higher of actual vs. volumetric, per box, then summed · divisor{" "}
        {INTERNATIONAL_VOLUMETRIC_DIVISOR}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function RateCalculatorForm() {
  const loading = useAppStore((s) => s.loading);
  const fetchRates = useAppStore((s) => s.fetchRates);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "boxes" });

  const selectedVendors = watch("vendors");
  const unit = watch("dimensionUnit");
  const boxes = watch("boxes");

  const toggleVendor = (id: string, checked: boolean) => {
    const current = selectedVendors ?? [];
    setValue(
      "vendors",
      checked ? [...current, id] : current.filter((v) => v !== id),
      { shouldValidate: true },
    );
  };

  const onSubmit = (data: FormValues) => {
    const factor = toCmFactor(data.dimensionUnit);

    const packages = data.boxes.map((b) => ({
      quantity: Math.max(1, Math.trunc(b.quantity) || 1),
      weightKg: b.weightKg, // per-box actual weight
      lengthCm: b.lengthCm * factor,
      widthCm: b.widthCm * factor,
      heightCm: b.heightCm * factor,
    }));

    const totalWeight = data.boxes.reduce((s, b) => s + b.weightKg * b.quantity, 0);
    const totalPieces = data.boxes.reduce((s, b) => s + b.quantity, 0);
    const first = packages[0];

    const request: RateRequest = {
      origin: {
        city: data.origin.city,
        pincode: data.origin.pincode,
        countryCode: isoFromName(data.origin.country),
        country: data.origin.country.toUpperCase(),
      },
      destination: {
        city: data.destination.city,
        pincode: data.destination.pincode,
        countryCode: isoFromName(data.destination.country),
        country: data.destination.country.toUpperCase(),
      },
      shipment: {
        packages,
        declaredValue: data.declaredValue,
        description: "General Cargo",
        // Legacy aggregate fallback for any single-shape consumer.
        weight: totalWeight,
        quantity: totalPieces,
        dimensions: {
          length: Math.max(first?.lengthCm ?? 1, 1),
          width: Math.max(first?.widthCm ?? 1, 1),
          height: Math.max(first?.heightCm ?? 1, 1),
          unit: "cm",
        },
      },
    };

    fetchRates(request, data.vendors as VendorId[]);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* ── Route ── */}
      <Card>
        <CardHeader className="border-b py-3.5">
          <SectionLabel>Route</SectionLabel>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_auto_1fr]">
            <RouteEndpoint
              prefix="origin"
              title="Origin"
              control={control}
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
            />
            <div className="hidden items-center justify-center pt-10 lg:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <RouteEndpoint
              prefix="destination"
              title="Destination"
              control={control}
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Packages ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b py-3.5">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground" />
            <SectionLabel>Packages</SectionLabel>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Units</span>
              <Controller
                control={control}
                name="dimensionUnit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-7 w-16 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">cm</SelectItem>
                      <SelectItem value="in">in</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {fields.length} {fields.length === 1 ? "line" : "lines"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {fields.map((field, index) => (
            <BoxRow
              key={field.id}
              index={index}
              unit={unit}
              register={register}
              errors={errors}
              canRemove={fields.length > 1}
              onRemove={() => remove(index)}
            />
          ))}

          <button
            type="button"
            onClick={() => append(defaultBox)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add package
          </button>

          {typeof errors.boxes?.message === "string" && (
            <p className="text-xs text-destructive">{errors.boxes.message}</p>
          )}

          <ChargeableSummary boxes={boxes} unit={unit} />

          <Separator />

          {/* Declared value */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr] sm:items-center">
            <div className="space-y-1">
              <Label>
                Declared value (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="1"
                {...register("declaredValue", { valueAsNumber: true })}
              />
              <FieldError message={errors.declaredValue?.message} />
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Total value of the goods — used for customs duty on international
              lanes. Does not change the freight weight.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Carriers ── */}
      <Card>
        <CardHeader className="border-b py-3.5">
          <SectionLabel>Carriers to query</SectionLabel>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_VENDORS.map((vendor) => {
              const checked = selectedVendors?.includes(vendor.id) ?? false;
              return (
                <label
                  key={vendor.id}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors",
                    checked ? "border-primary bg-muted" : "hover:bg-muted/50",
                  )}
                >
                  <Checkbox
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
          {errors.vendors && (
            <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {errors.vendors.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Submit ── */}
      <Button type="submit" size="lg" className="h-11 w-full text-sm font-medium" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Fetching live rates…
          </>
        ) : (
          <>
            Get Rates
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
