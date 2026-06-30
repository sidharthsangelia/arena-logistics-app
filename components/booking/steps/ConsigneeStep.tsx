"use client";

import { useState, useEffect, useRef } from "react";
import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  FieldErrors,
} from "react-hook-form";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  MapPin,
  AlertCircle,
} from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { BookingFormData } from "@/types/booking.types";
import { COUNTRIES } from "@/utils/data";

// ---------------------------------------------------------------------------
// Country Combobox
// ---------------------------------------------------------------------------

interface CountryComboboxProps {
  value: string; // stores the country name (not ISO code) to match ConsignorForm type
  onChange: (countryName: string) => void;
  error?: string;
}

function CountryCombobox({ value, onChange, error }: CountryComboboxProps) {
  const [open, setOpen] = useState(false);

  // Display the selected country name; the value stored IS the name
  const selected = COUNTRIES.find((c) => c.name === value) ?? null;

  return (
    <div className="space-y-1">
      <Label>
        Destination Country <span className="text-destructive">*</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">
                  {countryFlag(selected.code)}
                </span>
                {selected.name}
              </span>
            ) : (
              "Select country…"
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search country…" />
            <CommandList className="max-h-60">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={c.name}
                    onSelect={() => {
                      onChange(c.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === c.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="mr-2 text-base leading-none">
                      {countryFlag(c.code)}
                    </span>
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// Converts an ISO 3166-1 alpha-2 code to its emoji flag
function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

// ---------------------------------------------------------------------------
// Postal code lookup via Zippopotam.us (free, no API key)
// Supports: US, GB, CA, AU, DE, FR, NL, BE, AT, CH, SE, NO, DK, FI, PL,
//           PT, ES, IT, CZ, SK, HU, RO, BG, HR, SI, LT, LV, EE, JP, KR,
//           MX, BR, ZA, IN, SG, MY, TH, NZ, AR, … 60+ countries total.
// Returns null if the country/postcode combo isn't in their database.
// ---------------------------------------------------------------------------

const ISO_BY_NAME: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.name, c.code]),
);

interface ZipResult {
  city: string;
  state: string;
}

async function lookupPostalCode(
  countryName: string,
  postalCode: string,
): Promise<ZipResult | null> {
  const iso = ISO_BY_NAME[countryName];
  if (!iso || postalCode.length < 3) return null;

  try {
    const res = await fetch(
      `https://api.zippopotam.us/${iso.toLowerCase()}/${postalCode.trim()}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return {
      city: place["place name"] ?? "",
      state: place["state"] ?? place["state abbreviation"] ?? "",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main ConsigneeStep
// ---------------------------------------------------------------------------

interface Props {
  register: UseFormRegister<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
}

export default function ConsigneeStep({
  register,
  watch,
  setValue,
  errors,
}: Props) {
  const country = watch("consignee.country") ?? "";
  const postalCode = watch("consignee.postalCode") ?? "";

  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "not_found"
  >("idle");

  // Debounce postal code → city/state lookup
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't attempt lookup unless country is set and postal code is reasonable
    if (!country || postalCode.length < 3) {
      setLookupState("idle");
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    setLookupState("loading");

    debounceRef.current = setTimeout(async () => {
      const result = await lookupPostalCode(country, postalCode);
      if (result) {
        setValue("consignee.city", result.city, { shouldValidate: true });
        setValue("consignee.state", result.state, { shouldValidate: true });
        setLookupState("found");
      } else {
        setLookupState("not_found");
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [country, postalCode, setValue]);

  const e = errors.consignee as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <CardTitle>Receiver Details</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Who is receiving this shipment? Enter accurate details, errors here
          can delay customs clearance.
        </p>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>
            Contact Name <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register("consignee.contactName")}
            placeholder="Jane Smith"
          />
          {e?.contactName && (
            <p className="text-xs text-destructive">{e.contactName.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Company Name</Label>
          <Input
            {...register("consignee.companyName")}
            placeholder="Acme Corp"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>
            Email <span className="text-destructive">*</span>
          </Label>
          <Input
            type="email"
            {...register("consignee.email")}
            placeholder="jane@acme.com"
          />
          {e?.email && (
            <p className="text-xs text-destructive">{e.email.message}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>
            Phone <span className="text-destructive">*</span>
          </Label>
          <Input
            {...register("consignee.phone")}
            placeholder="+1 555 000 0000"
          />
          {e?.phone && (
            <p className="text-xs text-destructive">{e.phone.message}</p>
          )}
        </div>
      </div>

      {/* ── Address section ─────────────────────────────────────────────── */}
      <div className="border-t pt-5 space-y-4">
        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary" />
          Delivery Address
        </p>

        {/* Step 1: Country */}
        <CountryCombobox
          value={country}
          onChange={(name) => {
            setValue("consignee.country", name, { shouldValidate: true });
            // Reset postal/city/state when country changes
            setValue("consignee.postalCode", "");
            setValue("consignee.city", "");
            setValue("consignee.state", "");
            setLookupState("idle");
          }}
          error={e?.country?.message}
        />

        {/* Step 2: Postal code — only shown once country is selected */}
        {country && (
          <div className="space-y-1">
            <Label>
              Postal / ZIP Code <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                {...register("consignee.postalCode")}
                placeholder="Enter postal code…"
                className="pr-8"
              />
              {lookupState === "loading" && (
                <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Lookup feedback */}
            {lookupState === "found" && (
              <p className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                City and state auto-filled. Review and correct if needed.
              </p>
            )}
            {lookupState === "not_found" && postalCode.length >= 3 && (
              <p className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                Postal code not found in our database. Please fill city and
                state manually.
              </p>
            )}
            {e?.postalCode && (
              <p className="text-xs text-destructive">{e.postalCode.message}</p>
            )}
          </div>
        )}

        {/* Step 3: City + State — auto-filled but editable */}
        {country && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>
                City <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("consignee.city")}
                placeholder={
                  lookupState === "loading" ? "Looking up…" : "e.g. New York"
                }
              />
              {e?.city && (
                <p className="text-xs text-destructive">{e.city.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>
                State / Province <span className="text-destructive">*</span>
              </Label>
              <Input
                {...register("consignee.state")}
                placeholder={
                  lookupState === "loading" ? "Looking up…" : "e.g. New York"
                }
              />
              {e?.state && (
                <p className="text-xs text-destructive">{e.state.message}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Street address — only shown once country is set */}
      {country && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>
              Address Line 1 <span className="text-destructive">*</span>
            </Label>
            <Input
              {...register("consignee.addressLine1")}
              placeholder="123 Main Street, Apt 4B"
            />
            {e?.addressLine1 && (
              <p className="text-xs text-destructive">
                {e.addressLine1.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Address Line 2</Label>
            <Input
              {...register("consignee.addressLine2")}
              placeholder="Building name, floor, landmark (optional)"
            />
          </div>
        </div>
      )}

      {/* Helper note */}
      {!country && (
        <div className="rounded-lg border-2 border-dashed border-border py-8 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            Select the destination country to fill in the address.
          </p>
        </div>
      )}
    </div>
  );
}
