"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { Client } from "@/generated/prisma";



import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClientFormValues, clientSchema } from "@/lib/validations/clients.schema";

type Props = {
  client?: Client;
  submitLabel: string;
  onSubmit: (values: ClientFormValues) => Promise<void>;
};

export default function ClientForm({
  client,
  submitLabel,
  onSubmit,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),

    defaultValues: {
      companyName: client?.companyName ?? "",
      contactName: client?.contactName ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      addressLine1: client?.addressLine1 ?? "",
      city: client?.city ?? "",
      state: client?.state ?? "",
      country: client?.country ?? "",
      postalCode: client?.postalCode ?? "",
      notes: client?.notes ?? "",
    },
  });

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Company Name"
          error={errors.companyName?.message}
        >
          <Input {...register("companyName")} />
        </Field>

        <Field
          label="Contact Name"
          error={errors.contactName?.message}
        >
          <Input {...register("contactName")} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Email"
          error={errors.email?.message}
        >
          <Input
            type="email"
            {...register("email")}
          />
        </Field>

        <Field
          label="Phone"
          error={errors.phone?.message}
        >
          <Input {...register("phone")} />
        </Field>
      </div>

      <Field
        label="Address"
        error={errors.addressLine1?.message}
      >
        <Input {...register("addressLine1")} />
      </Field>

      <div className="grid gap-4 md:grid-cols-4">
        <Field
          label="City"
          error={errors.city?.message}
        >
          <Input {...register("city")} />
        </Field>

        <Field
          label="State"
          error={errors.state?.message}
        >
          <Input {...register("state")} />
        </Field>

        <Field
          label="Country"
          error={errors.country?.message}
        >
          <Input {...register("country")} />
        </Field>

        <Field
          label="Postal Code"
          error={errors.postalCode?.message}
        >
          <Input {...register("postalCode")} />
        </Field>
      </div>

      <Field
        label="Notes"
        error={errors.notes?.message}
      >
        <Textarea
          rows={4}
          {...register("notes")}
        />
      </Field>

      <Button
        type="submit"
        disabled={isSubmitting}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

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
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label}
      </label>

      {children}

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}