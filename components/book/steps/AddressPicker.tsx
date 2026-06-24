"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Loader2, MapPin, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
 
import { newAddressSchema, type NewAddressInput } from "@/types/validations/booking";
import type { Party, AddressSummary } from "@/types/booking";
import type { AddressKind } from "@/generated/prisma";
import { createAddress, listAddresses } from "@/actions/book/addresses";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAddressLine(addr: AddressSummary): string {
  return [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode]
    .filter(Boolean)
    .join(", ");
}

// ─── Public component ─────────────────────────────────────────────────────────

interface AddressPickerProps {
  party: Party;
  /** Pass null to create addresses without a specific kind tag. */
  kind: AddressKind | null;
  value: string | null;
  onChange: (addressId: string) => void;
  disabled?: boolean;
}

export function AddressPicker({
  party,
  kind,
  value,
  onChange,
  disabled,
}: AddressPickerProps) {
  const [addresses, setAddresses] = useState<AddressSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    listAddresses(party, kind ?? undefined).then((result) => {
      if (result.ok) setAddresses(result.data);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreated = (addr: AddressSummary) => {
    setAddresses((prev) => [addr, ...prev.filter((a) => a.id !== addr.id)]);
    onChange(addr.id);
    setDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {addresses.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          No saved addresses yet — add one below.
        </p>
      )}

      <div className="space-y-2">
        {addresses.map((addr) => {
          const selected = addr.id === value;
          return (
            <button
              key={addr.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(addr.id)}
              className={cn(
                "w-full rounded-xl border px-3.5 py-3 text-left transition-all",
                "flex items-start gap-3",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:border-slate-400 hover:bg-muted/20",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {/* Radio indicator */}
              <div
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  selected ? "border-primary bg-primary" : "border-slate-300",
                )}
              >
                {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
              </div>

              {/* Address details */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {addr.contactName && (
                    <span className="text-sm font-medium">{addr.contactName}</span>
                  )}
                  {addr.label && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      {addr.label}
                    </Badge>
                  )}
                  {addr.isDefault && (
                    <Badge
                      variant="outline"
                      className="h-4 border-primary/40 px-1.5 text-[10px] text-primary"
                    >
                      Default
                    </Badge>
                  )}
                </div>
                {addr.contactPhone && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{addr.contactPhone}</p>
                )}
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  <MapPin className="mr-1 inline h-3 w-3" />
                  {formatAddressLine(addr)}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={disabled}
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add new address
      </Button>

      <AddAddressDialog
        party={party}
        kind={kind}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ─── Add-address dialog ───────────────────────────────────────────────────────

interface AddAddressDialogProps {
  party: Party;
  kind: AddressKind | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (addr: AddressSummary) => void;
}

function AddAddressDialog({
  party,
  kind,
  open,
  onOpenChange,
  onCreated,
}: AddAddressDialogProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewAddressInput>({
    resolver: zodResolver(newAddressSchema),
    defaultValues: { isDefault: false, country: "India" },
  });

  const isDefault = watch("isDefault");

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const onSubmit = (data: NewAddressInput) => {
    startTransition(async () => {
      const result = await createAddress(party, kind, data);
      if (result.ok) {
        toast.success("Address saved.");
        reset();
        onCreated(result.data);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new address</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Contact name *</Label>
              <Input
                {...register("contactName")}
                placeholder="Full name"
                className="h-9 text-sm"
              />
              {errors.contactName && (
                <p className="mt-1 text-xs text-destructive">{errors.contactName.message}</p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Phone *</Label>
              <Input
                {...register("contactPhone")}
                placeholder="+91 98765 43210"
                className="h-9 text-sm"
              />
              {errors.contactPhone && (
                <p className="mt-1 text-xs text-destructive">{errors.contactPhone.message}</p>
              )}
            </div>
          </div>

          {/* Address lines */}
          <div>
            <Label className="mb-1.5 block text-xs">Address line 1 *</Label>
            <Input
              {...register("line1")}
              placeholder="Street, building, floor"
              className="h-9 text-sm"
            />
            {errors.line1 && (
              <p className="mt-1 text-xs text-destructive">{errors.line1.message}</p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-xs">Address line 2</Label>
            <Input
              {...register("line2")}
              placeholder="Landmark, area (optional)"
              className="h-9 text-sm"
            />
          </div>

          {/* City / State */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">City *</Label>
              <Input {...register("city")} placeholder="Mumbai" className="h-9 text-sm" />
              {errors.city && (
                <p className="mt-1 text-xs text-destructive">{errors.city.message}</p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">State / Province</Label>
              <Input {...register("state")} placeholder="Maharashtra" className="h-9 text-sm" />
            </div>
          </div>

          {/* Country / Postal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Country *</Label>
              <Input {...register("country")} placeholder="India" className="h-9 text-sm" />
              {errors.country && (
                <p className="mt-1 text-xs text-destructive">{errors.country.message}</p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Postal / ZIP code *</Label>
              <Input {...register("postalCode")} placeholder="400001" className="h-9 text-sm" />
              {errors.postalCode && (
                <p className="mt-1 text-xs text-destructive">{errors.postalCode.message}</p>
              )}
            </div>
          </div>

          {/* Label */}
          <div>
            <Label className="mb-1.5 block text-xs">Label (optional)</Label>
            <Input
              {...register("label")}
              placeholder="e.g. Head Office, Warehouse B"
              className="h-9 text-sm"
            />
          </div>

          {/* Default */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="addr-isDefault"
              checked={isDefault}
              onCheckedChange={(checked) => setValue("isDefault", Boolean(checked))}
            />
            <label htmlFor="addr-isDefault" className="cursor-pointer text-sm">
              Set as default address
            </label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save address"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}