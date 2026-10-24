"use client";

/**
 * AddClientForm.tsx
 *
 * Compact inline form rendered inside QuoteSheet when the user clicks
 * "Add new client". Mirrors every field on the full clients form
 * (components/clients/toolbar/ClientForm) so a quote-time client is never
 * missing detail. Only one name is required: the company name for a company,
 * the person's name for an individual. Everything else is optional so the
 * flow stays fast.
 *
 * On save it calls createClientAction (which returns the created record) and
 * passes the result back to QuoteSheet via onSaved. No re-search needed.
 */

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, X } from "lucide-react";
import { createClientAction } from "@/actions/clients.action";
import { clientSchema } from "@/lib/validations/clients.schema";
import type { ClientSearchResult } from "@/actions/clientSrearch.action";

type ClientKind = "COMPANY" | "INDIVIDUAL";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  onSaved: (client: ClientSearchResult) => void;
  onCancel: () => void;
  /** Prefills the company field, e.g. with the combobox search query. */
  initialCompanyName?: string;
}

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  notes: string;
  gstin: string;
  panNumber: string;
  aadhaarNumber: string;
}

const empty: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  addressLine1: "",
  city: "",
  state: "",
  country: "",
  postalCode: "",
  notes: "",
  gstin: "",
  panNumber: "",
  aadhaarNumber: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddClientForm({
  onSaved,
  onCancel,
  initialCompanyName,
}: Props) {
  const [form, setForm] = useState<FormState>(() => ({
    ...empty,
    companyName: initialCompanyName?.trim() ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ClientKind>("COMPANY");

  // The search text that opened this form lands in the company name. If the
  // user then says it is a person, carry it across rather than make them retype.
  const switchKind = (next: ClientKind) => {
    setKind(next);
    if (next === "INDIVIDUAL") {
      setForm((p) =>
        p.contactName.trim() ? p : { ...p, contactName: p.companyName },
      );
    }
  };
  const [isPending, startTransition] = useTransition();

  const set =
    (field: keyof FormState) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  // A company needs its name, an individual theirs. Everything else is optional.
  const isValid =
    kind === "INDIVIDUAL"
      ? form.contactName.trim().length > 0
      : form.companyName.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    setError(null);

    // Trim + drop empties so optional fields save as undefined, not "".
    const payload = {
      companyKind:  kind,
      companyName:  form.companyName.trim() || undefined,
      contactName:  form.contactName.trim() || undefined,
      email:        form.email.trim() || undefined,
      phone:        form.phone.trim() || undefined,
      addressLine1: form.addressLine1.trim() || undefined,
      city:         form.city.trim() || undefined,
      state:        form.state.trim() || undefined,
      country:      form.country.trim() || undefined,
      postalCode:   form.postalCode.trim() || undefined,
      notes:        form.notes.trim() || undefined,
      gstin:        form.gstin.trim() || undefined,
      panNumber:    form.panNumber.trim() || undefined,
      aadhaarNumber: form.aadhaarNumber.trim() || undefined,
    };

    // Validate client-side so a bad email is caught before the round-trip.
    const parsed = clientSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the details.");
      return;
    }

    startTransition(async () => {
      const result = await createClientAction(parsed.data);
      if (!result.success) {
        setError(result.message);
        return;
      }
      onSaved(result.client);
    });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">New client</p>
          <p className="text-[11px] text-muted-foreground">
            {kind === "INDIVIDUAL"
              ? "Only the name is required."
              : "Only the company name is required."}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onCancel}
          disabled={isPending}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Company or individual */}
      <Tabs value={kind} onValueChange={(v) => switchKind(v as ClientKind)}>
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="COMPANY" className="text-xs" disabled={isPending}>
            Company
          </TabsTrigger>
          <TabsTrigger value="INDIVIDUAL" className="text-xs" disabled={isPending}>
            Individual
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Name first, then the company it belongs to */}
      <div className="grid grid-cols-2 gap-2">
        <FormField
          id="ac_contact"
          label={kind === "INDIVIDUAL" ? "Full name" : "Contact name"}
          required={kind === "INDIVIDUAL"}
        >
          <Input
            id="ac_contact"
            value={form.contactName}
            onChange={set("contactName")}
            placeholder="John Smith"
            className="h-8 text-sm"
            disabled={isPending}
            autoFocus={kind === "INDIVIDUAL"}
          />
        </FormField>

        {kind === "COMPANY" && (
          <FormField id="ac_company" label="Company name" required>
            <Input
              id="ac_company"
              value={form.companyName}
              onChange={set("companyName")}
              placeholder="Acme Corp"
              className="h-8 text-sm"
              disabled={isPending}
              autoFocus
            />
          </FormField>
        )}
      </div>

      {/* Email + Phone */}
      <div className="grid grid-cols-2 gap-2">
        <FormField id="ac_email" label="Email">
          <Input
            id="ac_email"
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="john@acme.com"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>

        <FormField id="ac_phone" label="Phone">
          <Input
            id="ac_phone"
            value={form.phone}
            onChange={set("phone")}
            placeholder="+91 98765 43210"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>
      </div>

      {/* Address */}
      <FormField id="ac_address" label="Address">
        <Input
          id="ac_address"
          value={form.addressLine1}
          onChange={set("addressLine1")}
          placeholder="123 Business Park"
          className="h-8 text-sm"
          disabled={isPending}
        />
      </FormField>

      {/* City + State */}
      <div className="grid grid-cols-2 gap-2">
        <FormField id="ac_city" label="City">
          <Input
            id="ac_city"
            value={form.city}
            onChange={set("city")}
            placeholder="Mumbai"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>

        <FormField id="ac_state" label="State">
          <Input
            id="ac_state"
            value={form.state}
            onChange={set("state")}
            placeholder="Maharashtra"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>
      </div>

      {/* Country + Postal code */}
      <div className="grid grid-cols-2 gap-2">
        <FormField id="ac_country" label="Country">
          <Input
            id="ac_country"
            value={form.country}
            onChange={set("country")}
            placeholder="India"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>

        <FormField id="ac_postal" label="Postal code">
          <Input
            id="ac_postal"
            value={form.postalCode}
            onChange={set("postalCode")}
            placeholder="400001"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>
      </div>

      {/* Identity numbers (optional) */}
      <div className="grid grid-cols-3 gap-2">
        <FormField id="ac_gstin" label="GSTIN">
          <Input
            id="ac_gstin"
            value={form.gstin}
            onChange={set("gstin")}
            placeholder="07ABCDE1234F1Z5"
            maxLength={15}
            autoComplete="off"
            className="h-8 font-mono text-sm uppercase"
            disabled={isPending}
          />
        </FormField>

        <FormField id="ac_pan" label="PAN">
          <Input
            id="ac_pan"
            value={form.panNumber}
            onChange={set("panNumber")}
            placeholder="ABCDE1234F"
            maxLength={10}
            autoComplete="off"
            className="h-8 font-mono text-sm uppercase"
            disabled={isPending}
          />
        </FormField>

        <FormField id="ac_aadhaar" label="Aadhaar">
          <Input
            id="ac_aadhaar"
            value={form.aadhaarNumber}
            onChange={set("aadhaarNumber")}
            inputMode="numeric"
            placeholder="1234 5678 9012"
            maxLength={14}
            autoComplete="off"
            className="h-8 font-mono text-sm"
            disabled={isPending}
          />
        </FormField>
      </div>

      {/* Notes */}
      <FormField id="ac_notes" label="Internal notes">
        <Textarea
          id="ac_notes"
          value={form.notes}
          onChange={set("notes")}
          placeholder="Anything useful about this client…"
          rows={2}
          className="resize-none text-sm"
          disabled={isPending}
        />
      </FormField>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={!isValid || isPending}
          onClick={handleSubmit}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-3.5 w-3.5" />
              Save &amp; select
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper
// ---------------------------------------------------------------------------

function FormField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
