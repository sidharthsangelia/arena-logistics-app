"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Path, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { BookMarked, Loader2, Plus, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { AddressKind } from "@/generated/prisma";
import type { BookingFormData } from "@/types/booking.types";
import type { AddressSummary, Party } from "@/types/booking";
import { listAddresses, createAddress } from "@/actions/book/addresses";

// One documented cast point — RHF's Path<T> can't infer the template-literal
// prefix, but consignor / pickup / consignee / billing share one address shape.
type AddressPrefix = "consignor" | "pickup" | "consignee" | "billing";
function fieldPath(prefix: AddressPrefix, key: string): Path<BookingFormData> {
  return `${prefix}.${key}` as Path<BookingFormData>;
}

// How many chips show inline before the rest fold into a searchable "More" menu.
const MAX_INLINE_CHIPS = 4;

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

function addressChipLabel(a: AddressSummary): string {
  return (
    a.label ||
    [a.contactName, a.city].filter(Boolean).join(", ") ||
    [a.line1, a.city].filter(Boolean).join(", ") ||
    "Saved address"
  );
}

// Everything a user might type to find this entry — cmdk filters on this string.
function addressSearchText(a: AddressSummary): string {
  return [
    a.label,
    a.contactName,
    a.contactEmail,
    a.contactPhone,
    a.line1,
    a.line2,
    a.city,
    a.state,
    a.postalCode,
    a.country,
  ]
    .filter(Boolean)
    .join(" ");
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
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [moreOpen, setMoreOpen] = useState(false);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addressName, setAddressName] = useState("");

  const forClient = party.partyType === "CLIENT";

  // Key the party into the effect via its id so re-fetches happen when a BA
  // switches which client they're booking for.
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
    setSelectedId(a.id);
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

  const inlineChips = useMemo(() => saved.slice(0, MAX_INLINE_CHIPS), [saved]);
  const overflow = saved.length > MAX_INLINE_CHIPS;

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
        toast.success(
          forClient
            ? "Saved to this client's address book"
            : "Saved to your address book",
        );
        setSaveOpen(false);
        setAddressName("");
        await load();
      } else {
        toast.error(res.error || "We couldn't save this address. Check the fields and try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const bookLabel = forClient ? "this client's address book" : "your address book";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookMarked className="h-3.5 w-3.5" />
        {loading ? "Loading saved…" : saved.length > 0 ? "Use a saved one" : "Address book"}
      </span>

      {/* Inline chips */}
      {!loading &&
        inlineChips.map((a) => {
          const active = selectedId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => applyAddress(a)}
              className={cn(
                "inline-flex max-w-56 items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary/5 text-foreground"
                  : "hover:bg-muted",
              )}
            >
              {active && <Check className="h-3 w-3 shrink-0 text-primary" />}
              <span className="truncate">{addressChipLabel(a)}</span>
            </button>
          );
        })}

      {/* Overflow → searchable menu */}
      {!loading && overflow && (
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {saved.length - MAX_INLINE_CHIPS} more
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder={`Search saved ${noun}s`} />
              <CommandList>
                <CommandEmpty>No matches.</CommandEmpty>
                <CommandGroup>
                  {saved.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={`${addressSearchText(a)} ${a.id}`}
                      onSelect={() => {
                        applyAddress(a);
                        setMoreOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          selectedId === a.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{addressChipLabel(a)}</span>
                        {(a.contactName || a.city) && (
                          <span className="truncate text-xs text-muted-foreground">
                            {[a.contactName, a.city, a.postalCode].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {/* Save current form values to the book */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                const v = (watch(prefix as Path<BookingFormData>) ?? {}) as BookingFormData["consignor"];
                setAddressName(v.contactName ?? "");
                setSaveOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Save this {noun}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Save the details below to {bookLabel}. Next time you can fill this
            whole section with one tap instead of typing it again. Saved
            securely and ready across all your bookings.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this {noun}</DialogTitle>
            <DialogDescription>
              Give it a short name so you can find and reuse it in one tap. It
              goes to {bookLabel}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="address-name">Nickname</Label>
            <Input
              id="address-name"
              value={addressName}
              onChange={(e) => setAddressName(e.target.value)}
              placeholder="Head office, Warehouse 2, Mom's place"
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
                  Saving
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
