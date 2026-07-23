"use client";

/**
 * AddClientForm.tsx
 *
 * Compact inline form rendered inside QuoteSheet when the user clicks
 * "Add new client". Mirrors every field on the full clients form
 * (components/clients/toolbar/ClientForm) so a quote-time client is never
 * missing detail — but only Company name is required. Everything else is
 * optional so the flow stays fast.
 *
 * On save it calls createClientAction (which returns the created record) and
 * passes the result back to QuoteSheet via onSaved. No re-search needed.
 */

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";
import { createClientAction } from "@/actions/clients.action";
import { clientSchema } from "@/lib/validations/clients.schema";
import type { ClientSearchResult } from "@/actions/clientSrearch.action";

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
  const [isPending, startTransition] = useTransition();

  const set =
    (field: keyof FormState) =>
    (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  // Only company name is mandatory — everything else is optional.
  const isValid = form.companyName.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    setError(null);

    // Trim + drop empties so optional fields save as undefined, not "".
    const payload = {
      companyName:  form.companyName.trim(),
      contactName:  form.contactName.trim() || undefined,
      email:        form.email.trim() || undefined,
      phone:        form.phone.trim() || undefined,
      addressLine1: form.addressLine1.trim() || undefined,
      city:         form.city.trim() || undefined,
      state:        form.state.trim() || undefined,
      country:      form.country.trim() || undefined,
      postalCode:   form.postalCode.trim() || undefined,
      notes:        form.notes.trim() || undefined,
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
            Only the company name is required.
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

      {/* Company (required) */}
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

      {/* Contact + Email */}
      <div className="grid grid-cols-2 gap-2">
        <FormField id="ac_contact" label="Contact name">
          <Input
            id="ac_contact"
            value={form.contactName}
            onChange={set("contactName")}
            placeholder="John Smith"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </FormField>

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
      </div>

      {/* Phone (full width — number pads read better with room) */}
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
