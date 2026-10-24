"use client";

import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import type { Client } from "@/generated/prisma";

import { cn } from "@/lib/utils";
import {
  ClientFormValues,
  clientSchema,
} from "@/lib/validations/clients.schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clientCompanyName, isIndividualClient } from "@/lib/clients/clientKind";

type Props = {
  /** aadhaarEncrypted is never loaded for the browser (see utils/db.ts). */
  client?: Omit<Client, "aadhaarEncrypted">;
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
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      companyKind: client && isIndividualClient(client) ? "INDIVIDUAL" : "COMPANY",
      companyName: client ? clientCompanyName(client) : "",
      contactName: client?.contactName ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      addressLine1: client?.addressLine1 ?? "",
      city: client?.city ?? "",
      state: client?.state ?? "",
      country: client?.country ?? "",
      postalCode: client?.postalCode ?? "",
      notes: client?.notes ?? "",
      gstin: client?.gstin ?? "",
      panNumber: client?.panNumber ?? "",
      // Never prefilled: only the masked form exists outside the server.
      aadhaarNumber: "",
    },
  });

  const kind = watch("companyKind") ?? "COMPANY";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
    >
      {/* Company or individual */}

      <Tabs
        value={kind}
        onValueChange={(v) =>
          setValue("companyKind", v as "COMPANY" | "INDIVIDUAL", { shouldValidate: false })
        }
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="COMPANY">Company</TabsTrigger>
          <TabsTrigger value="INDIVIDUAL">Individual</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Name first, then the company it belongs to */}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label={kind === "INDIVIDUAL" ? "Full Name" : "Contact Person"}
          error={errors.contactName?.message}
        >
          <Input
            placeholder="John Doe"
            className={cn(errors.contactName && "border-destructive")}
            {...register("contactName")}
          />
        </Field>

        {kind === "COMPANY" && (
          <Field
            label="Company Name"
            error={errors.companyName?.message}
          >
            <Input
              placeholder="Acme Logistics Pvt Ltd"
              className={cn(errors.companyName && "border-destructive")}
              {...register("companyName")}
            />
          </Field>
        )}
      </div>

      {/* Email + Phone */}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Email"
          error={errors.email?.message}
        >
          <Input
            type="email"
            placeholder="john@company.com"
            className={cn(errors.email && "border-destructive")}
            {...register("email")}
          />
        </Field>

        <Field
          label="Phone"
          error={errors.phone?.message}
        >
          <Input
            placeholder="+91 9876543210"
            className={cn(errors.phone && "border-destructive")}
            {...register("phone")}
          />
        </Field>
      </div>

      {/* Address */}

      <Field
        label="Address"
        error={errors.addressLine1?.message}
      >
        <Input
          placeholder="Street address"
          className={cn(errors.addressLine1 && "border-destructive")}
          {...register("addressLine1")}
        />
      </Field>

      {/* Location */}

      <div className="grid grid-cols-4 gap-3">
        <Field
          label="City"
          error={errors.city?.message}
        >
          <Input
            placeholder="Mumbai"
            className={cn(errors.city && "border-destructive")}
            {...register("city")}
          />
        </Field>

        <Field
          label="State"
          error={errors.state?.message}
        >
          <Input
            placeholder="Maharashtra"
            className={cn(errors.state && "border-destructive")}
            {...register("state")}
          />
        </Field>

        <Field
          label="Country"
          error={errors.country?.message}
        >
          <Input
            placeholder="India"
            className={cn(errors.country && "border-destructive")}
            {...register("country")}
          />
        </Field>

        <Field
          label="Postal Code"
          error={errors.postalCode?.message}
        >
          <Input
            placeholder="400001"
            className={cn(errors.postalCode && "border-destructive")}
            {...register("postalCode")}
          />
        </Field>
      </div>

      {/* Identity numbers (optional) */}

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium">
            Identity numbers
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              optional
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Carriers need these on international bookings: GSTIN for a
            company, Aadhaar for an individual.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="GSTIN" error={errors.gstin?.message}>
            <Input
              placeholder="07ABCDE1234F1Z5"
              maxLength={15}
              autoComplete="off"
              className={cn("font-mono uppercase", errors.gstin && "border-destructive")}
              {...register("gstin")}
            />
          </Field>

          <Field label="PAN" error={errors.panNumber?.message}>
            <Input
              placeholder="ABCDE1234F"
              maxLength={10}
              autoComplete="off"
              className={cn("font-mono uppercase", errors.panNumber && "border-destructive")}
              {...register("panNumber")}
            />
          </Field>

          <Field label="Aadhaar" error={errors.aadhaarNumber?.message}>
            <Input
              inputMode="numeric"
              placeholder={client?.aadhaarMasked ?? "1234 5678 9012"}
              maxLength={14}
              autoComplete="off"
              className={cn("font-mono", errors.aadhaarNumber && "border-destructive")}
              {...register("aadhaarNumber")}
            />
            <p className="text-xs text-muted-foreground">
              {client?.aadhaarMasked
                ? "On file. Leave blank to keep it."
                : "Stored encrypted."}
            </p>
          </Field>
        </div>
      </div>

      {/* Notes */}

      <Field
        label="Internal Notes"
        error={errors.notes?.message}
      >
        <Textarea
          rows={3}
          placeholder="Additional information about this client..."
          className={cn(
            "resize-none",
            errors.notes && "border-destructive"
          )}
          {...register("notes")}
        />
      </Field>

      {/* Footer */}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {submitLabel}
        </Button>
      </div>
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
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}
      </label>

      {children}

      {error && (
        <p className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}