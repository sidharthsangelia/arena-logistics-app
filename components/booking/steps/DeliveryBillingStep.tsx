"use client";

import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  UseFormClearErrors,
  FieldErrors,
} from "react-hook-form";
import { Info, Receipt } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { BookingFormData, BookingOrgContext } from "@/types/booking.types";
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

  // Delivery/billing addresses reuse the same book as the sender: the org's,
  // or the client's when a BA books on their behalf.
  const party: Party =
    mode === "EXISTING_CLIENT" && selectedClient
      ? { partyType: "CLIENT", clientId: selectedClient.id }
      : { partyType: "ORG", orgId: orgContext.orgId };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Delivery &amp; Billing</h2>
        <p className="text-sm text-muted-foreground">
          Where is this shipment going, and who should we invoice? Accurate
          details here prevent customs delays.
        </p>
      </div>

      {/* ── Delivery ── */}
      <div className="space-y-5">
        <h3 className="text-sm font-semibold">Delivery details</h3>

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
          countryLabel="Destination Country"
          addressLabel="Delivery address"
        />
      </div>

      {/* ── Billing ── */}
      <div className="space-y-5">
        <Separator />

        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Billing details</h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground" aria-label="About billing">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Who the invoice is addressed to. Often the same as the receiver,
                but can differ — e.g. a corporate office is billed while the goods
                are delivered elsewhere.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40">
          <Checkbox
            checked={billingSameAsDelivery}
            onCheckedChange={(checked) => {
              setValue("billingSameAsDelivery", checked === true);
              if (checked === true) clearErrors("billing");
            }}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-medium">Billing address is the same as delivery</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Uncheck to invoice a different address (e.g. a head office).
            </p>
          </div>
        </label>

        {!billingSameAsDelivery && (
          <div className="space-y-5">
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
              countryLabel="Billing Country"
              addressLabel="Billing address"
            />
          </div>
        )}
      </div>
    </div>
  );
}
