"use client";

/**
 * The one form for a billing customer, used to create and to correct.
 *
 * It began as a dialog inside BillingPartyPicker, because a customer usually
 * does not exist when the invoice is being raised and sending the admin to
 * another screen is where the five minutes would go. The customers page needs
 * exactly the same questions to fix a wrong GSTIN, and two copies of a form
 * that decides a place of supply would eventually disagree about how. So the
 * picker and the customers page share this, and it branches only on the verb.
 *
 * ── EDITING DOES NOT REWRITE HISTORY ────────────────────────────────────────
 * Every issued invoice snapshots the party onto itself and stores the rendered
 * PDF, so a correction here changes what the NEXT invoice prints and nothing a
 * customer is already holding. That is the correct behaviour for a tax document
 * and the reason this is safe to leave open to whoever answers the phone.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECTABLE_GST_STATES } from "@/lib/invoices/tax/gst";
import { BillingPartyKind } from "@/generated/prisma";
import type {
  BillingPartyDetail,
  BillingPartyOption,
} from "@/lib/invoices/manual/config";
import {
  createBillingPartyAction,
  updateBillingPartyAction,
} from "@/actions/invoices/manualInvoices.action";

const EMPTY_FORM = {
  kind: BillingPartyKind.BUSINESS as BillingPartyKind,
  legalName: "",
  tradeName: "",
  customerCode: "",
  gstin: "",
  pan: "",
  cin: "",
  contactName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  postalCode: "",
  country: "India",
  notes: "",
};

export type PartyForm = typeof EMPTY_FORM;

function formFrom(party: BillingPartyDetail): PartyForm {
  return {
    kind: party.kind,
    legalName: party.legalName,
    tradeName: party.tradeName ?? "",
    customerCode: party.customerCode ?? "",
    gstin: party.gstin ?? "",
    pan: party.pan ?? "",
    cin: party.cin ?? "",
    contactName: party.contactName ?? "",
    email: party.email ?? "",
    phone: party.phone ?? "",
    addressLine1: party.addressLine1 ?? "",
    addressLine2: party.addressLine2 ?? "",
    city: party.city ?? "",
    state: party.state ?? "",
    stateCode: party.stateCode ?? "",
    postalCode: party.postalCode ?? "",
    country: party.country ?? "India",
    notes: party.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function BillingPartyDialog({
  open,
  onOpenChange,
  party,
  initialName = "",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** An existing customer to correct, or undefined to create one. */
  party?: BillingPartyDetail;
  /** What was typed in the picker when nothing matched. Creation only. */
  initialName?: string;
  onSaved: (party: BillingPartyOption) => void;
}) {
  const editing = !!party;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit customer" : "New customer"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Invoices already issued keep the details they were issued with. This changes what the next one prints."
              : "Only the name is required. Everything else can be filled in later."}
          </DialogDescription>
        </DialogHeader>

        {/* Radix unmounts DialogContent when closed, so the form's useState
            initialiser runs fresh on every open. That is why there is no
            reset-on-open effect here. */}
        <PartyFields
          party={party}
          initialName={initialName}
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Only the name is required. Everything else can be filled in later from the
 * customer list, and blocking an invoice on a PAN nobody has to hand is how a
 * tool gets bypassed.
 *
 * ── A CUSTOMER IS NOT ALWAYS A COMPANY ──────────────────────────────────────
 * People ship things. Somebody sending forty kilos of personal effects to their
 * son in Toronto has no GSTIN, no CIN and no trading name, and still needs an
 * invoice. Nothing here or in the schema ever required those, but a form that
 * opens on "Legal name" and "GSTIN" reads as though it did, and the honest
 * reading of a form is the one people act on.
 *
 * So the first question is which kind of customer this is, and the rest of the
 * form answers to it. Choosing Individual does not unlock anything. It removes
 * questions that were never going to have answers.
 */
function PartyFields({
  party,
  initialName,
  onCancel,
  onSaved,
}: {
  party?: BillingPartyDetail;
  initialName: string;
  onCancel: () => void;
  onSaved: (party: BillingPartyOption) => void;
}) {
  const [form, setForm] = React.useState<PartyForm>(() =>
    party ? formFrom(party) : { ...EMPTY_FORM, legalName: initialName },
  );
  const [saving, setSaving] = React.useState(false);

  const set = <K extends keyof PartyForm>(key: K, value: PartyForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const individual = form.kind === BillingPartyKind.INDIVIDUAL;

  // Reading the state out of the GSTIN as it is typed, so the admin sees the
  // consequence of the number rather than having to know it. An individual has
  // none, so their state is picked directly below instead.
  const gstinStateCode =
    !individual && form.gstin.trim().length >= 2
      ? form.gstin.trim().slice(0, 2)
      : null;
  const gstinState = SELECTABLE_GST_STATES.find(
    (s) => s.code === gstinStateCode,
  );

  async function submit() {
    if (!form.legalName.trim()) {
      toast.error("Enter the customer's name.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        // Anything typed under Business and then switched away from is not
        // saved. A stray GSTIN on a person's record would print on their
        // invoice, and it belongs to whoever was being entered a minute ago.
        ...(individual ? { tradeName: "", gstin: "", cin: "" } : {}),
        stateCode: gstinState?.code ?? form.stateCode,
        state: form.state || gstinState?.name || "",
      };

      const result = party
        ? await updateBillingPartyAction(party.id, payload)
        : await createBillingPartyAction(payload);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        party ? "Customer updated." : `${result.data.legalName} added.`,
      );
      onSaved(result.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-1 py-1 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <Label>Customer is</Label>
          <div className="inline-flex w-fit rounded-lg border p-0.5">
            {[
              { kind: BillingPartyKind.BUSINESS, label: "A business" },
              { kind: BillingPartyKind.INDIVIDUAL, label: "An individual" },
            ].map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={form.kind === option.kind}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  form.kind === option.kind
                    ? "bg-secondary font-medium text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => set("kind", option.kind)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="party-name">
            {individual ? "Full name" : "Legal name"}
          </Label>
          <Input
            id="party-name"
            autoFocus
            value={form.legalName}
            onChange={(e) => set("legalName", e.target.value)}
            placeholder={
              individual
                ? "Priya Raghunathan"
                : "Meridian Textiles Private Limited"
            }
          />
        </div>

        {individual ? null : (
          <div className="grid gap-2">
            <Label htmlFor="party-trade">Trading name</Label>
            <Input
              id="party-trade"
              value={form.tradeName}
              onChange={(e) => set("tradeName", e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="party-code">Customer code</Label>
          <Input
            id="party-code"
            value={form.customerCode}
            onChange={(e) => set("customerCode", e.target.value)}
            placeholder="Your accounting reference"
          />
        </div>

        {individual ? null : (
          <div className="grid gap-2">
            <Label htmlFor="party-gstin">GSTIN</Label>
            <Input
              id="party-gstin"
              value={form.gstin}
              onChange={(e) => set("gstin", e.target.value.toUpperCase())}
              placeholder="07AAECM4321K1Z9"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {gstinState
                ? `Place of supply: ${gstinState.name}`
                : "Optional. It sets the place of supply, which decides IGST against CGST and SGST."}
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="party-pan">PAN</Label>
          <Input
            id="party-pan"
            value={form.pan}
            onChange={(e) => set("pan", e.target.value.toUpperCase())}
            className="font-mono"
          />
        </div>

        {individual ? null : (
          <div className="grid gap-2">
            <Label htmlFor="party-cin">CIN</Label>
            <Input
              id="party-cin"
              value={form.cin}
              onChange={(e) => set("cin", e.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>
        )}

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="party-address">Address</Label>
          <Input
            id="party-address"
            value={form.addressLine1}
            onChange={(e) => set("addressLine1", e.target.value)}
            placeholder="Street, building"
          />
          <Input
            value={form.addressLine2}
            onChange={(e) => set("addressLine2", e.target.value)}
            placeholder="Area (optional)"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="party-city">City</Label>
          <Input
            id="party-city"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="party-postal">Postal code</Label>
          <Input
            id="party-postal"
            value={form.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
          />
        </div>

        {/* Only offered when the GSTIN has not already answered it. */}
        {gstinState ? null : (
          <div className="grid gap-2">
            <Label>State</Label>
            <Select
              value={form.stateCode}
              onValueChange={(code) => {
                const match = SELECTABLE_GST_STATES.find(
                  (s) => s.code === code,
                );
                set("stateCode", code);
                set("state", match?.name ?? "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a state" />
              </SelectTrigger>
              <SelectContent>
                {SELECTABLE_GST_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="party-country">Country</Label>
          <Input
            id="party-country"
            value={form.country}
            onChange={(e) => set("country", e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="party-contact">Contact</Label>
          <Input
            id="party-contact"
            value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="party-email">Email</Label>
          <Input
            id="party-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="Where the invoice gets sent"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="party-phone">Phone</Label>
          <Input
            id="party-phone"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="party-notes">Notes</Label>
          <Textarea
            id="party-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving
            </>
          ) : party ? (
            "Save changes"
          ) : (
            "Add customer"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
