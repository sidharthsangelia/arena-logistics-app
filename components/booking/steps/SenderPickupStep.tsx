"use client";

import { useEffect, useRef } from "react";
import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  UseFormClearErrors,
  FieldErrors,
} from "react-hook-form";
import { AlertCircle, Info, Truck } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  BookingFormData,
  BookingOrgContext,
  ClientSummary,
  ConsignorForm,
} from "@/types/booking.types";
import type { Party } from "@/types/booking";

import { ClientCombobox } from "../ClientComboBox";
import { AddressFields } from "../AddressFields";
import { AddressBookControls } from "../AddressBookControls";

// ── Prefill mappers ────────────────────────────────────────────────────────

function selfToConsignor(self: BookingOrgContext["self"]): ConsignorForm {
  return {
    contactName: self.contactName ?? "",
    companyName: self.companyName ?? "",
    email: self.email ?? "",
    phone: self.phone ?? "",
    addressLine1: self.addressLine1 ?? "",
    addressLine2: "",
    city: self.city ?? "",
    state: self.state ?? "",
    postalCode: self.postalCode ?? "",
    country: self.country ?? "India",
  };
}

function clientToConsignor(client: ClientSummary): ConsignorForm {
  return {
    contactName: client.contactName ?? "",
    companyName: client.companyName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    addressLine1: client.addressLine1 ?? "",
    addressLine2: "",
    city: client.city ?? "",
    state: client.state ?? "",
    postalCode: client.postalCode ?? "",
    country: client.country ?? "India",
  };
}

const EMPTY_CONSIGNOR: ConsignorForm = {
  contactName: "",
  companyName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  orgContext: BookingOrgContext;
  register: UseFormRegister<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  clearErrors: UseFormClearErrors<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  clientError?: string;
}

const ADDRESS_FIELD_KEYS = [
  "contactName",
  "companyName",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const;

// clearErrors("pickup") only clears an error set on the exact key "pickup" —
// it does NOT clear nested errors like "pickup.city" that setError() creates
// from a superRefine issue path. Left uncleared, those linger in formState
// even after the section is hidden.
function clearAddressErrors(
  clearErrors: UseFormClearErrors<BookingFormData>,
  prefix: "pickup" | "billing",
) {
  clearErrors([
    prefix,
    ...ADDRESS_FIELD_KEYS.map((k) => `${prefix}.${k}` as any),
  ]);
}

export function SenderPickupStep({
  orgContext,
  register,
  watch,
  setValue,
  clearErrors,
  errors,
  clientError,
}: Props) {
  const mode = watch("shipmentOwnerMode");
  const selectedClient = watch("selectedClient");
  const pickupSameAsSender = watch("pickupSameAsSender");

  const isBA = orgContext.isBusinessAssociate;

  // Which address book the sender/pickup pickers read + save to.
  const party: Party =
    mode === "EXISTING_CLIENT" && selectedClient
      ? { partyType: "CLIENT", clientId: selectedClient.id }
      : { partyType: "ORG", orgId: orgContext.orgId };

  // Fresh booking defaults to SELF — seed the sender from the org profile once
  // so "use my saved profile" isn't an empty form. Guarded so a resumed draft
  // (which already has sender data) is never overwritten.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    prefilledRef.current = true;
    const c = watch("consignor");
    if (mode === "SELF" && !c?.contactName && !c?.addressLine1) {
      setValue("consignor", selfToConsignor(orgContext.self), {
        shouldValidate: false,
      });
    }
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModeChange = (v: "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON") => {
    setValue("shipmentOwnerMode", v);
    clearErrors();

    if (v === "SELF") {
      setValue("consignor", selfToConsignor(orgContext.self), {
        shouldValidate: false,
      });
    } else if (v === "OTHER_PERSON") {
      setValue("consignor", EMPTY_CONSIGNOR, { shouldValidate: false });
    } else {
      // EXISTING_CLIENT — wait for a client to be picked before prefilling.
      setValue("selectedClient", null);
      setValue("consignor", EMPTY_CONSIGNOR, { shouldValidate: false });
    }
  };

  const handleClientChange = (client: ClientSummary) => {
    setValue("selectedClient", client);
    setValue("consignor", clientToConsignor(client), { shouldValidate: false });
    clearErrors("selectedClient");
  };

  // Sender fields show once we know whose details to collect: always for
  // SELF/OTHER_PERSON, and for EXISTING_CLIENT only after a client is chosen.
  const showSender = mode !== "EXISTING_CLIENT" || !!selectedClient;

  // Keep pickup.* mirrored to consignor.* for as long as "same as sender" is
  // checked, so formData.pickup is always a real, submittable address — never
  // the empty-string defaults — regardless of whether the Pickup section is
  // currently rendered. Uses watch's callback form (not the `pickupSameAsSender`
  // variable) so it reacts to every keystroke without re-subscribing per render.
  useEffect(() => {
    const subscription = watch((values, { name }) => {
      if (!values.pickupSameAsSender) return;
      if (
        name === "pickupSameAsSender" ||
        name === "consignor" ||
        name?.startsWith("consignor.")
      ) {
        setValue("pickup", { ...values.consignor } as ConsignorForm, {
          shouldValidate: false,
          shouldDirty: false,
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, setValue]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Sender &amp; Pickup</h2>
        <p className="text-sm text-muted-foreground">
          Who is sending this shipment, and where should we collect it from?
        </p>
      </div>

      {/* ── Who's shipping ── */}
      <RadioGroup
        value={mode}
        onValueChange={(v) => handleModeChange(v as typeof mode)}
        className="space-y-3"
      >
        <label
          htmlFor="mode-self"
          className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
        >
          <RadioGroupItem value="SELF" id="mode-self" className="mt-0.5" />
          <div>
            <p className="text-sm font-medium">Use my saved profile</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your organisation&apos;s registered details are used as the
              sender.
            </p>
          </div>
        </label>

        {isBA && (
          <label
            htmlFor="mode-client"
            className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem
              value="EXISTING_CLIENT"
              id="mode-client"
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">Existing client</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Book on behalf of one of your saved clients — their details
                pre-fill the sender.
              </p>
            </div>
          </label>
        )}

        <label
          htmlFor="mode-other"
          className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
        >
          <RadioGroupItem
            value="OTHER_PERSON"
            id="mode-other"
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Someone else</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shipping for another person (e.g. a family member) — enter their
              details below.
            </p>
          </div>
        </label>
      </RadioGroup>

      {/* ── Client picker (BA + existing client) ── */}
      {mode === "EXISTING_CLIENT" && (
        <div className="space-y-2">
          <Label>Select client</Label>
          <ClientCombobox
            value={selectedClient}
            onChange={handleClientChange}
          />
          {clientError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {clientError}
            </p>
          )}
        </div>
      )}

      {/* ── Sender details ── */}
      {showSender && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Sender details</h3>
          </div>

          <AddressBookControls
            party={party}
            kind="PICKUP"
            prefix="consignor"
            watch={watch}
            setValue={setValue}
            noun="sender"
          />

          <AddressFields
            prefix="consignor"
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
            addressLabel="Sender address"
          />
        </div>
      )}

      {/* ── Pickup details ── */}
      {showSender && (
        <div className="space-y-5">
          <Separator />

          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Pickup details</h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground"
                    aria-label="About pickup"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Where we physically collect the parcel. It&apos;s usually the
                  same as the sender, but can differ — e.g. the goods ship from
                  a warehouse while the sender is your office.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40">
            <Checkbox
              checked={pickupSameAsSender}
              onCheckedChange={(checked) => {
                const isSame = checked === true;
                setValue("pickupSameAsSender", isSame, {
                  shouldValidate: false,
                });
                if (isSame) {
                  setValue(
                    "pickup",
                    { ...watch("consignor") } as ConsignorForm,
                    { shouldValidate: false },
                  );
                  clearAddressErrors(clearErrors, "pickup");
                }
              }}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">
                Pickup address is the same as the sender
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Uncheck if the parcel is collected from a different address.
              </p>
            </div>
          </label>

          {!pickupSameAsSender && (
            <div className="space-y-5">
              <AddressBookControls
                party={party}
                kind="PICKUP"
                prefix="pickup"
                watch={watch}
                setValue={setValue}
                noun="pickup address"
              />
              <AddressFields
                prefix="pickup"
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
                addressLabel="Pickup address"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
