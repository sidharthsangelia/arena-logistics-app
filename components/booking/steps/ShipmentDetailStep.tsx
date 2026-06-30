"use client";

import { Plus, Trash2, Package, Info } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { BookingFormData, ShipmentItem } from "@/types/booking.types";
import { FileUploadField } from "../FileUploadField";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

interface Props {
  data: BookingFormData;
  onChange: (data: Partial<BookingFormData>) => void;
  error?: string;
}

function newItem(): ShipmentItem {
  return {
    id: nanoid(),
    description: "",
    hsCode: "",
    countryOfOrigin: "India",
    quantity: 1,
    weightKg: 0,
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    unitValue: 0,
  };
}

export default function ShipmentDetailsStep({ data, onChange, error }: Props) {
  const items = data.items ?? [];

  const updateItem = (index: number, field: keyof ShipmentItem, value: unknown) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    onChange({ items: next });
  };

  const addItem = () => onChange({ items: [...items, newItem()] });
  const removeItem = (index: number) => onChange({ items: items.filter((_, i) => i !== index) });

  const totalWeight = items.reduce((s, it) => s + it.weightKg * it.quantity, 0);
  const totalValue = items.reduce((s, it) => s + it.unitValue * it.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Shipment Details</h2>
        <p className="text-sm text-muted-foreground">
          Add every item in this shipment — these details power both customs paperwork
          and your shipping rates, so weight and dimensions are needed either way.
        </p>
      </div>

      {/* Invoice mode */}
      <div className="space-y-3">
        <Label>Commercial Invoice</Label>
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
              <p className="text-xs text-muted-foreground mt-0.5">
                We'll build your commercial invoice from the items below.
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
              <p className="text-xs text-muted-foreground mt-0.5">
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
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              We still need declared value, weight and dimensions per item below — your
              uploaded invoice is used for customs, this drives KYC requirements and
              shipping rates.
            </p>
          </div>
        )}
      </div>

      {/* Shipment currency */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr,160px] gap-4 items-end">
        <div className="rounded-lg border bg-muted/30 px-4 py-3 flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Total declared value</span>
          <strong>
            {data.currency} {totalValue.toLocaleString("en-IN")}
          </strong>
        </div>
        <div className="space-y-1">
          <Label>Currency</Label>
          <Select value={data.currency} onValueChange={(v) => onChange({ currency: v })}>
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
      </div>

      {items.length > 0 && (
        <div className="rounded-lg border p-4 bg-muted/30 flex justify-between text-sm">
          <span>Total Items</span>
          <strong>{items.length}</strong>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-lg border p-4 bg-muted/30 flex justify-between text-sm">
          <span>Total Weight</span>
          <strong>{totalWeight.toFixed(2)} kg</strong>
        </div>
      )}

      {/* Item cards */}
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-lg border p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span className="font-medium">Item {index + 1}</span>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Product Description</Label>
              <Input
                value={item.description}
                onChange={(e) => updateItem(index, "description", e.target.value)}
                placeholder="Cotton T-Shirts"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>HSN Code</Label>
                <Input
                  value={item.hsCode}
                  onChange={(e) => updateItem(index, "hsCode", e.target.value)}
                  placeholder="6109.10"
                />
              </div>
              <div className="space-y-2">
                <Label>Country of Origin</Label>
                <Input
                  value={item.countryOfOrigin}
                  onChange={(e) => updateItem(index, "countryOfOrigin", e.target.value)}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Weight per unit (kg)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.weightKg}
                  onChange={(e) => updateItem(index, "weightKg", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Value ({data.currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={item.unitValue}
                  onChange={(e) => updateItem(index, "unitValue", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Length (cm)</Label>
                <Input
                  type="number"
                  value={item.lengthCm}
                  onChange={(e) => updateItem(index, "lengthCm", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Width (cm)</Label>
                <Input
                  type="number"
                  value={item.widthCm}
                  onChange={(e) => updateItem(index, "widthCm", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Height (cm)</Label>
                <Input
                  type="number"
                  value={item.heightCm}
                  onChange={(e) => updateItem(index, "heightCm", Number(e.target.value))}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-right">
              Line total: {data.currency} {(item.unitValue * item.quantity).toLocaleString("en-IN")}
            </p>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addItem}>
        <Plus className="mr-2 h-4 w-4" />
        Add Item
      </Button>

      {error && (
        <p className="text-sm text-destructive" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}