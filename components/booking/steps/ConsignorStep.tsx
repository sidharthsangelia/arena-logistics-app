"use client";

import { UseFormRegister, FieldErrors } from "react-hook-form";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookingFormData } from "@/types/booking.types";

interface Props {
  register: UseFormRegister<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
}

// Small helper so each field doesn't repeat the error-display pattern
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function ConsignorStep({ register, errors }: Props) {
  const e = errors.consignor as any; // nested FieldErrors

  return (
    <div className="space-y-6">
      <div>
        <CardTitle>Sender Details</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Review and confirm the sender's information. If you selected an existing
          client, these fields are pre-filled, you can edit them before continuing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact Name" error={e?.contactName?.message}>
          <Input {...register("consignor.contactName")} placeholder="John Doe" />
        </Field>
        <Field label="Company Name" error={e?.companyName?.message}>
          <Input {...register("consignor.companyName")} placeholder="Acme Exports Pvt Ltd" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" error={e?.email?.message}>
          <Input type="email" {...register("consignor.email")} placeholder="john@acme.com" />
        </Field>
        <Field label="Phone" error={e?.phone?.message}>
          <Input {...register("consignor.phone")} placeholder="+91 98765 43210" />
        </Field>
      </div>

      <Field label="Address Line 1" error={e?.addressLine1?.message}>
        <Input {...register("consignor.addressLine1")} placeholder="123 Export House, MG Road" />
      </Field>

      <Field label="Address Line 2 (optional)" error={e?.addressLine2?.message}>
        <Input {...register("consignor.addressLine2")} placeholder="Near Customs Office" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="City" error={e?.city?.message}>
          <Input {...register("consignor.city")} placeholder="Mumbai" />
        </Field>
        <Field label="State" error={e?.state?.message}>
          <Input {...register("consignor.state")} placeholder="Maharashtra" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Postal Code" error={e?.postalCode?.message}>
          <Input {...register("consignor.postalCode")} placeholder="400001" />
        </Field>
        <Field label="Country" error={e?.country?.message}>
          <Input {...register("consignor.country")} placeholder="India" />
        </Field>
      </div>
    </div>
  );
}