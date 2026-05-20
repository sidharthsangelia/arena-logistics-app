"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, PackageSearch } from "lucide-react";
import { RateRequest } from "@/lib/types";

interface Props {
  onSubmit: (data: RateRequest) => void;
  loading: boolean;
}

const COUNTRIES = [
  "AUSTRALIA", "UNITED STATES", "UNITED KINGDOM", "CANADA", "GERMANY",
  "FRANCE", "SINGAPORE", "UAE", "JAPAN", "NEW ZEALAND",
];

const defaultValues: RateRequest = {
  user_name: "sgate",
  password: "123456",
  booking_type: 1,
  origin_pincode: "110059",
  destination_pincode: "7470",
  destination_country: "AUSTRALIA",
  shipment_type: 1,
  weight: 1,
  quantity: 1,
  length: 5,
};

export default function RateCalculatorForm({ onSubmit, loading }: Props) {
  const [form, setForm] = useState<RateRequest>(defaultValues);

  const set = (field: keyof RateRequest) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = ["weight", "quantity", "length"].includes(field)
      ? Number(e.target.value)
      : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <PackageSearch className="h-5 w-5 text-blue-600" />
          Shipment Details
        </CardTitle>
        <CardDescription>Fill in the shipment info to get live carrier rates</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Credentials Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="user_name">Username</Label>
              <Input id="user_name" value={form.user_name} onChange={set("user_name")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={form.password} onChange={set("password")} required />
            </div>
          </div>

          {/* Pincodes Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="origin_pincode">Origin Pincode</Label>
              <Input id="origin_pincode" value={form.origin_pincode} onChange={set("origin_pincode")} placeholder="e.g. 110059" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destination_pincode">Destination Pincode</Label>
              <Input id="destination_pincode" value={form.destination_pincode} onChange={set("destination_pincode")} placeholder="e.g. 7470" required />
            </div>
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label>Destination Country</Label>
            <Select
              value={form.destination_country}
              onValueChange={(v) => setForm((p) => ({ ...p, destination_country: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Types Row */}
          <div className="grid grid-cols-2 gap-4">
           
            <div className="space-y-1.5">
              <Label>Shipment Type</Label>
              <Select
                value={String(form.shipment_type)}
                onValueChange={(v) => setForm((p) => ({ ...p, shipment_type: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Documents </SelectItem>
                  <SelectItem value="2">Non-Documents </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Package Details Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" type="number" min={0.1} step={0.1} value={form.weight} onChange={set("weight")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" type="number" min={1} value={form.quantity} onChange={set("quantity")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="length">Length (cm)</Label>
              <Input id="length" type="number" min={1} value={form.length} onChange={set("length")} required />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching Rates...</>
            ) : (
              "Get Rates"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}