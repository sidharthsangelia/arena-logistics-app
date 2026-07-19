"use client";

import { useEffect, useRef } from "react";
import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  UseFormClearErrors,
  FieldErrors,
} from "react-hook-form";
import { AlertCircle, Info } from "lucide-react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type OwnerMode = "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON";

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

// clearErrors("pickup") only clears an error set on the exact key "pickup" — it
// does NOT clear nested errors like "pickup.city" that setError() creates from a
// superRefine issue path. Left uncleared, those linger in formState even after
// the section is hidden.
function clearAddressErrors(
  clearErrors: UseFormClearErrors<BookingFormData>,
  prefix: "pickup" | "billing",
) {
  clearErrors([
    prefix,
    ...ADDRESS_FIELD_KEYS.map((k) => `${prefix}.${k}` as any),
  ]);
}

const MODE_HELP: Record<OwnerMode, string> = {
  SELF: "We use your saved organisation profile as the sender.",
  EXISTING_CLIENT: "Book for one of your saved clients. Their details fill the sender.",
  OTHER_PERSON: "Sending for someone else, like a friend or family member. Enter their details below.",
};

export function SenderPickupStep({
  orgContext,
  register,
  watch,
  setValue,
  clearErrors,
  errors,
  clientError,
}: Props) {
  const mode = watch("shipmentOwnerMode") as OwnerMode;
  const selectedClient = watch("selectedClient");
  const pickupSameAsSender = watch("pickupSameAsSender");

  const isBA = orgContext.isBusinessAssociate;

  // "Has the org saved *any* usable profile detail?" — deliberately looser than
  // the strict all-fields `profileAddressComplete` flag. A partially filled
  // profile still has a sender worth pre-filling, so we key both the auto-prefill
  // and the helper copy off this instead of the strict flag.
  const self = orgContext.self;
  const hasSavedProfile = !!(
    self.contactName ||
    self.addressLine1 ||
    self.companyName ||
    self.email ||
    self.phone
  );

  // Segmented modes — the client option only exists for Business Associates.
  const modes: { value: OwnerMode; label: string }[] = [
    { value: "SELF", label: "My Self" },
    ...(isBA ? [{ value: "EXISTING_CLIENT" as const, label: "A client" }] : []),
    { value: "OTHER_PERSON", label: "Someone else" },
  ];

  // Which address book the sender / pickup pickers read + save to.
  const party: Party =
    mode === "EXISTING_CLIENT" && selectedClient
      ? { partyType: "CLIENT", clientId: selectedClient.id }
      : { partyType: "ORG", orgId: orgContext.orgId };

  // "My organisation" is selected by default, so seed the sender from the org
  // profile on mount without the user having to re-tap. Guarded so a resumed
  // draft (which already has sender data) is never overwritten, and keyed off
  // `hasSavedProfile` so any saved detail triggers the prefill.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    prefilledRef.current = true;
    const c = watch("consignor");
    if (mode === "SELF" && !c?.contactName && !c?.addressLine1 && hasSavedProfile) {
      setValue("consignor", selfToConsignor(orgContext.self), {
        shouldValidate: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModeChange = (v: OwnerMode) => {
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
  // SELF / OTHER_PERSON, and for EXISTING_CLIENT only after a client is chosen.
  const showSender = mode !== "EXISTING_CLIENT" || !!selectedClient;

  // Keep pickup.* mirrored to consignor.* while "same as sender" is checked, so
  // formData.pickup is always a real, submittable address. Uses watch's callback
  // form so it reacts to every keystroke without re-subscribing per render.
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
    <div className="space-y-7">
      <div>
        <h2 className="text-lg font-semibold">Sender and pickup</h2>
        <p className="text-sm text-muted-foreground">
          Who is sending this shipment, and where should we collect it?
        </p>
      </div>

      {/* ── Who's shipping (segmented) ── */}
      <div className="space-y-2">
        <RadioGroup
          value={mode}
          onValueChange={(v) => handleModeChange(v as OwnerMode)}
          className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/50 p-1"
        >
          {modes.map((m) => (
            <Label
              key={m.value}
              htmlFor={`mode-${m.value}`}
              className="cursor-pointer"
            >
              <RadioGroupItem
                value={m.value}
                id={`mode-${m.value}`}
                className="peer sr-only"
              />
              <span className="block rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:bg-background peer-data-[state=checked]:text-foreground peer-data-[state=checked]:shadow-sm">
                {m.label}
              </span>
            </Label>
          ))}
        </RadioGroup>
        <p className="text-xs text-muted-foreground">{MODE_HELP[mode]}</p>
      </div>

      {/* ── Client picker (BA + existing client) ── */}
      {mode === "EXISTING_CLIENT" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Select client</Label>
          <ClientCombobox value={selectedClient} onChange={handleClientChange} />
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
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Sender</h3>

          {/* Address-book chips are redundant under "My organisation" — the
              sender is already filled from the org profile. Only offer them when
              the sender is someone else (a saved client / one-off recipient). */}
          {mode !== "SELF" && (
            <AddressBookControls
              party={party}
              kind="PICKUP"
              prefix="consignor"
              watch={watch}
              setValue={setValue}
              noun="sender"
            />
          )}

          <AddressFields
            prefix="consignor"
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
          />
        </div>
      )}

      {/* ── Pickup details ── */}
      {showSender && (
        <div className="space-y-3 border-t pt-6">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Pickup</h3>
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
                  Where we physically collect the parcel. Usually the same as the
                  sender, but it can differ. For example the goods ship from a
                  warehouse while the sender is your office.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox
              checked={pickupSameAsSender}
              onCheckedChange={(checked) => {
                const isSame = checked === true;
                setValue("pickupSameAsSender", isSame, { shouldValidate: false });
                if (isSame) {
                  setValue("pickup", { ...watch("consignor") } as ConsignorForm, {
                    shouldValidate: false,
                  });
                  clearAddressErrors(clearErrors, "pickup");
                }
              }}
            />
            <span>Collect from the sender&apos;s address</span>
          </label>

          {!pickupSameAsSender && (
            <div className="space-y-3">
              <AddressBookControls
                party={party}
                kind="PICKUP"
                prefix="pickup"
                watch={watch}
                setValue={setValue}
                noun="pickup"
              />
              <AddressFields
                prefix="pickup"
                register={register}
                watch={watch}
                setValue={setValue}
                errors={errors}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
