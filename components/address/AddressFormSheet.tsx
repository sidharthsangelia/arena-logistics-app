"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { cn } from "@/lib/utils";

import { CountryCombobox } from "@/components/booking/CountryComboBox";
import { usePostalLookup } from "@/hooks/usePostalLookup";
import type { AddressKind } from "@/generated/prisma";
import type { AddressSummary, Party } from "@/types/booking";
import { createAddress, updateAddress } from "@/actions/book/addresses";

const KIND_OPTIONS: { value: AddressKind; label: string; hint: string }[] = [
  { value: "PICKUP", label: "Pickup", hint: "Where parcels are collected from" },
  { value: "DELIVERY", label: "Delivery", hint: "Where parcels are sent to" },
  { value: "BILLING", label: "Billing", hint: "Where the invoice is addressed" },
  { value: "OTHER", label: "Other", hint: "Warehouse, office or anything else" },
];

type FormState = {
  label: string;
  kind: AddressKind;
  contactName: string;
  phone: string;
  email: string;
  country: string;
  postalCode: string;
  city: string;
  state: string;
  line1: string;
  line2: string;
  isDefault: boolean;
};

const EMPTY: FormState = {
  label: "",
  kind: "PICKUP",
  contactName: "",
  phone: "",
  email: "",
  country: "India",
  postalCode: "",
  city: "",
  state: "",
  line1: "",
  line2: "",
  isDefault: false,
};

function fromAddress(a: AddressSummary): FormState {
  return {
    label: a.label ?? "",
    kind: (a.kind as AddressKind) ?? "OTHER",
    contactName: a.contactName ?? "",
    phone: a.contactPhone ?? "",
    email: a.contactEmail ?? "",
    country: a.country ?? "India",
    postalCode: a.postalCode ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    isDefault: a.isDefault ?? false,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: Party;
  /** Address to edit, or null to add a new one. */
  editing: AddressSummary | null;
  /** Pre-selected kind for a fresh entry (e.g. the active filter). */
  defaultKind?: AddressKind;
  onSaved: () => void;
}

export function AddressFormSheet({
  open,
  onOpenChange,
  party,
  editing,
  defaultKind,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const forClient = party.partyType === "CLIENT";

  // Reset the form each time the sheet opens for a new target.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(editing ? fromAddress(editing) : { ...EMPTY, kind: defaultKind ?? "PICKUP" });
  }, [open, editing, defaultKind]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const lookupState = usePostalLookup(form.country, form.postalCode, (city, state) => {
    setForm((f) => ({ ...f, city, state }));
  });

  const handleSubmit = async () => {
    const input = {
      label: form.label.trim(),
      contactName: form.contactName.trim(),
      contactPhone: form.phone.trim(),
      contactEmail: form.email.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      postalCode: form.postalCode.trim(),
      isDefault: form.isDefault,
    };

    setSaving(true);
    setErrors({});
    try {
      const res = editing
        ? await updateAddress(editing.id, form.kind, input)
        : await createAddress(party, form.kind, input);

      if (res.ok) {
        toast.success(editing ? "Address updated" : "Address saved");
        onOpenChange(false);
        onSaved();
      } else {
        if (res.fieldErrors) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.fieldErrors)) {
            if (v?.[0]) flat[k] = v[0];
          }
          setErrors(flat);
        }
        toast.error(res.error || "Please check the fields and try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3 shrink-0" />
        {errors[key]}
      </p>
    ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit address" : "Add an address"}</SheetTitle>
          <SheetDescription>
            {forClient
              ? "Save it to this client's book so booking for them takes one tap."
              : "Save it once and reuse it in one tap every time you book."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nickname</Label>
              <Input
                value={form.label}
                onChange={(e) => set("label", e.target.value)}
                placeholder="Head office, Warehouse 2"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Used for</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v as AddressKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Contact name</Label>
              <Input
                value={form.contactName}
                onChange={(e) => set("contactName", e.target.value)}
                placeholder="Jane Smith"
              />
              {err("contactName")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+91 98765 43210"
              />
              {err("contactPhone")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Email <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane@acme.com"
            />
            {err("contactEmail")}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            <CountryCombobox
              value={form.country}
              label={null}
              onChange={(name) =>
                setForm((f) => ({ ...f, country: name, postalCode: "", city: "", state: "" }))
              }
              error={errors.country}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Postal / ZIP</Label>
              <div className="relative">
                <Input
                  value={form.postalCode}
                  onChange={(e) => set("postalCode", e.target.value)}
                  placeholder="Postal code"
                  className="pr-8"
                />
                {lookupState === "loading" && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {err("postalCode")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Mumbai"
                className={cn(errors.city && "border-destructive")}
              />
              {err("city")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                placeholder="Maharashtra"
              />
              {err("state")}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Address line 1</Label>
            <Input
              value={form.line1}
              onChange={(e) => set("line1", e.target.value)}
              placeholder="123 Main Street, Apt 4B"
              className={cn(errors.line1 && "border-destructive")}
            />
            {err("line1")}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Address line 2 <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              value={form.line2}
              onChange={(e) => set("line2", e.target.value)}
              placeholder="Building, floor or landmark"
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={form.isDefault}
              onCheckedChange={(c) => set("isDefault", c === true)}
              className="mt-0.5"
            />
            <span>
              Make this my primary{" "}
              {KIND_OPTIONS.find((k) => k.value === form.kind)?.label.toLowerCase() ?? ""}{" "}
              address
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Pre-filled first when you book. Each type keeps its own primary.
              </span>
            </span>
          </label>
        </div>

        <SheetFooter className="flex-row justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {editing ? "Save changes" : "Save address"}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
