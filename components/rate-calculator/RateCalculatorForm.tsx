"use client";

/**
 * RateCalculatorForm.tsx
 *
 * International freight rate calculator form (ships FROM India).
 *
 * MULTI-PIECE
 * -----------
 * Every box line carries its own per-box weight, size and count, and all of
 * them are sent as `shipment.packages`. The adapters decide per carrier how to
 * use it (Shipmozo natively; Skart/Aramex collapse to one charged weight via
 * lib/pricing/chargeableWeight, "higher of real vs volume, per box, summed").
 * The form shows that charged weight live so nothing about the price is hidden.
 *
 * REACTIVITY NOTE
 * ---------------
 * Reactive/computed reads use `useWatch`, not `watch()`. React Compiler can
 * memoize this component and serve stale values from `watch()` (the lint rule
 * react-hooks/incompatible-library warns about exactly this), which is what
 * made the charged-weight card fail to update when the box count changed.
 *
 * STYLING: shadcn tokens only. Plain, jargon-free copy.
 */

import * as React from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  Controller,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  Box,
  Check,
  Loader2,
  MapPin,
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
import { computeShipmentWeights } from "@/lib/pricing/chargeableWeight";
import { useAppStore } from "@/store";

// ---------------------------------------------------------------------------
// This calculator always ships out of India.
// ---------------------------------------------------------------------------

const ORIGIN_COUNTRY = "India";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const boxSchema = z.object({
  boxCount: z.number({ error: "Required" }).int().min(1, "Add at least 1"),
  weightKg: z.number({ error: "Required" }).positive("Enter a weight"),
  lengthCm: z.number({ error: "Required" }).positive("Enter a size"),
  widthCm: z.number({ error: "Required" }).positive("Enter a size"),
  heightCm: z.number({ error: "Required" }).positive("Enter a size"),
});

const formSchema = z.object({
  originPincode: z.string().trim().min(1, "Enter a pincode"),
  originCity: z.string().trim().min(1, "Enter a city"),

  destinationCountry: z.string().min(1, "Pick a country"),
  destinationPincode: z.string().trim().min(1, "Enter a postal code"),
  destinationCity: z.string().trim().min(1, "Enter a city"),

  sizeUnit: z.enum(["cm", "in"]),
  boxes: z.array(boxSchema).min(1, "Add at least one box"),
  vendors: z.array(z.string()).min(1, "Pick at least one carrier"),
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
  boxCount: 1,
  weightKg: 1,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
};

const defaultValues: FormValues = {
  originPincode: "110059",
  originCity: "New Delhi",
  destinationCountry: "Australia",
  destinationPincode: "2000",
  destinationCity: "Sydney",
  sizeUnit: "cm",
  boxes: [defaultBox],
  vendors: AVAILABLE_VENDORS.map((v) => v.id),
};

// ---------------------------------------------------------------------------
// Small bits
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

// India flag emoji for the locked origin field.
function indiaFlag() {
  return "🇮🇳";
}

// ---------------------------------------------------------------------------
// From (locked to India) + To (any country) endpoints
// ---------------------------------------------------------------------------

interface EndpointProps {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  control: Control<FormValues>;
}

function FromEndpoint({ register, setValue, errors, control }: EndpointProps) {
  const pincode = useWatch({ control, name: "originPincode" });

  const lookupState = usePostalLookup(ORIGIN_COUNTRY, pincode ?? "", (city) => {
    setValue("originCity", city, { shouldValidate: true });
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <SectionLabel>Sending from</SectionLabel>
      </div>

      <div className="space-y-1">
        <Label>Country</Label>
        <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-foreground">
          <span className="text-base leading-none">{indiaFlag()}</span>
          India
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>
            Pincode <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input {...register("originPincode")} placeholder="e.g. 110059" className="pr-8" />
            {lookupState === "loading" && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {lookupState === "found" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3 w-3" /> City filled in for you
            </p>
          ) : (
            <FieldError message={errors.originPincode?.message} />
          )}
        </div>

        <div className="space-y-1">
          <Label>
            City <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register("originCity")}
            placeholder={lookupState === "loading" ? "Looking up..." : "e.g. New Delhi"}
          />
          <FieldError message={errors.originCity?.message} />
        </div>
      </div>
    </div>
  );
}

function ToEndpoint({ register, setValue, errors, control }: EndpointProps) {
  const country = useWatch({ control, name: "destinationCountry" });
  const pincode = useWatch({ control, name: "destinationPincode" });

  const lookupState = usePostalLookup(country ?? "", pincode ?? "", (city) => {
    setValue("destinationCity", city, { shouldValidate: true });
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <SectionLabel>Sending to</SectionLabel>
      </div>

      <Controller
        control={control}
        name="destinationCountry"
        render={({ field }) => (
          <CountryCombobox
            value={field.value}
            label="Country"
            onChange={(name) => {
              field.onChange(name);
              // Clear the old postal code and city so they can't stay behind.
              setValue("destinationPincode", "");
              setValue("destinationCity", "");
            }}
            error={errors.destinationCountry?.message}
          />
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>
            Postal code <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              {...register("destinationPincode")}
              placeholder="Postal / ZIP code"
              className="pr-8"
            />
            {lookupState === "loading" && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          {lookupState === "found" ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3 w-3" /> City filled in for you
            </p>
          ) : (
            <FieldError message={errors.destinationPincode?.message} />
          )}
        </div>

        <div className="space-y-1">
          <Label>
            City <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register("destinationCity")}
            placeholder={lookupState === "loading" ? "Looking up..." : "Destination city"}
          />
          <FieldError message={errors.destinationCity?.message} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoxRow
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
          <span className="text-xs font-medium text-muted-foreground">
            Box type {index + 1}
          </span>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[140px_140px]">
          <div>
            <Label className="mb-1.5 block text-xs">How many boxes</Label>
            <Input
              type="number"
              min="1"
              step="1"
              {...register(`boxes.${index}.boxCount`, { valueAsNumber: true })}
            />
            <FieldError message={be?.boxCount?.message} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Weight of each box (kg)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              {...register(`boxes.${index}.weightKg`, { valueAsNumber: true })}
            />
            <FieldError message={be?.weightKg?.message} />
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Size of each box
            </span>
            <span className="text-xs text-muted-foreground">measured in {unit}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["lengthCm", "widthCm", "heightCm"] as const).map((dim, i) => (
              <div key={dim}>
                <Label className="mb-1 block text-xs text-muted-foreground">
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
// ChargedWeight card: reactive via useWatch (fixes the stale-value bug)
// ---------------------------------------------------------------------------

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          highlight ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ChargedWeightCard({ control }: { control: Control<FormValues> }) {
  const boxes = useWatch({ control, name: "boxes", defaultValue: [] });
  const unit = useWatch({ control, name: "sizeUnit", defaultValue: "cm" });

  const weights = React.useMemo(() => {
    const factor = toCmFactor(unit);
    const packages = boxes.map((b) => ({
      quantity: Math.max(1, Math.trunc(Number(b?.boxCount) || 1)),
      weightKg: Number(b?.weightKg) || 0,
      lengthCm: (Number(b?.lengthCm) || 0) * factor,
      widthCm: (Number(b?.widthCm) || 0) * factor,
      heightCm: (Number(b?.heightCm) || 0) * factor,
    }));
    return computeShipmentWeights(packages);
  }, [boxes, unit]);

  return (
    <div className="rounded-lg border bg-muted/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Scale className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground">
          Weight you will be charged for
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {weights.totalPieces} box{weights.totalPieces !== 1 ? "es" : ""}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Real weight" value={`${weights.totalActualKg} kg`} />
        <Metric label="Size weight" value={`${weights.totalVolumetricKg} kg`} />
        <Metric label="Charged" value={`${weights.totalChargeableKg} kg`} highlight />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Carriers charge for whichever is higher: the real weight of a box, or
        the space it takes up. We work this out for every box, then add them up.
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
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({ control, name: "boxes" });

  const selectedVendors = useWatch({ control, name: "vendors" }) ?? [];
  const unit = useWatch({ control, name: "sizeUnit" }) ?? "cm";

  const toggleVendor = (id: string, checked: boolean) => {
    setValue(
      "vendors",
      checked ? [...selectedVendors, id] : selectedVendors.filter((v) => v !== id),
      { shouldValidate: true },
    );
  };

  const onSubmit = (data: FormValues) => {
    const factor = toCmFactor(data.sizeUnit);

    const packages = data.boxes.map((b) => ({
      boxCountRounded: Math.max(1, Math.trunc(b.boxCount) || 1),
      weightKg: b.weightKg, // weight of each box
      lengthCm: b.lengthCm * factor,
      widthCm: b.widthCm * factor,
      heightCm: b.heightCm * factor,
    }));

    const shipmentPackages = packages.map((p) => ({
      quantity: p.boxCountRounded,
      weightKg: p.weightKg,
      lengthCm: p.lengthCm,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
    }));

    const totalWeight = shipmentPackages.reduce((s, p) => s + p.weightKg * p.quantity, 0);
    const totalPieces = shipmentPackages.reduce((s, p) => s + p.quantity, 0);
    const first = shipmentPackages[0];

    const request: RateRequest = {
      origin: {
        city: data.originCity,
        pincode: data.originPincode,
        countryCode: isoFromName(ORIGIN_COUNTRY),
        country: ORIGIN_COUNTRY.toUpperCase(),
      },
      destination: {
        city: data.destinationCity,
        pincode: data.destinationPincode,
        countryCode: isoFromName(data.destinationCountry),
        country: data.destinationCountry.toUpperCase(),
      },
      shipment: {
        // Declared value is intentionally NOT collected here. Shipmozo uses a
        // neutral dummy on the backend for the quick calculator.
        packages: shipmentPackages,
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
          <SectionLabel>Where is it going?</SectionLabel>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_auto_1fr]">
            <FromEndpoint
              register={register}
              setValue={setValue}
              errors={errors}
              control={control}
            />
            <div className="hidden items-center justify-center pt-10 lg:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-muted">
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <ToEndpoint
              register={register}
              setValue={setValue}
              errors={errors}
              control={control}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Boxes ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b py-3.5">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground" />
            <SectionLabel>What are you sending?</SectionLabel>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Size in</span>
              <Controller
                control={control}
                name="sizeUnit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-7 w-16 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">cm</SelectItem>
                      <SelectItem value="in">inches</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Badge variant="secondary" className="text-xs tabular-nums">
              {fields.length} {fields.length === 1 ? "box type" : "box types"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          <p className="text-xs text-muted-foreground">
            Group boxes that are the same. If some boxes are a different size or
            weight, add another box type for them.
          </p>

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
            Add another box type
          </button>

          {typeof errors.boxes?.message === "string" && (
            <p className="text-xs text-destructive">{errors.boxes.message}</p>
          )}

          <ChargedWeightCard control={control} />
        </CardContent>
      </Card>

      {/* ── Carriers ── */}
      <Card>
        <CardHeader className="border-b py-3.5">
          <SectionLabel>Which carriers should we check?</SectionLabel>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_VENDORS.map((vendor) => {
              const checked = selectedVendors.includes(vendor.id);
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
            Getting live rates...
          </>
        ) : (
          <>
            Show me the rates
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
