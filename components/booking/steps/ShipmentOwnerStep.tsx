"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

import type { ClientSummary } from "@/types/booking.types";
import { ClientCombobox } from "../ClientComboBox";

interface Props {
  /** BA-only: "Existing Client" (book on behalf of a saved client) is only
   *  offered to Business Associates. Normal orgs ship for themselves or for
   *  another person entered manually. */
  isBusinessAssociate: boolean;
  value: string;
  selectedClient: ClientSummary | null;
  onModeChange: (value: "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON") => void;
  onClientChange: (client: ClientSummary) => void;
  /** Validation error message for the client combobox */
  clientError?: string;
}

export function ShipmentOwnerStep({
  isBusinessAssociate,
  value,
  selectedClient,
  onModeChange,
  onClientChange,
  clientError,
}: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Who is Shipping?</h2>
        <p className="text-muted-foreground text-sm">
          Choose whose details should be used as the consignor (sender).
        </p>
      </div>

      <RadioGroup
        value={value}
        onValueChange={(v) =>
          onModeChange(v as "SELF" | "EXISTING_CLIENT" | "OTHER_PERSON")
        }
        className="space-y-3"
      >
        <label
          htmlFor="self"
          className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
        >
          <RadioGroupItem value="SELF" id="self" className="mt-0.5" />
          <div>
            <p className="font-medium text-sm">Use My Saved Profile</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your organisation's registered address will be used as the sender.
            </p>
          </div>
        </label>

        {/* BA-only: book on behalf of a saved client. */}
        {isBusinessAssociate && (
          <label
            htmlFor="client"
            className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem value="EXISTING_CLIENT" id="client" className="mt-0.5" />
            <div>
              <p className="font-medium text-sm">Existing Client</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Book a shipment on behalf of one of your saved clients.
              </p>
            </div>
          </label>
        )}

        <label
          htmlFor="other"
          className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
        >
          <RadioGroupItem value="OTHER_PERSON" id="other" className="mt-0.5" />
          <div>
            <p className="font-medium text-sm">Another Person</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter sender details manually on the next step.
            </p>
          </div>
        </label>
      </RadioGroup>

      {/* Client picker — only shown when EXISTING_CLIENT is selected */}
      {value === "EXISTING_CLIENT" && (
        <div className="space-y-2">
          <Label>Select Client</Label>
          <ClientCombobox value={selectedClient} onChange={onClientChange} />
          {clientError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {clientError}
            </p>
          )}
          {selectedClient && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm space-y-0.5">
              <p className="font-medium">{selectedClient.companyName}</p>
              {selectedClient.contactName && (
                <p className="text-muted-foreground">{selectedClient.contactName}</p>
              )}
              {selectedClient.email && (
                <p className="text-muted-foreground">{selectedClient.email}</p>
              )}
              {selectedClient.addressLine1 && (
                <p className="text-muted-foreground">
                  {[
                    selectedClient.addressLine1,
                    selectedClient.city,
                    selectedClient.country,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <p className="text-xs text-green-600 font-medium pt-1">
                ✓ This client's details will pre-fill the sender form on the next step.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}