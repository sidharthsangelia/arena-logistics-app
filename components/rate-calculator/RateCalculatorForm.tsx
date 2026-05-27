"use client";

import { useState } from "react";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, PackageSearch } from "lucide-react";
import { RateRequest, AVAILABLE_VENDORS, VendorId } from "@/lib/types";

//      Props                                                                                                                                           

interface Props {
  onSubmit: (data: RateRequest, vendors: VendorId[]) => void;
  loading: boolean;
}

//      Country list                                                                                                                             
// Tuples of [full name used by Aramex, ISO 3166-1 alpha-2 code]
const COUNTRY_OPTIONS: { label: string; code: string; fullName: string }[] = [
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
];

//      Default values                                                                                                                         

const defaultValues: RateRequest = {
  origin: {
    city: "New Delhi",
    pincode: "110059",
    countryCode: "IN",
    line1: "123 Connaught Place",
  },
  destination: {
    city: "Sydney",
    pincode: "7470",
    countryCode: "AU",
    country: "AUSTRALIA",
  },
  shipment: {
    weight: 1,
    quantity: 1,
    dimensions: { length: 30, width: 20, height: 10, unit: "cm" },
    description: "Electronics",
  },
};

//      Component                                                                                                                                   

export default function RateCalculatorForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<RateRequest>(defaultValues);

  // All vendors selected by default
  const [selectedVendors, setSelectedVendors] = useState<VendorId[]>(
    AVAILABLE_VENDORS.map((v) => v.id)
  );

  //      Field helpers                                                                                                                       

  const setOrigin = (field: keyof RateRequest["origin"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, origin: { ...p.origin, [field]: e.target.value } }));

  const setDestination = (field: keyof RateRequest["destination"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, destination: { ...p.destination, [field]: e.target.value } }));

  const setDestinationCountry = (countryCode: string) => {
    const opt = COUNTRY_OPTIONS.find((c) => c.code === countryCode);
    setForm((p) => ({
      ...p,
      destination: {
        ...p.destination,
        countryCode,
        country: opt?.fullName ?? countryCode,
      },
    }));
  };

  const setShipment =
    (field: keyof Omit<RateRequest["shipment"], "dimensions">) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = field === "description" ? e.target.value : Number(e.target.value);
      setForm((p) => ({ ...p, shipment: { ...p.shipment, [field]: value } }));
    };

  const setDimension =
    (field: keyof RateRequest["shipment"]["dimensions"]) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({
        ...p,
        shipment: {
          ...p.shipment,
          dimensions: { ...p.shipment.dimensions, [field]: Number(e.target.value) },
        },
      }));

  const setDimensionUnit = (unit: "cm" | "in") =>
    setForm((p) => ({
      ...p,
      shipment: { ...p.shipment, dimensions: { ...p.shipment.dimensions, unit } },
    }));

  //      Vendor toggle                                                                                                                       

  const toggleVendor = (id: VendorId, checked: boolean) =>
    setSelectedVendors((prev) =>
      checked ? [...prev, id] : prev.filter((v) => v !== id)
    );

  //      Submit                                                                                                                                     

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form, selectedVendors);
  };

  //      Render                                                                                                                                     

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <PackageSearch className="h-5 w-5 text-blue-600" />
          Shipment Details
        </CardTitle>
        <CardDescription>
          Fill in the shipment details to get live rates from all carriers
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">

          {/*      Origin                                                                                                                */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Origin
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="origin_city">City</Label>
                <Input
                  id="origin_city"
                  value={form.origin.city}
                  onChange={setOrigin("city")}
                  placeholder="e.g. New Delhi"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin_pincode">Pincode / ZIP</Label>
                <Input
                  id="origin_pincode"
                  value={form.origin.pincode}
                  onChange={setOrigin("pincode")}
                  placeholder="e.g. 110059"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="origin_countryCode">Country Code</Label>
                <Input
                  id="origin_countryCode"
                  value={form.origin.countryCode}
                  onChange={setOrigin("countryCode")}
                  placeholder="IN"
                  maxLength={2}
                  className="uppercase"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="origin_line1">Address Line 1 (optional)</Label>
                <Input
                  id="origin_line1"
                  value={form.origin.line1 ?? ""}
                  onChange={setOrigin("line1")}
                  placeholder="e.g. 123 Connaught Place"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/*      Destination                                                                                                      */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Destination
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="dest_city">City</Label>
                <Input
                  id="dest_city"
                  value={form.destination.city}
                  onChange={setDestination("city")}
                  placeholder="e.g. Sydney"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dest_pincode">Pincode / ZIP</Label>
                <Input
                  id="dest_pincode"
                  value={form.destination.pincode}
                  onChange={setDestination("pincode")}
                  placeholder="e.g. 7470"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Destination Country</Label>
              <Select
                value={form.destination.countryCode}
                onValueChange={setDestinationCountry}
              >
                <SelectTrigger>
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
              {/* countryCode shown read-only for transparency */}
              <p className="text-xs text-slate-400">
                Country code: <span className="font-mono">{form.destination.countryCode}</span>
                {form.destination.country && (
                  <> · Full name: <span className="font-mono">{form.destination.country}</span></>
                )}
              </p>
            </div>
          </section>

          <Separator />

          {/*      Shipment                                                                                                            */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Package
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.shipment.weight}
                  onChange={setShipment("weight")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  value={form.shipment.quantity}
                  onChange={setShipment("quantity")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Contents</Label>
                <Input
                  id="description"
                  value={form.shipment.description}
                  onChange={setShipment("description")}
                  placeholder="e.g. Electronics"
                  required
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Dimensions</Label>
                <Select
                  value={form.shipment.dimensions.unit}
                  onValueChange={(v) => setDimensionUnit(v as "cm" | "in")}
                >
                  <SelectTrigger className="w-20 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cm">cm</SelectItem>
                    <SelectItem value="in">in</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dim_length" className="text-xs text-slate-500">
                    Length ({form.shipment.dimensions.unit})
                  </Label>
                  <Input
                    id="dim_length"
                    type="number"
                    min={1}
                    value={form.shipment.dimensions.length}
                    onChange={setDimension("length")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dim_width" className="text-xs text-slate-500">
                    Width ({form.shipment.dimensions.unit})
                  </Label>
                  <Input
                    id="dim_width"
                    type="number"
                    min={1}
                    value={form.shipment.dimensions.width}
                    onChange={setDimension("width")}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dim_height" className="text-xs text-slate-500">
                    Height ({form.shipment.dimensions.unit})
                  </Label>
                  <Input
                    id="dim_height"
                    type="number"
                    min={1}
                    value={form.shipment.dimensions.height}
                    onChange={setDimension("height")}
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/*      Vendor filter                                                                                                    */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Carriers to Query
            </h3>
            <div className="flex flex-wrap gap-5">
              {AVAILABLE_VENDORS.map((vendor) => (
                <div key={vendor.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`vendor_${vendor.id}`}
                    checked={selectedVendors.includes(vendor.id)}
                    onCheckedChange={(checked) =>
                      toggleVendor(vendor.id, Boolean(checked))
                    }
                  />
                  <Label
                    htmlFor={`vendor_${vendor.id}`}
                    className="font-normal cursor-pointer"
                  >
                    {vendor.label}
                  </Label>
                </div>
              ))}
            </div>
            {selectedVendors.length === 0 && (
              <p className="text-xs text-amber-600">
                Select at least one carrier to get rates.
              </p>
            )}
          </section>

          {/*      Submit                                                                                                                  */}
          <Button
            type="submit"
            className="w-full"
            disabled={loading || selectedVendors.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching Rates…
              </>
            ) : (
              "Get Rates"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}