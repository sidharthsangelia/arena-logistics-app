"use client";

import { Plus, Trash2, Package } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { BookingFormData, PackageForm } from "@/types/booking.types";

interface Props {
  data: BookingFormData;

  onChange: (data: Partial<BookingFormData>) => void;
}

export default function PackagesStep({ data, onChange }: Props) {
  const addPackage = () => {
    const newPackage: PackageForm = {
      id: nanoid(),

      description: "",

      hsCode: "",

      quantity: 1,

      weightKg: 0,

      lengthCm: 0,
      widthCm: 0,
      heightCm: 0,

      declaredValue: 0,

      countryOfOrigin: "India",
    };

    onChange({
      packages: [...data.packages, newPackage],
    });
  };

  const updatePackage = (
    index: number,
    field: keyof PackageForm,
    value: unknown,
  ) => {
    const packages = [...data.packages];

    packages[index] = {
      ...packages[index],
      [field]: value,
    };

    onChange({
      packages,
    });
  };

  const removePackage = (index: number) => {
    onChange({
      packages: data.packages.filter((_, i) => i !== index),
    });
  };

  const totalWeight = data.packages.reduce(
    (sum, pkg) => sum + pkg.weightKg * pkg.quantity,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Package Details</h2>

        <p className="text-sm text-muted-foreground">
          Add every carton, parcel or box included in this shipment.
        </p>
      </div>

      {data.packages.length > 0 && (
        <div className="rounded-lg border p-4 bg-muted/30">
          <div className="flex justify-between">
            <span>Total Packages</span>

            <strong>{data.packages.length}</strong>
          </div>

          <div className="flex justify-between mt-2">
            <span>Total Weight</span>

            <strong>{totalWeight.toFixed(2)} kg</strong>
          </div>
        </div>
      )}

      {data.packages.map((pkg, index) => (
        <div key={pkg.id} className="rounded-lg border p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4" />

              <span className="font-medium">Package {index + 1}</span>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removePackage(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Product Description</Label>

            <Input
              value={pkg.description}
              onChange={(e) =>
                updatePackage(index, "description", e.target.value)
              }
              placeholder="Cotton T-Shirts"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>HSN Code</Label>

              <Input
                value={pkg.hsCode}
                onChange={(e) => updatePackage(index, "hsCode", e.target.value)}
              />
            </div>

            <div>
              <Label>Country Of Origin</Label>

              <Input
                value={pkg.countryOfOrigin}
                onChange={(e) =>
                  updatePackage(index, "countryOfOrigin", e.target.value)
                }
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Quantity</Label>

              <Input
                type="number"
                value={pkg.quantity}
                onChange={(e) =>
                  updatePackage(index, "quantity", Number(e.target.value))
                }
              />
            </div>

            <div>
              <Label>Weight (kg)</Label>

              <Input
                type="number"
                value={pkg.weightKg}
                onChange={(e) =>
                  updatePackage(index, "weightKg", Number(e.target.value))
                }
              />
            </div>

            <div>
              <Label>Declared Value</Label>

              <Input
                type="number"
                value={pkg.declaredValue}
                onChange={(e) =>
                  updatePackage(index, "declaredValue", Number(e.target.value))
                }
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label>Length (cm)</Label>

              <Input
                type="number"
                value={pkg.lengthCm}
                onChange={(e) =>
                  updatePackage(index, "lengthCm", Number(e.target.value))
                }
              />
            </div>

            <div>
              <Label>Width (cm)</Label>

              <Input
                type="number"
                value={pkg.widthCm}
                onChange={(e) =>
                  updatePackage(index, "widthCm", Number(e.target.value))
                }
              />
            </div>

            <div>
              <Label>Height (cm)</Label>

              <Input
                type="number"
                value={pkg.heightCm}
                onChange={(e) =>
                  updatePackage(index, "heightCm", Number(e.target.value))
                }
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addPackage}>
        <Plus className="mr-2 h-4 w-4" />
        Add Package
      </Button>
    </div>
  );
}
