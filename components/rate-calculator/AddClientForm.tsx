"use client";

/**
 * AddClientForm.tsx
 *
 * Compact inline form rendered inside QuoteSheet when the user clicks
 * "Add new client". On save it calls createClientAction (which now returns
 * the created record) and passes the result back to QuoteSheet via onSaved.
 *
 * No re-search needed — createClientAction returns the full record directly.
 */

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { createClientAction } from "@/actions/clients.action";
import type { ClientSearchResult } from "@/actions/clientSrearch.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  onSaved: (client: ClientSearchResult) => void;
  onCancel: () => void;
}

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  country: string;
}

const empty: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  phone: "",
  addressLine1: "",
  city: "",
  country: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AddClientForm({ onSaved, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));

  const isValid = form.companyName.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    setError(null);

    startTransition(async () => {
      const result = await createClientAction({
        companyName: form.companyName.trim(),
        contactName: form.contactName.trim() || undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        addressLine1: form.addressLine1.trim() || undefined,
        city: form.city.trim() || undefined,
        country: form.country.trim() || undefined,
      });

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
        <p className="text-sm font-medium">New client</p>
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

      <div className="space-y-1.5">
        <Label htmlFor="ac_company" className="text-xs">
          Company name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="ac_company"
          value={form.companyName}
          onChange={set("companyName")}
          placeholder="Acme Corp"
          className="h-8 text-sm"
          disabled={isPending}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="ac_contact" className="text-xs">
            Contact name
          </Label>
          <Input
            id="ac_contact"
            value={form.contactName}
            onChange={set("contactName")}
            placeholder="John Smith"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ac_email" className="text-xs">
            Email
          </Label>
          <Input
            id="ac_email"
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="john@acme.com"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ac_phone" className="text-xs">
            Phone
          </Label>
          <Input
            id="ac_phone"
            value={form.phone}
            onChange={set("phone")}
            placeholder="+91 98765 43210"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ac_city" className="text-xs">
            City
          </Label>
          <Input
            id="ac_city"
            value={form.city}
            onChange={set("city")}
            placeholder="Mumbai"
            className="h-8 text-sm"
            disabled={isPending}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ac_address" className="text-xs">
          Address
        </Label>
        <Input
          id="ac_address"
          value={form.addressLine1}
          onChange={set("addressLine1")}
          placeholder="123 Business Park"
          className="h-8 text-sm"
          disabled={isPending}
        />
      </div>

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
            "Save & select"
          )}
        </Button>
      </div>
    </div>
  );
}