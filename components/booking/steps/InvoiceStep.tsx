"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { BookingFormData } from "@/types/booking.types";
import { FileUploadField } from "../FileUploadField";
 

interface Props {
  data: BookingFormData;

  onChange: (data: Partial<BookingFormData>) => void;
}

export default function InvoiceStep({ data, onChange }: Props) {
  const addItem = () => {
    onChange({
      generatedInvoice: {
        ...data.generatedInvoice,
        items: [
          ...data.generatedInvoice.items,
          {
            description: "",
            hsCode: "",
            countryOfOrigin: "India",
            quantity: 1,
            unitValue: 0,
            currency: "INR",
          },
        ],
      },
    });
  };

  const updateItem = (index: number, field: string, value: unknown) => {
    const items = [...data.generatedInvoice.items];

    items[index] = {
      ...items[index],
      [field]: value,
    };

    onChange({
      generatedInvoice: {
        ...data.generatedInvoice,
        items,
      },
    });
  };

  const removeItem = (index: number) => {
    onChange({
      generatedInvoice: {
        ...data.generatedInvoice,
        items: data.generatedInvoice.items.filter((_, i) => i !== index),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Commercial Invoice</h2>

        <p className="text-sm text-muted-foreground">
          Either upload a shipper invoice or generate one inside the platform.
        </p>
      </div>

      <RadioGroup
        value={data.invoiceMode}
        onValueChange={(value) =>
          onChange({
            invoiceMode: value as "UPLOAD" | "GENERATE",
          })
        }
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="UPLOAD" id="upload" />

          <Label htmlFor="upload">Upload Existing Invoice</Label>
        </div>

        <div className="flex items-center gap-2">
          <RadioGroupItem value="GENERATE" id="generate" />

          <Label htmlFor="generate">Generate Invoice</Label>
        </div>
      </RadioGroup>

      {data.invoiceMode === "UPLOAD" && (
        <FileUploadField
          value={data.uploadedInvoice}
          onChange={(file) =>
            onChange({
              uploadedInvoice: file,
            })
          }
        />
      )}

      {data.invoiceMode === "GENERATE" && (
        <div className="space-y-4">
          {data.generatedInvoice.items.map((item, index) => (
            <div key={index} className="rounded-lg border p-4 space-y-4">
              <div className="flex justify-between">
                <h4>Item {index + 1}</h4>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <Input
                placeholder="Product description"
                value={item.description}
                onChange={(e) =>
                  updateItem(index, "description", e.target.value)
                }
              />

              <Input
                placeholder="HSN Code"
                value={item.hsCode}
                onChange={(e) => updateItem(index, "hsCode", e.target.value)}
              />

              <Input
                placeholder="Country of Origin"
                value={item.countryOfOrigin}
                onChange={(e) =>
                  updateItem(index, "countryOfOrigin", e.target.value)
                }
              />

              <Input
                type="number"
                placeholder="Quantity"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(index, "quantity", Number(e.target.value))
                }
              />

              <Input
                type="number"
                placeholder="Unit Value"
                value={item.unitValue}
                onChange={(e) =>
                  updateItem(index, "unitValue", Number(e.target.value))
                }
              />
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addItem}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
      )}
    </div>
  );
}
