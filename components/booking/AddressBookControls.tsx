"use client";

import { useCallback, useEffect, useState } from "react";
import type { Path, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { BookMarked, Loader2, Plus, Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { AddressKind } from "@/generated/prisma";
import type { BookingFormData } from "@/types/booking.types";
import type { AddressSummary, Party } from "@/types/booking";
import { listAddresses, createAddress } from "@/actions/book/addresses";

// One documented cast point — RHF's Path<T> can't infer the template-literal
// prefix, but consignor/pickup/consignee all share the same address shape.
type AddressPrefix = "consignor" | "pickup" | "consignee";
function fieldPath(prefix: AddressPrefix, key: string): Path<BookingFormData> {
  return `${prefix}.${key}` as Path<BookingFormData>;
}

interface Props {
  /** Whose address book to read from / save into (org or a BA's client). */
  party: Party;
  /** Default type applied to a newly saved entry. */
  kind: AddressKind;
  /** Which address block on the form this controls. */
  prefix: AddressPrefix;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  /** Human label for copy, e.g. "sender" / "pickup". */
  noun?: string;
}

function addressOneLiner(a: AddressSummary): string {
  return (
    a.label ||
    [a.line1, a.city, a.postalCode].filter(Boolean).join(", ") ||
    "Saved address"
  );
}

export function AddressBookControls({
  party,
  kind,
  prefix,
  watch,
  setValue,
  noun = "address",
}: Props) {
  const [saved, setSaved] = useState<AddressSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addressName, setAddressName] = useState("");

  // Key the party into the effect via its identifying id so re-fetches happen
  // when the BA switches which client they're booking for.
  const partyKey = party.partyType === "ORG" ? party.orgId : party.clientId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAddresses(party);
      if (res.ok) setSaved(res.data);
    } finally {
      setLoading(false);
    }
    // party is reconstructed each render; partyKey captures the identity we care about
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyKey]);

  useEffect(() => {
    load();
  }, [load]);

  const applyAddress = (a: AddressSummary) => {
    setValue(fieldPath(prefix, "contactName"), a.contactName ?? "", { shouldValidate: true });
    // Address book carries no company field — leave whatever's typed intact.
    setValue(fieldPath(prefix, "email"), a.contactEmail ?? "", { shouldValidate: true });
    setValue(fieldPath(prefix, "phone"), a.contactPhone ?? "", { shouldValidate: true });
    setValue(fieldPath(prefix, "country"), a.country, { shouldValidate: true });
    setValue(fieldPath(prefix, "postalCode"), a.postalCode, { shouldValidate: true });
    setValue(fieldPath(prefix, "city"), a.city, { shouldValidate: true });
    setValue(fieldPath(prefix, "state"), a.state ?? "", { shouldValidate: true });
    setValue(fieldPath(prefix, "addressLine1"), a.line1, { shouldValidate: true });
    setValue(fieldPath(prefix, "addressLine2"), a.line2 ?? "", { shouldValidate: true });
  };

  const handlePick = (id: string) => {
    setSelectedId(id);
    const a = saved.find((x) => x.id === id);
    if (a) applyAddress(a);
  };

  const handleSave = async () => {
    const v = (watch(prefix as Path<BookingFormData>) ?? {}) as BookingFormData["consignor"];
    setSaving(true);
    try {
      const res = await createAddress(party, kind, {
        label: addressName.trim() || v.contactName || "",
        contactName: v.contactName,
        contactPhone: v.phone,
        contactEmail: v.email,
        line1: v.addressLine1,
        line2: v.addressLine2,
        city: v.city,
        state: v.state,
        country: v.country,
        postalCode: v.postalCode,
        isDefault: false,
      });

      if (res.ok) {
        toast.success("Saved to your address book");
        setSaveOpen(false);
        setAddressName("");
        await load();
      } else {
        toast.error(res.error || "Couldn't save this address. Check the fields and try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="w-full sm:max-w-xs">
        <Label className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BookMarked className="h-3.5 w-3.5" />
          Use a saved {noun}
        </Label>
        <Select
          value={selectedId}
          onValueChange={handlePick}
          disabled={loading || saved.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={
                loading
                  ? "Loading…"
                  : saved.length === 0
                    ? "No saved addresses yet"
                    : "Select from address book"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {saved.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {addressOneLiner(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const v = (watch(prefix as Path<BookingFormData>) ?? {}) as BookingFormData["consignor"];
          setAddressName(v.contactName ?? "");
          setSaveOpen(true);
        }}
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Save to address book
      </Button>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this {noun} to your address book</DialogTitle>
            <DialogDescription>
              Give it a name so you can reuse it next time without re-typing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="address-name">Address name</Label>
            <Input
              id="address-name"
              value={addressName}
              onChange={(e) => setAddressName(e.target.value)}
              placeholder="e.g. Head office, Warehouse 2"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSaveOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
