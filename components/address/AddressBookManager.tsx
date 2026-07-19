"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
  MapPin,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import type { AddressKind } from "@/generated/prisma";
import type { AddressSummary, Party } from "@/types/booking";
import { listAddresses, deleteAddress, setDefaultAddress } from "@/actions/book/addresses";
import { AddressFormSheet } from "./AddressFormSheet";

const KIND_LABEL: Record<AddressKind, string> = {
  PICKUP: "Pickup",
  DELIVERY: "Delivery",
  BILLING: "Billing",
  OTHER: "Other",
};

const FILTERS: { value: AddressKind | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PICKUP", label: "Pickup" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "BILLING", label: "Billing" },
  { value: "OTHER", label: "Other" },
];

function addressLines(a: AddressSummary): string {
  return [a.line1, a.line2, a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

interface Props {
  party: Party;
}

export function AddressBookManager({ party }: Props) {
  const [addresses, setAddresses] = useState<AddressSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AddressKind | "ALL">("ALL");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AddressSummary | null>(null);
  const [toDelete, setToDelete] = useState<AddressSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const partyKey = party.partyType === "ORG" ? party.orgId : party.clientId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAddresses(party);
      if (res.ok) setAddresses(res.data);
    } finally {
      setLoading(false);
    }
    // partyKey captures the identity we re-fetch on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyKey]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "ALL" ? addresses : addresses.filter((a) => a.kind === filter)),
    [addresses, filter],
  );

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (a: AddressSummary) => {
    setEditing(a);
    setSheetOpen(true);
  };

  const handleSetDefault = async (a: AddressSummary) => {
    setBusyId(a.id);
    const res = await setDefaultAddress(a.id);
    setBusyId(null);
    if (res.ok) {
      toast.success("Primary address updated");
      load();
    } else {
      toast.error(res.error);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    const res = await deleteAddress(toDelete.id);
    setBusyId(null);
    setToDelete(null);
    if (res.ok) {
      toast.success("Address removed");
      load();
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === f.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add address
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted/30" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <MapPin className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {filter === "ALL" ? "No saved addresses yet" : `No ${KIND_LABEL[filter].toLowerCase()} addresses yet`}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Save the places you ship from and to. Then fill any booking in one
            tap instead of typing it out again.
          </p>
          <Button size="sm" variant="outline" className="mt-1" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add your first address
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((a) => (
            <div
              key={a.id}
              className={cn(
                "group relative rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20",
                busyId === a.id && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.label || a.contactName || "Saved address"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.kind && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {KIND_LABEL[a.kind]}
                      </Badge>
                    )}
                    {a.isDefault && (
                      <Badge className="gap-1 text-[10px] font-normal">
                        <Star className="h-2.5 w-2.5" />
                        Primary
                      </Badge>
                    )}
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                    >
                      {busyId === a.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => openEdit(a)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    {!a.isDefault && (
                      <DropdownMenuItem onClick={() => handleSetDefault(a)}>
                        <Star className="mr-2 h-3.5 w-3.5" />
                        Set as primary
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setToDelete(a)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {a.contactName && a.label ? `${a.contactName} · ` : ""}
                {addressLines(a)}
              </p>
              <p className="text-xs text-muted-foreground">{a.country}</p>
            </div>
          ))}
        </div>
      )}

      <AddressFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        party={party}
        editing={editing}
        defaultKind={filter === "ALL" ? undefined : filter}
        onSaved={load}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this address?</AlertDialogTitle>
            <AlertDialogDescription>
              It will no longer show up when you book. Shipments already booked
              with it are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
