"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2, Info, Scale } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type {
  BookingFormData,
  CargoBox,
  BoxContentItem,
  ShipmentTypeValue,
} from "@/types/booking.types";
import {
  totalDeclaredValue,
  totalBoxCount,
  boxDeclaredValue,
  boxChargeableWeight,
  boxVolumetricWeight,
  totalChargeableWeight,
  isCsb4Allowed,
  CSB4_MAX_VALUE,
} from "@/lib/booking/cargo";
import { FileUploadField } from "../FileUploadField";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

const SHIPMENT_TYPES: {
  value: ShipmentTypeValue;
  title: string;
  blurb: string;
  tip: string;
}[] = [
  {
    value: "CSB4",
    title: "CSB-IV",
    blurb: "Personal or gift, under ₹25,000",
    tip: "For personal or low-value exports under ₹25,000. Lightest paperwork: just the sender's PAN and Aadhaar.",
  },
  {
    value: "CSB5",
    title: "CSB-V",
    blurb: "₹25,000 or more, needs IEC",
    tip: "For exports of ₹25,000 or more, or when you want export incentives. Needs GST and IEC on top of PAN and Aadhaar.",
  },
  {
    value: "COMMERCIAL",
    title: "Commercial",
    blurb: "Business to business",
    tip: "Full commercial export for B2B shipments. Needs company KYC: GST, IEC, LUT, and PAN of both the company and its founder.",
  },
];

interface Props {
  data: BookingFormData;
  onChange: (data: Partial<BookingFormData>) => void;
  error?: string;
}

function newContentItem(): BoxContentItem {
  return { id: nanoid(), description: "", hsCode: "", quantity: 1, unitValue: 0 };
}

function newBox(): CargoBox {
  return {
    id: nanoid(),
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    weightKg: 0,
    quantity: 1,
    contents: [newContentItem()],
  };
}

export default function ShipmentDetailsStep({ data, onChange, error }: Props) {
  const boxes = data.boxes ?? [];
  const currency = data.currency;

  const totalValue = totalDeclaredValue(boxes);
  const boxCount = totalBoxCount(boxes);
  const chargeableWeight = totalChargeableWeight(boxes);
  const csb4Allowed = isCsb4Allowed(totalValue);

  // Remembers that WE moved CSB-IV → CSB-V because the value crossed ₹25,000,
  // so we can move it back down if the value is later reduced. A manual pick
  // (via selectType) clears this, so we never undo the user's own choice.
  const autoBumpedRef = useRef(false);

  // Seed one starter box so the step never opens empty.
  useEffect(() => {
    if (boxes.length === 0) onChange({ boxes: [newBox()] });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the customs category honest with the declared value, both ways:
  //  • at/above ₹25,000 a CSB-IV shipment must become CSB-V;
  //  • back below ₹25,000, if we were the ones who bumped it, revert to CSB-IV.
  useEffect(() => {
    if (!csb4Allowed && data.shipmentType === "CSB4") {
      autoBumpedRef.current = true;
      onChange({ shipmentType: "CSB5" });
    } else if (csb4Allowed && autoBumpedRef.current && data.shipmentType === "CSB5") {
      autoBumpedRef.current = false;
      onChange({ shipmentType: "CSB4" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csb4Allowed, data.shipmentType]);

  const selectType = (value: ShipmentTypeValue) => {
    autoBumpedRef.current = false;
    onChange({ shipmentType: value });
  };

  // ── box + item mutations ──
  const patchBox = (bi: number, patch: Partial<CargoBox>) => {
    const next = boxes.map((b, i) => (i === bi ? { ...b, ...patch } : b));
    onChange({ boxes: next });
  };
  const patchItem = (bi: number, ii: number, patch: Partial<BoxContentItem>) => {
    const box = boxes[bi];
    const contents = box.contents.map((it, i) => (i === ii ? { ...it, ...patch } : it));
    patchBox(bi, { contents });
  };
  const addBox = () => onChange({ boxes: [...boxes, newBox()] });
  const removeBox = (bi: number) => onChange({ boxes: boxes.filter((_, i) => i !== bi) });
  const addItem = (bi: number) =>
    patchBox(bi, { contents: [...boxes[bi].contents, newContentItem()] });
  const removeItem = (bi: number, ii: number) =>
    patchBox(bi, { contents: boxes[bi].contents.filter((_, i) => i !== ii) });

  const fmtMoney = (n: number) => `${currency} ${n.toLocaleString("en-IN")}`;
  const fmtKg = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">What are you shipping?</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              List your boxes and what&apos;s inside. This sets the price, the
              customs category, and the documents you&apos;ll need.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Values in</Label>
            <Select value={currency} onValueChange={(v) => onChange({ currency: v })}>
              <SelectTrigger className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Boxes ── */}
        <div className="space-y-3">
          {boxes.map((box, bi) => {
            const actual = (Number(box.weightKg) || 0);
            const volumetric = boxVolumetricWeight(box);
            const chargeable = boxChargeableWeight(box);
            const bySize = volumetric > actual && volumetric > 0;

            return (
              <div key={box.id} className="rounded-lg border bg-card">
                {/* header */}
                <div className="flex items-center justify-between border-b px-4 py-2.5">
                  <span className="text-sm font-medium">Box {bi + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    disabled={boxes.length === 1}
                    onClick={() => removeBox(bi)}
                    aria-label="Remove box"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4 p-4">
                  {/* dimensions / weight / count */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {(
                      [
                        ["lengthCm", "Length (cm)"],
                        ["widthCm", "Width (cm)"],
                        ["heightCm", "Height (cm)"],
                        ["weightKg", "Weight (kg)"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={box[key] || ""}
                          onChange={(e) => patchBox(bi, { [key]: Number(e.target.value) })}
                        />
                      </div>
                    ))}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Label className="text-xs text-muted-foreground">Identical boxes</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="text-muted-foreground" aria-label="About identical boxes">
                              <Info className="h-3 w-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Shipping several boxes of the same size, weight and
                            contents? Set the count here instead of adding each
                            one. Add a new box only when something differs.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={box.quantity || ""}
                        onChange={(e) => patchBox(bi, { quantity: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  {/* contents */}
                  <div className="space-y-2">
                    {/* Column headers (sm+) */}
                    <div className="hidden gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_110px_70px_120px_32px]">
                      <span>Item</span>
                      <span>HSN code</span>
                      <span>Qty</span>
                      <span>Value / unit</span>
                      <span />
                    </div>

                    {box.contents.map((item, ii) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_70px_120px_32px] sm:items-center"
                      >
                        <Input
                          value={item.description}
                          onChange={(e) => patchItem(bi, ii, { description: e.target.value })}
                          placeholder="e.g. Cotton T-shirts"
                        />
                        <Input
                          value={item.hsCode}
                          onChange={(e) => patchItem(bi, ii, { hsCode: e.target.value })}
                          placeholder="6109.10"
                        />
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity || ""}
                          onChange={(e) => patchItem(bi, ii, { quantity: Number(e.target.value) })}
                          placeholder="Qty"
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitValue || ""}
                          onChange={(e) => patchItem(bi, ii, { unitValue: Number(e.target.value) })}
                          placeholder="Value"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          disabled={box.contents.length === 1}
                          onClick={() => removeItem(bi, ii)}
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addItem(bi)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add item
                    </Button>
                  </div>

                  {/* per-box footer: value + chargeable weight */}
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                    <span>
                      Box value{" "}
                      <strong className="text-foreground">{fmtMoney(boxDeclaredValue(box))}</strong>
                      {box.quantity > 1 && (
                        <> × {box.quantity} = <strong className="text-foreground">{fmtMoney(boxDeclaredValue(box) * box.quantity)}</strong></>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5">
                      Chargeable{" "}
                      <strong className="text-foreground">{fmtKg(chargeable)}</strong>
                      {bySize && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                              charged by size
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            This box is bulky for its weight, so it&apos;s priced
                            on its size. Size-based weight here is {fmtKg(volumetric)}
                            {" "}vs {fmtKg(actual)} actual.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={addBox}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add another box
          </Button>
        </div>

        {/* ── Summary ── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <div>
            <span className="text-muted-foreground">Declared value</span>{" "}
            <strong>{fmtMoney(totalValue)}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Boxes</span>{" "}
            <strong>{boxCount}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Chargeable weight</span>{" "}
            <strong>{fmtKg(chargeableWeight)}</strong>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="How chargeable weight works">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Carriers charge the greater of a box&apos;s real weight and its
                size-based (volumetric) weight. We work out size-based weight as
                length × width × height in cm ÷ 5000, take the higher of the two
                per box, and add them up. Your price is based on this number.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Shipment type ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Customs category</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="About the customs category">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                We pick this for you from the declared value. CSB-IV is only
                available under ₹25,000; at or above that we move to CSB-V
                automatically, and back down if you lower the value.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {SHIPMENT_TYPES.map((t) => {
              const disabled = t.value === "CSB4" && !csb4Allowed;
              const selected = data.shipmentType === t.value;
              return (
                <Tooltip key={t.value}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => selectType(t.value)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/40",
                        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <span className="text-sm font-medium">{t.title}</span>
                      <span className="mt-0.5 text-xs text-muted-foreground">{t.blurb}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    {disabled
                      ? `Not available at ₹${CSB4_MAX_VALUE.toLocaleString("en-IN")} or above. Use CSB-V or Commercial.`
                      : t.tip}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* ── Commercial invoice ── */}
        <div className="space-y-2">
          <Label>Commercial invoice</Label>
          <RadioGroup
            value={data.invoiceMode}
            onValueChange={(value) => onChange({ invoiceMode: value as "UPLOAD" | "GENERATE" })}
            className="grid gap-2 sm:grid-cols-2"
          >
            <label
              htmlFor="invoice-generate"
              className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
            >
              <RadioGroupItem value="GENERATE" id="invoice-generate" className="mt-0.5" />
              <div>
                <p className="text-sm font-medium">Generate it for me</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  We build the invoice and packing list from your boxes above.
                </p>
              </div>
            </label>
            <label
              htmlFor="invoice-upload"
              className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
            >
              <RadioGroupItem value="UPLOAD" id="invoice-upload" className="mt-0.5" />
              <div>
                <p className="text-sm font-medium">Upload my own</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  You already have a commercial invoice ready to attach.
                </p>
              </div>
            </label>
          </RadioGroup>

          {data.invoiceMode === "UPLOAD" && (
            <div className="space-y-2">
              <FileUploadField
                value={data.uploadedInvoice}
                onChange={(file) => onChange({ uploadedInvoice: file })}
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Please still fill the box details above. They drive pricing and
                KYC even when you attach your own invoice.
              </p>
            </div>
          )}
        </div>

        {/* ── Door pickup opt-in ── */}
        <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5">
          <Checkbox
            checked={data.pickupIncluded}
            onCheckedChange={(checked) => onChange({ pickupIncluded: checked === true })}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Pick up from my door</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              We collect the parcel from your pickup address and take it to the
              carrier&apos;s hub. A pickup charge is added at the rates step.
              Leave this off to drop the parcel at our hub yourself; our team
              shares the address.
            </p>
          </div>
        </label>

        {error && (
          <p className="text-sm text-destructive" aria-live="polite">
            {error}
          </p>
        )}
      </div>
    </TooltipProvider>
  );
}
