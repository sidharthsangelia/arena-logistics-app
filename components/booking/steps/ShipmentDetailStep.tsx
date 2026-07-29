"use client";

import { useEffect, useRef } from "react";
import { Info } from "lucide-react";

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
  ShipmentTypeValue,
} from "@/types/booking.types";
import {
  totalDeclaredValue,
  isCsb4Allowed,
  CSB4_MAX_VALUE,
} from "@/lib/booking/cargo";
import { BoxEditor } from "../BoxEditor";
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

export default function ShipmentDetailsStep({ data, onChange, error }: Props) {
  const boxes = data.boxes ?? [];
  const currency = data.currency;

  const totalValue = totalDeclaredValue(boxes);
  const csb4Allowed = isCsb4Allowed(totalValue);

  // Remembers that WE moved CSB-IV → CSB-V because the value crossed ₹25,000,
  // so we can move it back down if the value is later reduced. A manual pick
  // (via selectType) clears this, so we never undo the user's own choice.
  const autoBumpedRef = useRef(false);

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

        <BoxEditor
          boxes={boxes}
          currency={currency}
          onChange={(next) => onChange({ boxes: next })}
          hsCodeLabel="HS code"
        />

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
