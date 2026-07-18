"use client";

import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  FieldErrors,
  Path,
} from "react-hook-form";
import { Check, Loader2, MapPin, AlertCircle } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { BookingFormData } from "@/types/booking.types";
 
import { usePostalLookup } from "@/hooks/usePostalLookup";
import { CountryCombobox } from "./CountryComboBox";

// ---------------------------------------------------------------------------
// AddressFields
//
// Renders contact details + a full address block (country → postal code →
// city/state autofill → address lines) for either "consignor" or
// "consignee". Both share the exact same BookingFormData shape
// (ConsignorForm), so one component drives both steps — previously the
// sender form had no country combobox and no postal autofill at all.
// ---------------------------------------------------------------------------

type AddressPrefix = "consignor" | "consignee" | "pickup" | "billing";

interface AddressFieldsProps {
  prefix: AddressPrefix;
  register: UseFormRegister<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  countryLabel?: string;
  addressLabel?: string;
}

// Single, documented cast point for the dynamic "consignor" | "consignee"
// field prefix — react-hook-form's Path<T> can't infer template-literal
// prefixes generically, but consignor/consignee share an identical shape.
function fieldPath(prefix: AddressPrefix, key: string): Path<BookingFormData> {
  return `${prefix}.${key}` as Path<BookingFormData>;
}

export function AddressFields({
  prefix,
  register,
  watch,
  setValue,
  errors,
  countryLabel = "Country",
  addressLabel = "Address",
}: AddressFieldsProps) {
  const country = (watch(fieldPath(prefix, "country")) as string) ?? "";
  const postalCode = (watch(fieldPath(prefix, "postalCode")) as string) ?? "";

  const lookupState = usePostalLookup(country, postalCode, (city, state) => {
    setValue(fieldPath(prefix, "city"), city, { shouldValidate: true });
    setValue(fieldPath(prefix, "state"), state, { shouldValidate: true });
  });

  const e = (errors as any)[prefix] ?? {};

  return (
    <div className="space-y-6">
      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>
            Contact Name <span className="text-destructive">*</span>
          </Label>
          <Input {...register(fieldPath(prefix, "contactName"))} placeholder="Jane Smith" />
          {e?.contactName && (
            <p className="text-xs text-destructive">{e.contactName.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Company Name</Label>
          <Input {...register(fieldPath(prefix, "companyName"))} placeholder="Acme Corp" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            type="email"
            {...register(fieldPath(prefix, "email"))}
            placeholder="jane@acme.com"
          />
          {e?.email && <p className="text-xs text-destructive">{e.email.message}</p>}
        </div>

        <div className="space-y-1">
          <Label>
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input {...register(fieldPath(prefix, "phone"))} placeholder="+91 98765 43210" />
          {e?.phone && <p className="text-xs text-destructive">{e.phone.message}</p>}
        </div>
      </div>

      {/* Address */}
      <div className="border-t pt-5 space-y-4">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          {addressLabel}
        </p>

        <CountryCombobox
          value={country}
          label={countryLabel}
          onChange={(name) => {
            setValue(fieldPath(prefix, "country"), name, { shouldValidate: true });
            // Reset dependent fields so a stale city/state can't survive a country change.
            setValue(fieldPath(prefix, "postalCode"), "");
            setValue(fieldPath(prefix, "city"), "");
            setValue(fieldPath(prefix, "state"), "");
          }}
          error={e?.country?.message}
        />

        <div className="space-y-1">
          <Label>
            Postal / ZIP Code <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              {...register(fieldPath(prefix, "postalCode"))}
              placeholder="Enter postal code…"
              className="pr-8"
            />
            {lookupState === "loading" && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <p aria-live="polite">
            {lookupState === "found" && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                City and state auto-filled. Review and correct if needed.
              </span>
            )}
            {lookupState === "not_found" && postalCode.trim().length >= 3 && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                Postal code not found. Please fill city and state manually.
              </span>
            )}
          </p>
          {e?.postalCode && (
            <p className="text-xs text-destructive">{e.postalCode.message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>
              City <span className="text-destructive">*</span>
            </Label>
            <Input
              {...register(fieldPath(prefix, "city"))}
              placeholder={lookupState === "loading" ? "Looking up…" : "e.g. Mumbai"}
              className={cn(e?.city && "border-destructive")}
            />
            {e?.city && <p className="text-xs text-destructive">{e.city.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>
              State / Province <span className="text-destructive">*</span>
            </Label>
            <Input
              {...register(fieldPath(prefix, "state"))}
              placeholder={lookupState === "loading" ? "Looking up…" : "e.g. Maharashtra"}
              className={cn(e?.state && "border-destructive")}
            />
            {e?.state && <p className="text-xs text-destructive">{e.state.message}</p>}
          </div>
        </div>
      </div>

      {/* Street address */}
      <div className="space-y-4">
        <div className="space-y-1">
          <Label>
            Address Line 1 <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register(fieldPath(prefix, "addressLine1"))}
            placeholder="123 Main Street, Apt 4B"
            className={cn(e?.addressLine1 && "border-destructive")}
          />
          {e?.addressLine1 && (
            <p className="text-xs text-destructive">{e.addressLine1.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Address Line 2</Label>
          <Input
            {...register(fieldPath(prefix, "addressLine2"))}
            placeholder="Building name, floor, landmark (optional)"
          />
        </div>
      </div>
    </div>
  );
}