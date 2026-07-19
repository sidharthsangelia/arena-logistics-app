"use client";

import { useEffect } from "react";
import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  UseFormClearErrors,
  FieldErrors,
} from "react-hook-form";
import { Info } from "lucide-react";

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
  ConsignorForm,
} from "@/types/booking.types";
import type { Party } from "@/types/booking";

import { AddressFields } from "../AddressFields";
import { AddressBookControls } from "../AddressBookControls";

interface Props {
  orgContext: BookingOrgContext;
  register: UseFormRegister<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  clearErrors: UseFormClearErrors<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
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

// clearErrors("billing") only clears an error on the exact key "billing", not
// nested errors like "billing.city" that a superRefine issue path creates.
function clearAddressErrors(
  clearErrors: UseFormClearErrors<BookingFormData>,
  prefix: "pickup" | "billing",
) {
  clearErrors([
    prefix,
    ...ADDRESS_FIELD_KEYS.map((k) => `${prefix}.${k}` as any),
  ]);
}

export function DeliveryBillingStep({
  orgContext,
  register,
  watch,
  setValue,
  clearErrors,
  errors,
}: Props) {
  const mode = watch("shipmentOwnerMode");
  const selectedClient = watch("selectedClient");
  const billingSameAsDelivery = watch("billingSameAsDelivery");

  // Delivery / billing reuse the same book as the sender: the org's, or the
  // client's when a BA books on their behalf.
  const party: Party =
    mode === "EXISTING_CLIENT" && selectedClient
      ? { partyType: "CLIENT", clientId: selectedClient.id }
      : { partyType: "ORG", orgId: orgContext.orgId };

  useEffect(() => {
    const subscription = watch((values, { name }) => {
      if (!values.billingSameAsDelivery) return;
      if (
        name === "billingSameAsDelivery" ||
        name === "consignee" ||
        name?.startsWith("consignee.")
      ) {
        setValue("billing", { ...values.consignee } as ConsignorForm, {
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
        <h2 className="text-lg font-semibold">Delivery and billing</h2>
        <p className="text-sm text-muted-foreground">
          Where is this shipment going, and who should we invoice? Accurate
          details here keep it moving through customs.
        </p>
      </div>

      {/* ── Delivery ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Delivery</h3>

        <AddressBookControls
          party={party}
          kind="DELIVERY"
          prefix="consignee"
          watch={watch}
          setValue={setValue}
          noun="delivery address"
        />

        <AddressFields
          prefix="consignee"
          register={register}
          watch={watch}
          setValue={setValue}
          errors={errors}
          countryLabel="Destination country"
        />
      </div>

      {/* ── Billing ── */}
      <div className="space-y-3 border-t pt-6">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">Billing</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground"
                  aria-label="About billing"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Who the invoice is addressed to. Often the same as the receiver,
                but it can differ. For example a head office is billed while the
                goods are delivered elsewhere.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox
            checked={billingSameAsDelivery}
            onCheckedChange={(checked) => {
              const isSame = checked === true;
              setValue("billingSameAsDelivery", isSame, { shouldValidate: false });
              if (isSame) {
                setValue("billing", { ...watch("consignee") } as ConsignorForm, {
                  shouldValidate: false,
                });
                clearAddressErrors(clearErrors, "billing");
              }
            }}
          />
          <span>Invoice the delivery address</span>
        </label>

        {!billingSameAsDelivery && (
          <div className="space-y-3">
            <AddressBookControls
              party={party}
              kind="BILLING"
              prefix="billing"
              watch={watch}
              setValue={setValue}
              noun="billing address"
            />
            <AddressFields
              prefix="billing"
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
              countryLabel="Billing country"
            />
          </div>
        )}
      </div>
    </div>
  );
}
