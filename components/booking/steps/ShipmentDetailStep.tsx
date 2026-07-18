"use client";

import { useEffect } from "react";
import { Plus, Trash2, Box, Info, PackageOpen, Truck } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
  totalActualWeight,
  totalBoxCount,
  boxDeclaredValue,
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
    blurb: "Personal / gift · under ₹25,000",
    tip: "Courier Shipping Bill IV — for personal or low-value exports under ₹25,000. Lightest paperwork: just the sender's PAN and Aadhaar.",
  },
  {
    value: "CSB5",
    title: "CSB-V",
    blurb: "₹25,000 or more · needs IEC",
    tip: "Courier Shipping Bill V — for exports of ₹25,000 or more, or when you want export incentives. Requires GST and IEC in addition to PAN & Aadhaar.",
  },
  {
    value: "COMMERCIAL",
    title: "Commercial",
    blurb: "Business-to-business export",
    tip: "Full commercial export for B2B shipments. Requires company KYC — GST, IEC, LUT, and PAN of both the company and its founder.",
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
  const totalWeight = totalActualWeight(boxes);
  const boxCount = totalBoxCount(boxes);
  const csb4Allowed = isCsb4Allowed(totalValue);

  // Seed one starter box so the step never opens empty.
  useEffect(() => {
    if (boxes.length === 0) onChange({ boxes: [newBox()] });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enforce the CSB4 lock: once the total reaches ₹25,000 a CSB4 selection is
  // no longer valid, so bump it to CSB5. The user can still go up to Commercial.
  useEffect(() => {
    if (!csb4Allowed && data.shipmentType === "CSB4") {
      onChange({ shipmentType: "CSB5" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csb4Allowed, data.shipmentType]);

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Packages &amp; Cargo</h2>
        <p className="text-sm text-muted-foreground">
          Tell us what you&apos;re shipping. These details set your customs
          category, drive KYC, and price your shipment.
        </p>
      </div>

      {/* ── Shipment type ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label>Shipment type</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="About shipment types">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Auto-selected from your declared value — change it if needed. CSB-IV
                is only available while the total stays under ₹25,000.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {SHIPMENT_TYPES.map((t) => {
            const disabled = t.value === "CSB4" && !csb4Allowed;
            const selected = data.shipmentType === t.value;
            return (
              <TooltipProvider key={t.value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange({ shipmentType: t.value })}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-3 text-left transition-colors",
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
                      ? `CSB-IV isn't available at ₹${CSB4_MAX_VALUE.toLocaleString("en-IN")} or above. Use CSB-V or Commercial.`
                      : t.tip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </div>

      {/* ── Currency + totals ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={(v) => onChange({ currency: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Currency" />
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 self-end rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            Declared value <strong className="text-foreground">{fmtMoney(totalValue)}</strong>
          </span>
          <span className="text-muted-foreground">
            Boxes <strong className="text-foreground">{boxCount}</strong>
          </span>
          <span className="text-muted-foreground">
            Weight <strong className="text-foreground">{totalWeight.toFixed(2)} kg</strong>
          </span>
        </div>
      </div>

      {/* ── Boxes ── */}
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Shipping several identical boxes? Just increase <strong>Number of boxes</strong>.
            Add a new box only if its size, weight, <em>or</em> contents are different.
          </p>
        </div>

        {boxes.map((box, bi) => (
          <div key={box.id} className="rounded-lg border p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4" />
                <span className="font-medium">Box {bi + 1}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={boxes.length === 1}
                onClick={() => removeBox(bi)}
                aria-label="Remove box"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Box dimensions / weight / count */}
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
                  <Label className="text-xs">{label}</Label>
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
                <Label className="text-xs">No. of boxes</Label>
                <Input
                  type="number"
                  min={1}
                  value={box.quantity || ""}
                  onChange={(e) => patchBox(bi, { quantity: Number(e.target.value) })}
                />
              </div>
            </div>

            <Separator />

            {/* Contents */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <PackageOpen className="h-4 w-4" />
                Items in this box
              </div>

              {/* Column headers (sm+) */}
              <div className="hidden gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_120px_80px_120px_32px]">
                <span>Description</span>
                <span>HSN code</span>
                <span>Qty</span>
                <span>Value / unit</span>
                <span />
              </div>

              {box.contents.map((item, ii) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_80px_120px_32px] sm:items-center"
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
                    disabled={box.contents.length === 1}
                    onClick={() => removeItem(bi, ii)}
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => addItem(bi)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add item
                </Button>
                <span className="text-xs text-muted-foreground">
                  Box value: {fmtMoney(boxDeclaredValue(box))}
                  {box.quantity > 1 && ` × ${box.quantity} = ${fmtMoney(boxDeclaredValue(box) * box.quantity)}`}
                </span>
              </div>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" onClick={addBox}>
          <Plus className="mr-2 h-4 w-4" />
          Add another box
        </Button>
      </div>

      {/* ── Commercial invoice ── */}
      <div className="space-y-3">
        <Label>Commercial invoice</Label>
        <RadioGroup
          value={data.invoiceMode}
          onValueChange={(value) => onChange({ invoiceMode: value as "UPLOAD" | "GENERATE" })}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label
            htmlFor="invoice-generate"
            className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem value="GENERATE" id="invoice-generate" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Generate from item details</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                We build the invoice and packing list from the boxes above.
              </p>
            </div>
          </label>
          <label
            htmlFor="invoice-upload"
            className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem value="UPLOAD" id="invoice-upload" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Upload my own invoice</p>
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
              We still need the box details above — they drive rating and KYC even
              when you attach your own invoice.
            </p>
          </div>
        )}
      </div>

      {/* ── Door pickup opt-in ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <Label>Door pickup</Label>
        </div>
        <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
          <Checkbox
            checked={data.pickupIncluded}
            onCheckedChange={(checked) => onChange({ pickupIncluded: checked === true })}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Pick up from my door</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              We collect the parcel from your pickup address and take it to the
              carrier&apos;s hub — a pickup charge is added at the rates step. Leave
              this off to drop the parcel at our hub yourself (our team shares the
              address).
            </p>
          </div>
        </label>
      </div>

      {error && (
        <p className="text-sm text-destructive" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
