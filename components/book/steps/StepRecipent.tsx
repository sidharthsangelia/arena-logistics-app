"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Loader2, User, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { createClient } from "@/lib/actions/clients";
import { newClientSchema, type NewClientInput } from "@/lib/validations/booking";
import { CompanyKind } from "@/generated/prisma";

import { ClientCombobox } from "./ClientComboBox";
import { ClientSummary } from "@/types/booking";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecipientMode = "self" | "existing-client" | "new-client";

export interface RecipientStepData {
  mode: RecipientMode;
  clientId: string | null;
  clientSummary: ClientSummary | null;
}

interface StepRecipientProps {
  defaultValues?: Partial<RecipientStepData>;
  onComplete: (data: RecipientStepData) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepRecipient({ defaultValues, onComplete }: StepRecipientProps) {
  const [mode, setMode] = useState<RecipientMode>(defaultValues?.mode ?? "self");
  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(
    defaultValues?.clientSummary ?? null,
  );

  const handleContinue = () => {
    if (mode === "self") {
      onComplete({ mode: "self", clientId: null, clientSummary: null });
      return;
    }
    if (mode === "existing-client") {
      if (!selectedClient) {
        toast.error("Search for and select a client to continue.");
        return;
      }
      onComplete({
        mode: "existing-client",
        clientId: selectedClient.id,
        clientSummary: selectedClient,
      });
    }
    // "new-client" submits through <NewClientForm> directly
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">Who is this shipment for?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Book for your own organisation or on behalf of a client.
        </p>
      </div>

      <RadioGroup
        value={mode}
        onValueChange={(v) => {
          setMode(v as RecipientMode);
          setSelectedClient(null);
        }}
        className="space-y-2.5"
      >
        <RecipientCard
          id="self"
          icon={User}
          title="My organisation"
          description="Ship goods belonging to your own entity. KYC and wallet belong to your account."
          selected={mode === "self"}
        />
        <RecipientCard
          id="existing-client"
          icon={Users}
          title="An existing client"
          description="Book on behalf of a client you've already onboarded."
          selected={mode === "existing-client"}
        />
        <RecipientCard
          id="new-client"
          icon={UserPlus}
          title="A new client"
          description="Create a new client profile and book their first shipment."
          selected={mode === "new-client"}
        />
      </RadioGroup>

      {/* ── Existing client search ─────────────────── */}
      {mode === "existing-client" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Search for client</Label>
          <ClientCombobox
            value={selectedClient}
            onChange={setSelectedClient}
          />
          {selectedClient && (
            <p className="text-xs text-muted-foreground">
              Selected:{" "}
              <span className="font-medium text-foreground">{selectedClient.companyName}</span>
              {selectedClient.companyKind === CompanyKind.INDIVIDUAL && " (Individual)"}
            </p>
          )}
        </div>
      )}

      {/* ── New client inline form ─────────────────── */}
      {mode === "new-client" && (
        <NewClientForm
          onCreated={(client) =>
            onComplete({ mode: "new-client", clientId: client.id, clientSummary: client })
          }
        />
      )}

      {/* ── Continue button (self + existing) ──────── */}
      {mode !== "new-client" && (
        <Button className="w-full" onClick={handleContinue}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ─── Mode card ─────────────────────────────────────────────────────────────────

function RecipientCard({
  id,
  icon: Icon,
  title,
  description,
  selected,
}: {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition-all",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "hover:border-slate-400 hover:bg-muted/20",
      )}
    >
      <RadioGroupItem id={id} value={id} className="mt-0.5 shrink-0" />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium leading-tight">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
    </Label>
  );
}

// ─── New client form ──────────────────────────────────────────────────────────

function NewClientForm({ onCreated }: { onCreated: (client: ClientSummary) => void }) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewClientInput>({
    resolver: zodResolver(newClientSchema),
    defaultValues: { companyKind: CompanyKind.COMPANY },
  });

  const companyKind = watch("companyKind");

  const onSubmit = (data: NewClientInput) => {
    startTransition(async () => {
      const result = await createClient(data);
      if (result.ok) {
        toast.success(`Client "${result.data.companyName}" created.`);
        onCreated(result.data);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-xl border bg-muted/20 p-4"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        New client details
      </p>

      <div>
        <Label className="mb-1.5 block text-xs">Company / client name *</Label>
        <Input
          {...register("companyName")}
          placeholder="Acme Exports Pvt. Ltd."
          className="h-9 text-sm"
        />
        {errors.companyName && (
          <p className="mt-1 text-xs text-destructive">{errors.companyName.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block text-xs">Contact name</Label>
          <Input
            {...register("contactName")}
            placeholder="Rahul Sharma"
            className="h-9 text-sm"
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Phone</Label>
          <Input
            {...register("phone")}
            placeholder="+91 98765 43210"
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block text-xs">Email</Label>
          <Input
            {...register("email")}
            type="email"
            placeholder="rahul@acme.com"
            className="h-9 text-sm"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Entity type *</Label>
          <Select
            value={companyKind}
            onValueChange={(v) => setValue("companyKind", v as CompanyKind)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CompanyKind.INDIVIDUAL}>Individual / Sole proprietor</SelectItem>
              <SelectItem value={CompanyKind.COMPANY}>Company / Partnership / LLP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating client…
          </>
        ) : (
          <>
            Create &amp; continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}