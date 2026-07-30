"use client";

import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  saveOrgProfileAction,
  type OrgProfileInput,
} from "@/actions/settings/profile.action";

/**
 * The org's own contact and address details.
 *
 * Content only: it is rendered inside the settings dialog, which owns the title,
 * the description and the border. Same convention the ops action panels follow.
 */

const FIELDS: {
  name: keyof OrgProfileInput;
  label: string;
  span?: "full";
  optional?: boolean;
  hint?: string;
  type?: string;
  autoComplete?: string;
}[] = [
  { name: "contactName", label: "Full name", autoComplete: "name" },
  {
    name: "companyName",
    label: "Company name",
    optional: true,
    hint: "Leave blank if you ship as an individual.",
    autoComplete: "organization",
  },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
  {
    name: "addressLine1",
    label: "Address",
    span: "full",
    autoComplete: "street-address",
  },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "state", label: "State", autoComplete: "address-level1" },
  { name: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { name: "country", label: "Country", autoComplete: "country-name" },
];

export function OrgProfileForm({
  initialValues,
  onSaved,
  onCancel,
}: {
  initialValues: OrgProfileInput;
  /** Called once the save has actually landed, so the dialog closes on success only. */
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const { register, handleSubmit } = useForm<OrgProfileInput>({
    defaultValues: initialValues,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: OrgProfileInput) => {
    setSaving(true);
    setError(null);
    const result = await saveOrgProfileAction(values);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div
            key={f.name}
            className={cn("space-y-1.5", f.span === "full" && "sm:col-span-2")}
          >
            <Label htmlFor={f.name} className="flex items-center gap-1.5">
              {f.label}
              {f.optional && (
                <span className="text-xs font-normal text-muted-foreground">
                  optional
                </span>
              )}
            </Label>
            <Input
              id={f.name}
              type={f.type}
              autoComplete={f.autoComplete}
              {...register(f.name)}
            />
            {f.hint && (
              <p className="text-xs text-muted-foreground">{f.hint}</p>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save details
        </Button>
      </div>
    </form>
  );
}
