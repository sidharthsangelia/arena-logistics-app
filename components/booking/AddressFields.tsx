"use client";

import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  FieldErrors,
  Path,
} from "react-hook-form";
import { Check, Loader2, AlertCircle } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { BookingFormData } from "@/types/booking.types";

import { usePostalLookup } from "@/hooks/usePostalLookup";
import { CountryCombobox } from "./CountryComboBox";

// ---------------------------------------------------------------------------
// AddressFields
//
// One compact contact + address block shared by sender, pickup, delivery and
// billing. Layout is intentionally dense: two-up contact rows, then a single
// postal / city / state row (postal drives the city + state autofill), then
// the street lines. Required fields carry no marker; the few optional ones are
// labelled "(optional)" so the form reads light instead of a wall of red stars.
// ---------------------------------------------------------------------------

type AddressPrefix = "consignor" | "consignee" | "pickup" | "billing";

interface AddressFieldsProps {
  prefix: AddressPrefix;
  register: UseFormRegister<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  countryLabel?: string;
}

// Single, documented cast point for the dynamic field prefix — react-hook-form's
// Path<T> can't infer template-literal prefixes generically, but all four
// address blocks share an identical shape.
function fieldPath(prefix: AddressPrefix, key: string): Path<BookingFormData> {
  return `${prefix}.${key}` as Path<BookingFormData>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}

function OptionalHint() {
  return <span className="font-normal text-muted-foreground">(optional)</span>;
}

export function AddressFields({
  prefix,
  register,
  watch,
  setValue,
  errors,
  countryLabel = "Country",
}: AddressFieldsProps) {
  const country = (watch(fieldPath(prefix, "country")) as string) ?? "";
  const postalCode = (watch(fieldPath(prefix, "postalCode")) as string) ?? "";

  const lookupState = usePostalLookup(country, postalCode, (city, state) => {
    setValue(fieldPath(prefix, "city"), city, { shouldValidate: true });
    setValue(fieldPath(prefix, "state"), state, { shouldValidate: true });
  });

  const e = (errors as any)[prefix] ?? {};

  return (
    <div className="space-y-4">
      {/* Contact */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Contact name</Label>
          <Input {...register(fieldPath(prefix, "contactName"))} placeholder="Jane Smith" />
          <FieldError message={e?.contactName?.message} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input {...register(fieldPath(prefix, "phone"))} placeholder="+91 98765 43210" />
          <FieldError message={e?.phone?.message} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            {...register(fieldPath(prefix, "email"))}
            placeholder="jane@acme.com"
          />
          <FieldError message={e?.email?.message} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Company <OptionalHint />
          </Label>
          <Input {...register(fieldPath(prefix, "companyName"))} placeholder="Acme Corp" />
        </div>
      </div>

      {/* Country */}
      <div className="space-y-1.5">
        <Label className="text-xs">{countryLabel}</Label>
        <CountryCombobox
          value={country}
          label={null}
          onChange={(name) => {
            setValue(fieldPath(prefix, "country"), name, { shouldValidate: true });
            // Reset dependent fields so a stale city / state can't survive a country change.
            setValue(fieldPath(prefix, "postalCode"), "");
            setValue(fieldPath(prefix, "city"), "");
            setValue(fieldPath(prefix, "state"), "");
          }}
          error={e?.country?.message}
        />
      </div>

      {/* Postal drives city + state, so they sit together */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Postal / ZIP code</Label>
          <div className="relative">
            <Input
              {...register(fieldPath(prefix, "postalCode"))}
              placeholder="Postal code"
              className="pr-8"
            />
            {lookupState === "loading" && (
              <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <FieldError message={e?.postalCode?.message} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">City</Label>
          <Input
            {...register(fieldPath(prefix, "city"))}
            placeholder={lookupState === "loading" ? "Looking up" : "Mumbai"}
            className={cn(e?.city && "border-destructive")}
          />
          <FieldError message={e?.city?.message} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">State / Province</Label>
          <Input
            {...register(fieldPath(prefix, "state"))}
            placeholder={lookupState === "loading" ? "Looking up" : "Maharashtra"}
            className={cn(e?.state && "border-destructive")}
          />
          <FieldError message={e?.state?.message} />
        </div>
      </div>

      {/* Autofill status for the postal lookup */}
      <p aria-live="polite" className="-mt-1">
        {lookupState === "found" && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="h-3 w-3" />
            City and state filled in from the postal code. Edit if anything looks off.
          </span>
        )}
        {lookupState === "not_found" && postalCode.trim().length >= 3 && (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="h-3 w-3" />
            We couldn&apos;t match that postal code. Please type the city and state.
          </span>
        )}
      </p>

      {/* Street */}
      <div className="space-y-1.5">
        <Label className="text-xs">Address line 1</Label>
        <Input
          {...register(fieldPath(prefix, "addressLine1"))}
          placeholder="123 Main Street, Apt 4B"
          className={cn(e?.addressLine1 && "border-destructive")}
        />
        <FieldError message={e?.addressLine1?.message} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          Address line 2 <OptionalHint />
        </Label>
        <Input
          {...register(fieldPath(prefix, "addressLine2"))}
          placeholder="Building, floor or landmark"
        />
      </div>
    </div>
  );
}
