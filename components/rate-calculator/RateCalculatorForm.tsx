"use client";

/**
 * RateCalculatorForm.tsx
 *
 * International freight rate calculator (ships FROM India).
 *
 * LAYOUT
 * ------
 * Two columns on desktop: inputs on the left (route + boxes), a sticky action
 * rail on the right (carriers + live charged weight + Get Rates). The rail
 * keeps the payoff (weight + price action) in view while the user edits, so
 * the tool reads as a quick panel rather than a long form.
 *
 * MULTI-PIECE
 * -----------
 * Each box line carries its own weight, size and count, all sent as
 * `shipment.packages`. Adapters use it per carrier (Shipmozo natively;
 * Skart/Aramex collapse to one charged weight via lib/pricing/chargeableWeight:
 * "higher of real vs volume, per box, summed").
 *
 * REACTIVITY
 * ----------
 * Computed reads use `useWatch` (not `watch()`) because React Compiler can
 * memoize this component and serve stale values from `watch()` (see the lint
 * rule react-hooks/incompatible-library). That was the charged-weight bug.
 *
 * STYLING: shadcn tokens. Plain, jargon-free copy. No em dashes in UI copy.
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
  Check,
  ChevronDown,
  Info,
  Loader2,
  Lock,
  Plane,
  Plus,
  Scale,
  Trash2,
} from "lucide-react";

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
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { CountryCombobox } from "@/components/booking/CountryComboBox";
import { usePostalLookup } from "@/hooks/usePostalLookup";
import {
  AVAILABLE_VENDORS,
  DOMESTIC_CALCULATOR_VENDORS,
  type VendorId,
  type RateRequest,
  type RateScope,
} from "@/lib/types";
import { COUNTRY_TO_ISO } from "@/utils/data";
import { computeShipmentWeights } from "@/lib/pricing/chargeableWeight";
import { useAppStore } from "@/store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORIGIN_COUNTRY = "India";
// Domestic shipments stay within India — the destination country is fixed, so
// no country picker is shown and both ends resolve to "IN".
const DOMESTIC_COUNTRY = "India";

type VendorOption = { id: string; label: string };

/** Carrier list per calculator scope. */
function vendorsForScope(scope: RateScope): readonly VendorOption[] {
  return scope === "domestic" ? DOMESTIC_CALCULATOR_VENDORS : AVAILABLE_VENDORS;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const boxSchema = z.object({
  boxCount: z.number({ error: "Required" }).int().min(1, "Min 1"),
  weightKg: z.number({ error: "Add weight" }).positive("Add weight"),
  lengthCm: z.number({ error: "Add size" }).positive("Add size"),
  widthCm: z.number({ error: "Add size" }).positive("Add size"),
  heightCm: z.number({ error: "Add size" }).positive("Add size"),
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

// Start empty so nothing looks like real data. boxCount defaults to 1 (you
// always have at least one box); everything else is blank with placeholders.
const emptyBox = {
  boxCount: 1,
  weightKg: undefined,
  lengthCm: undefined,
  widthCm: undefined,
  heightCm: undefined,
} as unknown as FormValues["boxes"][number];

function makeDefaultValues(scope: RateScope): FormValues {
  return {
    originPincode: "",
    originCity: "",
    // Domestic is India → India; the country field is fixed and hidden.
    destinationCountry: scope === "domestic" ? DOMESTIC_COUNTRY : "",
    destinationPincode: "",
    destinationCity: "",
    sizeUnit: "cm",
    boxes: [emptyBox],
    // Every carrier selected by default.
    vendors: vendorsForScope(scope).map((v) => v.id),
  };
}

// ---------------------------------------------------------------------------
// Small bits
// ---------------------------------------------------------------------------

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label="More info"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-55 text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function SectionLabel({
  children,
  tip,
}: {
  children: React.ReactNode;
  tip?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
      {tip && <InfoTip text={tip} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route: From (India, locked) + To (any country)
// ---------------------------------------------------------------------------

interface RouteProps {
  register: ReturnType<typeof useForm<FormValues>>["register"];
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  control: Control<FormValues>;
  scope: RateScope;
}

// India chip used for the locked origin (both scopes) and the locked domestic
// destination. Keeps the "this end is India" cue consistent.
function IndiaChip({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground">
          <span className="text-sm leading-none">🇮🇳</span>
          India
          <Lock className="h-3 w-3 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

function PincodeHint({
  state,
  errorMessage,
}: {
  state: ReturnType<typeof usePostalLookup>;
  errorMessage?: string;
}) {
  if (state === "found") {
    return (
      <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" /> City filled in
      </p>
    );
  }
  return <FieldError message={errorMessage} />;
}

function RouteCard({ register, setValue, errors, control, scope }: RouteProps) {
  const isDomestic = scope === "domestic";

  const originPincode = useWatch({ control, name: "originPincode" });
  const destCountry = useWatch({ control, name: "destinationCountry" });
  const destPincode = useWatch({ control, name: "destinationPincode" });

  const originLookup = usePostalLookup(ORIGIN_COUNTRY, originPincode ?? "", (city) =>
    setValue("originCity", city, { shouldValidate: true }),
  );
  // Domestic destination is always India; international uses the picked country.
  const destLookup = usePostalLookup(
    isDomestic ? DOMESTIC_COUNTRY : destCountry ?? "",
    destPincode ?? "",
    (city) => setValue("destinationCity", city, { shouldValidate: true }),
  );

  const destPincodeLabel = isDomestic ? "Pincode" : "Postal code";
  const destPincodePlaceholder = isDomestic ? "e.g. 400001" : "Postal / ZIP";

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        {/* From */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Sending from</SectionLabel>
            <IndiaChip
              tip={
                isDomestic
                  ? "Domestic shipments are picked up within India."
                  : "This tool quotes shipments leaving India."
              }
            />
          </div>
          <div className="grid grid-cols-[0.5fr_1fr] gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Pincode</Label>
              <div className="relative">
                <Input
                  {...register("originPincode")}
                  inputMode="numeric"
                  placeholder="e.g. 110059"
                  className="pr-8"
                />
                {originLookup === "loading" && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <PincodeHint state={originLookup} errorMessage={errors.originPincode?.message} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">City</Label>
              <Input
                {...register("originCity")}
                placeholder={originLookup === "loading" ? "Looking up..." : "City"}
              />
              <FieldError message={errors.originCity?.message} />
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* To */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Sending to</SectionLabel>
            {isDomestic && (
              <IndiaChip tip="Domestic shipments are delivered within India." />
            )}
          </div>
          {!isDomestic && (
            <Controller
              control={control}
              name="destinationCountry"
              render={({ field }) => (
                <CountryCombobox
                  value={field.value}
                  label={null}
                  onChange={(name) => {
                    field.onChange(name);
                    setValue("destinationPincode", "");
                    setValue("destinationCity", "");
                  }}
                  error={errors.destinationCountry?.message}
                />
              )}
            />
          )}
          <div className="grid grid-cols-[0.5fr_1fr] gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">{destPincodeLabel}</Label>
              <div className="relative">
                <Input
                  {...register("destinationPincode")}
                  inputMode={isDomestic ? "numeric" : undefined}
                  placeholder={destPincodePlaceholder}
                  className="pr-8"
                />
                {destLookup === "loading" && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <PincodeHint state={destLookup} errorMessage={errors.destinationPincode?.message} />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">City</Label>
              <Input
                {...register("destinationCity")}
                placeholder={destLookup === "loading" ? "Looking up..." : "City"}
              />
              <FieldError message={errors.destinationCity?.message} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Boxes: compact one-row-per-box table
// ---------------------------------------------------------------------------

const BOX_GRID = "grid grid-cols-3 gap-2 sm:grid-cols-[3rem_5.5rem_1fr_1fr_1fr_1.75rem] sm:items-center";

interface BoxRowProps {
  index: number;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  canRemove: boolean;
  onRemove: () => void;
}

function BoxRow({ index, register, errors, canRemove, onRemove }: BoxRowProps) {
  const be = errors.boxes?.[index];
  const hasError = !!(be?.boxCount || be?.weightKg || be?.lengthCm || be?.widthCm || be?.heightCm);

  const numInput = "h-9 text-sm";

  return (
    <div className={cn("rounded-md px-1 py-1", hasError && "bg-destructive/5")}>
      <div className={BOX_GRID}>
        <Input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          aria-label="Number of boxes"
          placeholder="1"
          className={numInput}
          {...register(`boxes.${index}.boxCount`, { valueAsNumber: true })}
        />
        <Input
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          aria-label="Weight of each box in kg"
          placeholder="kg"
          className={numInput}
          {...register(`boxes.${index}.weightKg`, { valueAsNumber: true })}
        />
        <Input
          type="number"
          min="1"
          step="0.1"
          inputMode="decimal"
          aria-label="Length"
          placeholder="L"
          className={numInput}
          {...register(`boxes.${index}.lengthCm`, { valueAsNumber: true })}
        />
        <Input
          type="number"
          min="1"
          step="0.1"
          inputMode="decimal"
          aria-label="Breadth"
          placeholder="B"
          className={numInput}
          {...register(`boxes.${index}.widthCm`, { valueAsNumber: true })}
        />
        <Input
          type="number"
          min="1"
          step="0.1"
          inputMode="decimal"
          aria-label="Height"
          placeholder="H"
          className={numInput}
          {...register(`boxes.${index}.heightCm`, { valueAsNumber: true })}
        />
        <div className="flex justify-end">
          {canRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label={`Remove box ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : (
            <span className="h-8 w-8" />
          )}
        </div>
      </div>
    </div>
  );
}

function BoxesCard({
  fields,
  register,
  errors,
  control,
  onAdd,
  onRemove,
}: {
  fields: { id: string }[];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  control: Control<FormValues>;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <SectionLabel tip="Group identical boxes on one row. Add a row for each different size or weight.">
            Your boxes
          </SectionLabel>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Size in</span>
            <Controller
              control={control}
              name="sizeUnit"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-7 w-18 text-xs">
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
        </div>

        {/* Column headers (desktop only) */}
        <div
          className={cn(
            BOX_GRID,
            "hidden px-1 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid",
          )}
        >
          <span className="flex items-center gap-1">
            Qty
            <InfoTip text="How many identical boxes of this size and weight." />
          </span>
          <span className="flex items-center gap-1">
            Weight
            <InfoTip text="Weight of one box, in kilograms." />
          </span>
          <span className="flex items-center gap-1">
            L
            <InfoTip text="Length of one box." />
          </span>
          <span className="flex items-center gap-1">
            B
            <InfoTip text="Breadth (width) of one box." />
          </span>
          <span className="flex items-center gap-1">
            H
            <InfoTip text="Height of one box." />
          </span>
          <span />
        </div>

        <div className="space-y-1.5">
          {fields.map((field, index) => (
            <BoxRow
              key={field.id}
              index={index}
              register={register}
              errors={errors}
              canRemove={fields.length > 1}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="w-full border-dashed text-muted-foreground"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add another box size
        </Button>

        {typeof errors.boxes?.message === "string" && (
          <p className="text-xs text-destructive">{errors.boxes.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Action rail: carriers + charged weight + submit
// ---------------------------------------------------------------------------

function CarrierPicker({
  control,
  setValue,
  error,
  vendors,
}: {
  control: Control<FormValues>;
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  error?: string;
  vendors: readonly VendorOption[];
}) {
  const selected = useWatch({
    control,
    name: "vendors",
    defaultValue: vendors.map((v) => v.id),
  });

  const toggle = (id: string, checked: boolean) => {
    setValue(
      "vendors",
      checked ? [...selected, id] : selected.filter((v) => v !== id),
      { shouldValidate: true },
    );
  };

  const total = vendors.length;
  const count = selected.length;
  const label =
    count === total
      ? `All carriers (${total})`
      : count === 0
      ? "No carriers picked"
      : count === 1
      ? vendors.find((v) => v.id === selected[0])?.label ?? "1 carrier"
      : `${count} of ${total} carriers`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-foreground">Carriers</span>
        <InfoTip text="We ask each selected carrier for a live rate. Leave all on to compare the most options." />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2">
              <Plane className="h-4 w-4 text-muted-foreground" />
              {label}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1.5">
          {AVAILABLE_VENDORS.map((vendor) => {
            const checked = selected.includes(vendor.id);
            return (
              <label
                key={vendor.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => toggle(vendor.id, Boolean(v))}
                />
                <span className={checked ? "text-foreground" : "text-muted-foreground"}>
                  {vendor.label}
                </span>
              </label>
            );
          })}
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ChargedWeightInline({ control }: { control: Control<FormValues> }) {
  const boxes = useWatch({ control, name: "boxes", defaultValue: [] });
  const unit = useWatch({ control, name: "sizeUnit", defaultValue: "cm" });

  const w = React.useMemo(() => {
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

  const ready = w.totalChargeableKg > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-muted/50">
        <Scale className="h-4.5 w-4.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          You pay for
          <InfoTip text="Carriers bill the higher of a box's real weight or its size based (volumetric) weight. We work this out for each box, then add them up." />
        </div>
        {ready ? (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-2xl font-bold leading-none tabular-nums text-foreground">
              {w.totalChargeableKg}
              <span className="ml-1 text-sm font-medium text-muted-foreground">kg</span>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              Real {w.totalActualKg} kg · Size {w.totalVolumetricKg} kg · {w.totalPieces} box
              {w.totalPieces !== 1 ? "es" : ""}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Add box weight and size to see this.</p>
        )}
      </div>
    </div>
  );
}

function BottomBar({
  control,
  setValue,
  errors,
  loading,
  vendors,
}: {
  control: Control<FormValues>;
  setValue: ReturnType<typeof useForm<FormValues>>["setValue"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  loading: boolean;
  vendors: readonly VendorOption[];
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="lg:w-60 lg:shrink-0">
          <CarrierPicker
            control={control}
            setValue={setValue}
            error={errors.vendors?.message}
            vendors={vendors}
          />
        </div>

        <div className="hidden h-11 w-px shrink-0 bg-border lg:block" />

        <div className="flex-1">
          <ChargedWeightInline control={control} />
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full text-sm font-medium lg:w-auto lg:min-w-52"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Getting rates...
            </>
          ) : (
            <>
              Get live rates
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function RateCalculatorForm({
  scope = "international",
}: {
  /** Which calculator this form drives. Defaults to international. */
  scope?: RateScope;
}) {
  const loading = useAppStore((s) => s.loading);
  const fetchRates = useAppStore((s) => s.fetchRates);

  const vendorList = vendorsForScope(scope);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: makeDefaultValues(scope),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "boxes" });

  const onSubmit = (data: FormValues) => {
    const factor = toCmFactor(data.sizeUnit);

    const shipmentPackages = data.boxes.map((b) => ({
      quantity: Math.max(1, Math.trunc(b.boxCount) || 1),
      weightKg: b.weightKg, // weight of each box
      lengthCm: b.lengthCm * factor,
      widthCm: b.widthCm * factor,
      heightCm: b.heightCm * factor,
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
        // Declared value is not collected here; Shipmozo uses a backend dummy.
        packages: shipmentPackages,
        description: "General Cargo",
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

    fetchRates(request, data.vendors as VendorId[], scope);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-5">
      {/* Top: narrow route + wide boxes */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[24rem_1fr]">
        <RouteCard
          register={register}
          setValue={setValue}
          errors={errors}
          control={control}
          scope={scope}
        />
        <BoxesCard
          fields={fields}
          register={register}
          errors={errors}
          control={control}
          onAdd={() => append(emptyBox)}
          onRemove={(i) => remove(i)}
        />
      </div>

      {/* Bottom: carriers + summary + action */}
      <BottomBar
        control={control}
        setValue={setValue}
        errors={errors}
        loading={loading}
        vendors={vendorList}
      />
    </form>
  );
}
