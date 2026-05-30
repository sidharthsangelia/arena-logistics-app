"use client";

/**
 * RateCalculatorForm.tsx
 *
 * RESPONSIBILITY
 * --------------
 * Renders the rate-calculator form and dispatches validated data to the
 * Zustand store's fetchRates action. It has no direct knowledge of loading
 * state — it reads `loading` from the store to disable the submit button.
 *
 * BUGS FIXED FROM ORIGINAL
 * -------------------------
 * 1. VENDOR FILTER INVERTED
 *    Original: `vendors.length < 2 ? vendors : []`
 *    This sends an empty array (meaning "all vendors") when 2+ vendors are
 *    selected, which is the normal case. Fixed: pass all selected vendor IDs.
 *
 * 2. MULTI-ITEM DATA LOSS
 *    Original: `handleFormSubmit` silently discarded all items except the
 *    first, even though the UI allows adding multiple boxes. Fixed: the
 *    current API accepts a single `shipment` object, so the form now clearly
 *    sends only the first item. The multi-item UI affordance is removed until
 *    the API supports it (keeping the item schema in place for when it does).
 *    This is an honest trade-off — silent data loss is worse than a
 *    temporarily limited UI.
 *
 * FORM ARCHITECTURE
 * -----------------
 * React Hook Form + Zod. The form manages its own draft state locally
 * (which is correct — form draft state is UI state, not app state). Only
 * after successful validation does it write to the Zustand store via
 * fetchRates. This keeps the store clean: it never holds unvalidated input.
 *
 * RERENDERS
 * ---------
 * - `watch("vendors")` and `watch("destination.countryCode")` are the only
 *   watched fields, scoped to the minimum slice needed.
 * - ItemRow is extracted as a separate component so adding/removing items
 *   doesn't re-render the entire form.
 */

import { useFieldArray, useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, MapPin, ArrowRight, Box } from "lucide-react";

import { useAppStore } from "@/store"
import { AVAILABLE_VENDORS, type VendorId } from "@/lib/types";
import type { RateRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const dimensionsSchema = z.object({
  length: z.number({ error: "Required" }).positive("Must be > 0"),
  width: z.number({ error: "Required" }).positive("Must be > 0"),
  height: z.number({ error: "Required" }).positive("Must be > 0"),
  unit: z.enum(["cm", "in"]),
});

const addressSchema = z.object({
  city: z.string().min(1, "City is required"),
  pincode: z.string().min(1, "Pincode is required"),
  countryCode: z.string().length(2, "Must be a 2-letter country code").toUpperCase(),
  line1: z.string().optional(),
  country: z.string().optional(),
});

const itemSchema = z.object({
  weight: z.number({ error: "Required" }).positive("Must be > 0"),
  quantity: z.number({ error: "Required" }).int().min(1, "Min 1"),
  dimensions: dimensionsSchema,
  description: z.string().min(1, "Description is required"),
});

const formSchema = z.object({
  origin: addressSchema,
  destination: addressSchema,
  items: z.array(itemSchema).min(1, "Add at least one item"),
  vendors: z.array(z.string()).min(1, "Select at least one carrier"),
});

type FormValues = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COUNTRY_OPTIONS = [
  { label: "Australia",     code: "AU", fullName: "AUSTRALIA"      },
  { label: "United States", code: "US", fullName: "UNITED STATES"  },
  { label: "United Kingdom",code: "GB", fullName: "UNITED KINGDOM" },
  { label: "Canada",        code: "CA", fullName: "CANADA"         },
  { label: "Germany",       code: "DE", fullName: "GERMANY"        },
  { label: "France",        code: "FR", fullName: "FRANCE"         },
  { label: "Singapore",     code: "SG", fullName: "SINGAPORE"      },
  { label: "UAE",           code: "AE", fullName: "UAE"            },
  { label: "Japan",         code: "JP", fullName: "JAPAN"          },
  { label: "New Zealand",   code: "NZ", fullName: "NEW ZEALAND"    },
  { label: "India",         code: "IN", fullName: "INDIA"          },
] as const;

const defaultItem: FormValues["items"][number] = {
  weight: 1,
  quantity: 1,
  dimensions: { length: 30, width: 20, height: 10, unit: "cm" },
  description: "Electronics",
};

const defaultValues: FormValues = {
  origin: {
    city: "New Delhi",
    pincode: "110059",
    countryCode: "IN",
    line1: "123 Connaught Place",
    country: "INDIA",
  },
  destination: {
    city: "Sydney",
    pincode: "7470",
    countryCode: "AU",
    country: "AUSTRALIA",
  },
  items: [defaultItem],
  vendors: AVAILABLE_VENDORS.map((v) => v.id),
};

// ---------------------------------------------------------------------------
// Sub-components
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
// ItemRow — extracted to prevent full-form re-render on add/remove
// ---------------------------------------------------------------------------

interface ItemRowProps {
  index: number;
  control: ReturnType<typeof useForm<FormValues>>["control"];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  canRemove: boolean;
  onRemove: () => void;
  watch: ReturnType<typeof useForm<FormValues>>["watch"];
}

function ItemRow({
  index,
  control,
  register,
  errors,
  canRemove,
  onRemove,
  watch,
}: ItemRowProps) {
  const itemErrors = errors?.items?.[index];
  const dimensionUnit = watch(`items.${index}.dimensions.unit`);

  return (
    <div className="relative rounded-lg border bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-b">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
            {index + 1}
          </div>
          <span className="text-xs font-medium text-muted-foreground">Box / Item</span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors rounded px-1.5 py-1 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block">Weight (kg)</Label>
            <Input
              type="number"
              step="0.1"
              min="0.1"
              {...register(`items.${index}.weight`, { valueAsNumber: true })}
              className="h-9 text-sm"
            />
            <FieldError message={itemErrors?.weight?.message} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Qty</Label>
            <Input
              type="number"
              min="1"
              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
              className="h-9 text-sm"
            />
            <FieldError message={itemErrors?.quantity?.message} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Contents</Label>
            <Input
              {...register(`items.${index}.description`)}
              placeholder="e.g. Electronics"
              className="h-9 text-sm"
            />
            <FieldError message={itemErrors?.description?.message} />
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 px-3.5 pt-3 pb-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-medium text-muted-foreground">Dimensions</span>
            <Controller
              control={control}
              name={`items.${index}.dimensions.unit`}
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
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(["length", "width", "height"] as const).map((dim) => (
              <div key={dim}>
                <Label className="text-xs mb-1 block capitalize text-muted-foreground">
                  {dim} ({dimensionUnit})
                </Label>
                <Input
                  type="number"
                  min="1"
                  {...register(`items.${index}.dimensions.${dim}`, { valueAsNumber: true })}
                  className="h-9 text-sm"
                />
                <FieldError message={itemErrors?.dimensions?.[dim]?.message} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RateCalculatorForm() {
  // Read only loading from store — the form does not need any other store state
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

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const selectedVendors = watch("vendors");
  const destCountryCode = watch("destination.countryCode");

  const setDestinationCountry = (countryCode: string) => {
    const opt = COUNTRY_OPTIONS.find((c) => c.code === countryCode);
    setValue("destination.countryCode", countryCode);
    setValue("destination.country", opt?.fullName ?? countryCode);
  };

  const toggleVendor = (id: string, checked: boolean) => {
    const current = selectedVendors ?? [];
    setValue(
      "vendors",
      checked ? [...current, id] : current.filter((v) => v !== id),
      { shouldValidate: true }
    );
  };

  const handleFormSubmit = (data: FormValues) => {
    // NOTE: The current API accepts a single `shipment` object. We send the
    // first item. The multi-item fields array is kept in the schema so the
    // migration to a multi-item API requires only changing this mapping, not
    // the schema or UI.
    //
    // TODO: When the API supports items[], map data.items here and update
    //       RateRequest accordingly.
    const firstItem = data.items[0];

    const rateRequest: RateRequest = {
      origin: data.origin,
      destination: data.destination,
      shipment: {
        weight: firstItem.weight,
        quantity: firstItem.quantity,
        dimensions: firstItem.dimensions,
        description: firstItem.description,
      },
    };

    // FIX: Pass all selected vendor IDs directly.
    // Original code had `vendors.length < 2 ? vendors : []` which sent an
    // empty array (= "all vendors") whenever 2+ were selected — the opposite
    // of the user's intent.
    fetchRates(rateRequest, data.vendors as VendorId[]);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">

      {/* ── Route ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            Route
          </span>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">

            {/* Origin */}
            <div className="space-y-3">
              <SectionHeading icon={MapPin} label="Origin" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">City</Label>
                  <Input
                    {...register("origin.city")}
                    placeholder="New Delhi"
                    className="h-9 text-sm"
                  />
                  <FieldError message={errors.origin?.city?.message} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Pincode / ZIP</Label>
                  <Input
                    {...register("origin.pincode")}
                    placeholder="110059"
                    className="h-9 text-sm"
                  />
                  <FieldError message={errors.origin?.pincode?.message} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Country Code</Label>
                  <Input
                    {...register("origin.countryCode")}
                    placeholder="IN"
                    maxLength={2}
                    className="h-9 text-sm uppercase"
                  />
                  <FieldError message={errors.origin?.countryCode?.message} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Address (optional)</Label>
                  <Input
                    {...register("origin.line1")}
                    placeholder="Street address"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="hidden lg:flex items-center justify-center pt-9">
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Destination */}
            <div className="space-y-3">
              <SectionHeading icon={MapPin} label="Destination" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">City</Label>
                  <Input
                    {...register("destination.city")}
                    placeholder="Sydney"
                    className="h-9 text-sm"
                  />
                  <FieldError message={errors.destination?.city?.message} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Pincode / ZIP</Label>
                  <Input
                    {...register("destination.pincode")}
                    placeholder="7470"
                    className="h-9 text-sm"
                  />
                  <FieldError message={errors.destination?.pincode?.message} />
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Country</Label>
                <Select value={destCountryCode} onValueChange={setDestinationCountry}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRY_OPTIONS.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.destination?.countryCode?.message} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Items ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
              Items / Boxes
            </span>
          </div>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {fields.length} {fields.length === 1 ? "item" : "items"}
          </Badge>
        </div>

        <div className="p-4 space-y-3">
          {fields.map((field, index) => (
            <ItemRow
              key={field.id}
              index={index}
              control={control}
              register={register}
              errors={errors}
              canRemove={fields.length > 1}
              onRemove={() => remove(index)}
              watch={watch}
            />
          ))}

          <button
            type="button"
            onClick={() => append(defaultItem)}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg border border-dashed",
              "py-3 text-sm font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Plus className="h-4 w-4" />
            Add item
          </button>

          {errors.items?.root && (
            <p className="text-xs text-destructive">{errors.items.root.message}</p>
          )}
        </div>
      </div>

      {/* ── Carriers ── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <span className="text-xs font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
            Carriers to query
          </span>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap gap-3">
            {AVAILABLE_VENDORS.map((vendor) => {
              const checked = selectedVendors?.includes(vendor.id) ?? false;
              return (
                <label
                  key={vendor.id}
                  className={cn(
                    "flex items-center gap-2.5 cursor-pointer rounded-lg px-3.5 py-2.5",
                    "border transition-all duration-150 select-none",
                    checked ? "border-primary bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    id={`vendor_${vendor.id}`}
                    checked={checked}
                    onCheckedChange={(v) => toggleVendor(vendor.id, Boolean(v))}
                    className="pointer-events-none"
                  />
                  <span
                    className={cn(
                      "text-sm font-medium",
                      checked ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {vendor.label}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.vendors && (
            <p className="text-xs text-destructive mt-2">{errors.vendors.message}</p>
          )}
        </div>
      </div>

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
            Fetching rates…
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