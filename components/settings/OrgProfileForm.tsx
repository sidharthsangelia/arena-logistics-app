// components/settings/OrgProfileForm.tsx
"use client";

import { useForm } from "react-hook-form";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveOrgProfileAction, type OrgProfileInput } from "@/actions/settings/profile.action";

const FIELDS: { name: keyof OrgProfileInput; label: string; span?: "full" }[] = [
  { name: "contactName", label: "Contact name" },
  { name: "companyName", label: "Company name" },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "addressLine1", label: "Address", span: "full" },
  { name: "city", label: "City" },
  { name: "state", label: "State" },
  { name: "postalCode", label: "Postal code" },
  { name: "country", label: "Country" },
];

export function OrgProfileForm({
  initialValues,
  addressComplete,
}: {
  initialValues: OrgProfileInput;
  addressComplete: boolean;
}) {
  const { register, handleSubmit } = useForm<OrgProfileInput>({ defaultValues: initialValues });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
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
    setSavedAt(Date.now());
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Address & contact details</CardTitle>
        {addressComplete && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete
          </span>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.name} className={f.span === "full" ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
                <Label htmlFor={f.name}>{f.label}</Label>
                <Input id={f.name} {...register(f.name)} />
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            {savedAt && !saving && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}