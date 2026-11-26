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
import { useIsArenaOrg } from "@/hooks/useIsArenaOrg";
import { fromCm, readBoxSize, toCm, type BoxPreset } from "@/lib/booking/boxSize";
import {
  BoxPresetChips,
  BoxSizeHint,
  HowToMeasure,
} from "@/components/booking/BoxSizeHelpers";
import { KeyboardShortcuts, SubmitShortcutHint } from "./KeyboardShortcuts";
import {
  BOX_COLUMN_HEADER,
  BOX_COLUMNS,
  BOX_GRID,
  BOX_INPUT_HEIGHT,
  BOXES_TIP,
  CARRIERS_TIP,
  CHARGED_WEIGHT_EMPTY,
  CHARGED_WEIGHT_TIP,
  DOMESTIC_DESTINATION_TIP,
  FORM_TOP_GRID,
  INVOICE_VALUE_TIP,
  ROUTE_FIELD_GRID,
  SECTION_LABEL_TEXT,
  allCarriersLabel,
  destinationPincodeLabel,
  originTip,
} from "./formLayout";

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

/**
 * INVOICE VALUE — DOMESTIC ONLY, AND REQUIRED THERE.
 *
 * Two things downstream need a real figure, and both were being answered with a
 * dummy until this field existed:
 *
 *   1. Shipmozo prices risk-of-value against `order_amount`, so quoting every
 *      shipment at the fallback dummy overstated that charge on cheap goods and
 *      understated it on expensive ones.
 *   2. Some couriers will not carry high-value consignments at all
 *      (lib/rates/domesticCarrierRules.ts). Without a value the calculator
 *      cannot apply that rule, and would keep showing a rate the booking step
 *      then withdraws — the worst moment to find out.
 *
 * Required rather than optional for exactly that second reason: an optional
 * field left blank puts the two surfaces back out of step, and the customer
 * meets the difference after entering every address.
 *
 * The international calculator does not collect it. Its vendors price duty from
 * the commercial invoice at booking, not from a figure typed into a quick quote.
 */
const formSchema = z
  .object({
    originPincode: z.string().trim().min(1, "Enter a pincode"),
    originCity: z.string().trim().min(1, "Enter a city"),
    destinationCountry: z.string().min(1, "Pick a country"),
    destinationPincode: z.string().trim().min(1, "Enter a postal code"),
    destinationCity: z.string().trim().min(1, "Enter a city"),
    sizeUnit: z.enum(["cm", "in"]),
    boxes: z.array(boxSchema).min(1, "Add at least one box"),
    vendors: z.array(z.string()).min(1, "Pick at least one carrier"),
    /** Rupees. Present and positive on domestic, always absent on international. */
    invoiceValue: z.number().positive("Add the invoice value").optional(),
    scope: z.enum(["international", "domestic"]),
  })
  .refine(
    (data) => data.scope !== "domestic" || typeof data.invoiceValue === "number",
    {
      path: ["invoiceValue"],
      message: "Add the invoice value",
      // Zod skips an object-level check while any field has a type error, and
      // an empty box field is one (NaN). Without this the invoice value only
      // complained on the second Get rates, after the boxes were filled. The
      // check reads nothing but scope and invoiceValue, so it is safe to run
      // on a half-filled form.
      when: () => true,
    },
  );

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
    // Blank rather than a plausible-looking figure: a prefilled invoice value
    // is fake data that prices a real quote.
    invoiceValue: undefined,
    // Mirrored into the form so the schema can make the invoice value
    // conditionally required without the resolver needing outside context.
    scope,
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
      <span className={SECTION_LABEL_TEXT}>
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

  const destPincodeLabel = destinationPincodeLabel(scope);
  const destPincodePlaceholder = isDomestic ? "e.g. 400001" : "Postal / ZIP";

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        {/* From */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Sending from</SectionLabel>
            <IndiaChip tip={originTip(scope)} />
          </div>
          <div className={ROUTE_FIELD_GRID}>
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
              <IndiaChip tip={DOMESTIC_DESTINATION_TIP} />
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
          <div className={ROUTE_FIELD_GRID}>
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

        {/* Invoice value — domestic only. See the note on formSchema. */}
        {isDomestic && (
          <>
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <SectionLabel tip={INVOICE_VALUE_TIP}>
                Invoice value
              </SectionLabel>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <Input
                  {...register("invoiceValue", {
                    // An empty field is "not answered", not zero. valueAsNumber
                    // alone turns "" into NaN, which the schema reports as a
                    // type error instead of the message written for it.
                    setValueAs: (v) =>
                      v === "" || v === null || v === undefined
                        ? undefined
                        : Number(v),
                  })}
                  inputMode="numeric"
                  placeholder="e.g. 4500"
                  className="pl-7"
                />
              </div>
              <FieldError message={errors.invoiceValue?.message} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Boxes: compact one-row-per-box table
// ---------------------------------------------------------------------------

/**
 * Spreadsheet-style keys across the box rows. Delegated from the rows' wrapper,
 * so each input only carries its row and column as data attributes.
 *
 *   ← →  move to the neighbouring field once the caret is at that edge of the
 *        number (or the whole number is selected, as it is after a move)
 *   ↑ ↓  move to the same field in the row above or below
 *
 * Moving selects the target's value so typing replaces it, as in a sheet. The
 * inputs are type="text" with a decimal keypad: number inputs hide the caret
 * position and change the value on ↑/↓ and the mouse wheel, which is how a
 * wrong weight slips through unnoticed. Stray letters are blocked here instead.
 */
function handleBoxGridKeys(e: React.KeyboardEvent<HTMLDivElement>) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.dataset.boxCol === undefined) return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;

  const row = Number(el.dataset.boxRow);
  const col = Number(el.dataset.boxCol);
  const root = e.currentTarget;
  const moveTo = (r: number, c: number) => {
    const target = root.querySelector<HTMLInputElement>(
      `input[data-box-row="${r}"][data-box-col="${c}"]`,
    );
    if (!target) return false;
    target.focus();
    target.select();
    return true;
  };

  const len = el.value.length;
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const allSelected = start === 0 && end === len;
  const atStart = allSelected || (start === 0 && end === 0);
  const atEnd = allSelected || (start === len && end === len);

  switch (e.key) {
    case "ArrowLeft":
      if (atStart && moveTo(row, col - 1)) e.preventDefault();
      return;
    case "ArrowRight":
      if (atEnd && moveTo(row, col + 1)) e.preventDefault();
      return;
    case "ArrowUp":
      e.preventDefault();
      moveTo(row - 1, col);
      return;
    case "ArrowDown":
      e.preventDefault();
      moveTo(row + 1, col);
      return;
  }

  // Digits and one decimal point only. Named keys (Tab, Backspace...) pass.
  if (e.key.length === 1 && !/[0-9.]/.test(e.key)) e.preventDefault();
  if (e.key === "." && el.value.includes(".") && !allSelected) e.preventDefault();
}

interface BoxRowProps {
  index: number;
  control: Control<FormValues>;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  canRemove: boolean;
  onRemove: () => void;
}

type BoxFieldKey = keyof FormValues["boxes"][number];

/** In the order the row shows them, named the way the message reads. */
const BOX_FIELD_NAMES: { key: BoxFieldKey; name: string }[] = [
  { key: "boxCount", name: "number of boxes" },
  { key: "weightKg", name: "weight" },
  { key: "lengthCm", name: "length" },
  { key: "widthCm", name: "breadth" },
  { key: "heightCm", name: "height" },
];

/** "weight", "weight and height", "weight, length and height". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function BoxRow({ index, control, register, errors, canRemove, onRemove }: BoxRowProps) {
  const be = errors.boxes?.[index];
  // Each input that still needs a value gets its own red outline, and one line
  // under the row names them. Tinting the whole row left people guessing which
  // of five boxes was wrong, and the tint stayed after they fixed the one they
  // noticed.
  const missing = BOX_FIELD_NAMES.filter((f) => be?.[f.key]).map((f) => f.name);

  const numInput = cn(BOX_INPUT_HEIGHT, "text-sm");
  const invalid = (key: BoxFieldKey) => (be?.[key] ? true : undefined);

  return (
    <div className="rounded-md px-1 py-1">
      <div className={BOX_GRID}>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          data-box-row={index}
          data-box-col={0}
          aria-label="Number of boxes"
          placeholder="1"
          className={numInput}
          aria-invalid={invalid("boxCount")}
          {...register(`boxes.${index}.boxCount`, { valueAsNumber: true })}
        />
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-box-row={index}
          data-box-col={1}
          aria-label="Weight of each box in kg"
          placeholder="kg"
          className={numInput}
          aria-invalid={invalid("weightKg")}
          {...register(`boxes.${index}.weightKg`, { valueAsNumber: true })}
        />
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-box-row={index}
          data-box-col={2}
          aria-label="Length"
          placeholder="L"
          className={numInput}
          aria-invalid={invalid("lengthCm")}
          {...register(`boxes.${index}.lengthCm`, { valueAsNumber: true })}
        />
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-box-row={index}
          data-box-col={3}
          aria-label="Breadth"
          placeholder="B"
          className={numInput}
          aria-invalid={invalid("widthCm")}
          {...register(`boxes.${index}.widthCm`, { valueAsNumber: true })}
        />
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-box-row={index}
          data-box-col={4}
          aria-label="Height"
          placeholder="H"
          className={numInput}
          aria-invalid={invalid("heightCm")}
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
      {missing.length > 0 && (
        <p className="px-0.5 pt-1 text-[11px] text-destructive">
          Add the {joinWords(missing)}
        </p>
      )}
      <BoxRowHint control={control} index={index} />
    </div>
  );
}

/** Live size weight and mistyped-number hints for one row, in cm whatever the unit. */
function BoxRowHint({ control, index }: { control: Control<FormValues>; index: number }) {
  const box = useWatch({ control, name: `boxes.${index}` });
  const unit = useWatch({ control, name: "sizeUnit", defaultValue: "cm" });
  const reading = readBoxSize({
    lengthCm: toCm(Number(box?.lengthCm) || 0, unit),
    widthCm: toCm(Number(box?.widthCm) || 0, unit),
    heightCm: toCm(Number(box?.heightCm) || 0, unit),
    weightKg: Number(box?.weightKg) || 0,
    unit,
  });
  return <BoxSizeHint reading={reading} className="px-0.5 pt-1" />;
}

function BoxesCard({
  fields,
  register,
  errors,
  control,
  onAdd,
  onRemove,
  onPreset,
}: {
  fields: { id: string }[];
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
  control: Control<FormValues>;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onPreset: (preset: BoxPreset) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <SectionLabel tip={BOXES_TIP}>
            Your boxes
          </SectionLabel>
          <div className="flex items-center gap-1.5">
            <KeyboardShortcuts className="mr-1" />
            <HowToMeasure className="mr-2" />
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
        <div className={cn(BOX_GRID, BOX_COLUMN_HEADER)}>
          {BOX_COLUMNS.map((col) => (
            <span key={col.label} className="flex items-center gap-1">
              {col.label}
              <InfoTip text={col.tip} />
            </span>
          ))}
          <span />
        </div>

        <div className="space-y-1.5" onKeyDown={handleBoxGridKeys}>
          {fields.map((field, index) => (
            <BoxRow
              key={field.id}
              index={index}
              control={control}
              register={register}
              errors={errors}
              canRemove={fields.length > 1}
              onRemove={() => onRemove(index)}
            />
          ))}
        </div>

        <BoxPresetChips onPick={onPreset} className="px-1" />

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
      ? allCarriersLabel(total)
      : count === 0
      ? "No carriers picked"
      : count === 1
      ? vendors.find((v) => v.id === selected[0])?.label ?? "1 carrier"
      : `${count} of ${total} carriers`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-foreground">Carriers</span>
        <InfoTip text={CARRIERS_TIP} />
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
          {vendors.map((vendor) => {
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
          <InfoTip text={CHARGED_WEIGHT_TIP} />
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
          <p className="text-sm text-muted-foreground">{CHARGED_WEIGHT_EMPTY}</p>
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
  // Carrier selection is an internal-ops control: only Arena staff pick which
  // vendors to query. Customers always query every carrier (the form defaults
  // to all vendors), so the picker is hidden for them and the rail collapses to
  // charged weight plus the action.
  const isArena = useIsArenaOrg();

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
        {isArena && (
          <>
            <div className="lg:w-60 lg:shrink-0">
              <CarrierPicker
                control={control}
                setValue={setValue}
                error={errors.vendors?.message}
                vendors={vendors}
              />
            </div>

            <div className="hidden h-11 w-px shrink-0 bg-border lg:block" />
          </>
        )}

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
              <SubmitShortcutHint />
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
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: makeDefaultValues(scope),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "boxes" });

  // `defaultValues` is read once, at mount. `scope` is mirrored into the form
  // only so the resolver can make the invoice value conditionally required, and
  // a stale copy of it would silently drop that requirement, so it is kept in
  // step here. Safe to write on every change: no one types into this field.
  React.useEffect(() => {
    setValue("scope", scope);
  }, [scope, setValue]);

  // A common-size chip fills the last row if it has no size yet, otherwise it
  // adds a new row of that size. Converted to whichever unit is picked.
  const applyPreset = (preset: BoxPreset) => {
    const unit = getValues("sizeUnit");
    const boxes = getValues("boxes");
    const dims = {
      lengthCm: fromCm(preset.lengthCm, unit),
      widthCm: fromCm(preset.widthCm, unit),
      heightCm: fromCm(preset.heightCm, unit),
    };
    const last = boxes.length - 1;
    const lastBox = boxes[last];
    const lastHasSize =
      !!lastBox &&
      [lastBox.lengthCm, lastBox.widthCm, lastBox.heightCm].some((v) => Number(v) > 0);
    if (last < 0 || lastHasSize) {
      append({ ...emptyBox, ...dims });
      return;
    }
    (["lengthCm", "widthCm", "heightCm"] as const).forEach((key) =>
      setValue(`boxes.${last}.${key}`, dims[key], { shouldDirty: true, shouldValidate: true }),
    );
  };

  // Enter on its own never searches: in a dense numeric form a stray Enter sent
  // half-filled boxes. ⌘/Ctrl+Enter searches from any field instead.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (!loading) e.currentTarget.requestSubmit();
      return;
    }
    if (e.target instanceof HTMLInputElement) e.preventDefault();
  };

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
        // Domestic collects a real invoice value (see formSchema); international
        // does not, and its adapters fall back to a neutral dummy for the
        // vendors that insist on the field.
        declaredValue: data.invoiceValue,
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
    <form
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={onFormKeyDown}
      autoComplete="off"
      className="space-y-5"
    >
      {/* Top: narrow route + wide boxes */}
      <div className={FORM_TOP_GRID}>
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
          onPreset={applyPreset}
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
