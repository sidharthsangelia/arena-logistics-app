"use client";

/**
 * Who the invoice is for: a searchable picker over every party Arena has
 * billed, with "add a new one" inline.
 *
 * The inline create is the point. An off-platform customer usually does not
 * exist in the database when the invoice is being raised, and sending the admin
 * to a different screen to make one is where the five minutes would go. Typing a
 * name that matches nothing offers to create it, pre-filled with what was
 * typed, and the new party is selected the moment it saves.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECTABLE_GST_STATES } from "@/lib/invoices/tax/gst";
import { BillingPartyKind } from "@/generated/prisma";
import { partySubtitle } from "@/lib/invoices/manual/config";
import type {
  BillingPartyOption,
  CustomerSearchResult,
  CustomerSource,
} from "@/lib/invoices/manual/config";
import {
  adoptCustomerAction,
  createBillingPartyAction,
  searchInvoiceCustomersAction,
} from "@/actions/invoices/manualInvoices.action";

/**
 * Where a result came from, said in the admin's terms rather than the schema's.
 * Billing-list entries carry no tag at all: they are the default and the
 * unlabelled majority, and tagging every row would make the tag meaningless.
 */
const SOURCE_GROUPS: Array<{
  source: CustomerSource;
  heading: string;
  note: string | null;
}> = [
  { source: "PARTY", heading: "Your customers", note: null },
  {
    source: "ORG",
    heading: "Signed up on the platform",
    note: "Adds them to your customer list",
  },
  {
    source: "CLIENT",
    heading: "Business associates' clients",
    note: "Adds them to your customer list",
  },
];

export function BillingPartyPicker({
  value,
  onChange,
  disabled,
}: {
  value: BillingPartyOption | null;
  onChange: (party: BillingPartyOption) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<CustomerSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [adopting, setAdopting] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchInvoiceCustomersAction(query);
        // Ignore a stale request that resolved out of order.
        if (id === reqId.current) setOptions(res);
      } catch {
        if (id === reqId.current) setOptions([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  const typed = query.trim();

  /**
   * Selecting anything goes through adopt. For a customer already on the
   * billing list that is a plain read; for an org or a client it copies their
   * details into a billing party once and links the two. The admin does not
   * have to know which case they picked.
   */
  const select = React.useCallback(
    async (result: CustomerSearchResult) => {
      setAdopting(result.id);
      try {
        const adopted = await adoptCustomerAction(result.source, result.id);
        if (!adopted.ok) {
          toast.error(adopted.error);
          return;
        }
        onChange(adopted.data);
        setOpen(false);
        setQuery("");
        if (result.source !== "PARTY") {
          toast.success(`${adopted.data.legalName} added to your customers.`);
        }
      } finally {
        setAdopting(null);
      }
    },
    [onChange],
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "h-auto min-h-10 w-full justify-between py-2 font-normal",
              !value && "text-muted-foreground",
            )}
          >
            {value ? (
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span className="font-medium">{value.legalName}</span>
                <span className="text-xs text-muted-foreground">
                  {partySubtitle(value)}
                </span>
              </span>
            ) : (
              <span>Search customers, or add a new one</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Name, GSTIN, code or email"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching
                </div>
              ) : (
                <>
                  <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                    Nobody matches that, on the billing list or the platform.
                  </CommandEmpty>

                  {SOURCE_GROUPS.map((group) => {
                    const rows = options.filter(
                      (o) => o.source === group.source,
                    );
                    if (rows.length === 0) return null;

                    return (
                      <CommandGroup
                        key={group.source}
                        heading={
                          group.source === "PARTY" && !typed
                            ? "Recently invoiced"
                            : group.heading
                        }
                      >
                        {rows.map((option) => (
                          <CommandItem
                            key={`${option.source}:${option.id}`}
                            value={`${option.source}:${option.id}`}
                            disabled={adopting !== null}
                            onSelect={() => select(option)}
                          >
                            {adopting === option.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  value?.id === option.id
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                            )}
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate">{option.legalName}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {partySubtitle(option)}
                                {option.ownerName
                                  ? `  ·  client of ${option.ownerName}`
                                  : ""}
                              </span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    );
                  })}

                  <CommandGroup>
                    <CommandItem
                      value="__create"
                      onSelect={() => {
                        setOpen(false);
                        setCreating(true);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {typed ? `Add "${typed}" as a new customer` : "Add a new customer"}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <NewPartyDialog
        open={creating}
        onOpenChange={setCreating}
        initialName={typed}
        onCreated={(party) => {
          onChange(party);
          setCreating(false);
          setQuery("");
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const EMPTY_FORM = {
  kind: BillingPartyKind.BUSINESS as BillingPartyKind,
  legalName: "",
  tradeName: "",
  customerCode: "",
  gstin: "",
  pan: "",
  cin: "",
  contactName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  postalCode: "",
  country: "India",
  notes: "",
};

type PartyForm = typeof EMPTY_FORM;

/**
 * Only the name is required. Everything else can be filled in later from the
 * customer list, and blocking an invoice on a PAN nobody has to hand is how a
 * tool gets bypassed.
 *
 * ── A CUSTOMER IS NOT ALWAYS A COMPANY ──────────────────────────────────────
 * People ship things. Somebody sending forty kilos of personal effects to their
 * son in Toronto has no GSTIN, no CIN and no trading name, and still needs an
 * invoice. Nothing here or in the schema ever required those, but a form that
 * opens on "Legal name" and "GSTIN" reads as though it did, and the honest
 * reading of a form is the one people act on.
 *
 * So the first question is which kind of customer this is, and the rest of the
 * form answers to it. Choosing Individual does not unlock anything. It removes
 * questions that were never going to have answers.
 */
function NewPartyDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (party: BillingPartyOption) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Only the name is required. Everything else can be filled in later.
          </DialogDescription>
        </DialogHeader>

        {/* Radix unmounts DialogContent when closed, so the form's useState
            initialiser runs fresh on every open. That is why there is no
            reset-on-open effect here. */}
        <NewPartyForm
          initialName={initialName}
          onCancel={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewPartyForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (party: BillingPartyOption) => void;
}) {
  const [form, setForm] = React.useState<PartyForm>(() => ({
    ...EMPTY_FORM,
    legalName: initialName,
  }));
  const [saving, setSaving] = React.useState(false);

  const set = <K extends keyof PartyForm>(key: K, value: PartyForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const individual = form.kind === BillingPartyKind.INDIVIDUAL;

  // Reading the state out of the GSTIN as it is typed, so the admin sees the
  // consequence of the number rather than having to know it. An individual has
  // none, so their state is picked directly below instead.
  const gstinStateCode =
    !individual && form.gstin.trim().length >= 2
      ? form.gstin.trim().slice(0, 2)
      : null;
  const gstinState = SELECTABLE_GST_STATES.find(
    (s) => s.code === gstinStateCode,
  );

  async function submit() {
    if (!form.legalName.trim()) {
      toast.error("Enter the customer's name.");
      return;
    }

    setSaving(true);
    try {
      const result = await createBillingPartyAction({
        ...form,
        // Anything typed under Business and then switched away from is not
        // saved. A stray GSTIN on a person's record would print on their
        // invoice, and it belongs to whoever was being entered a minute ago.
        ...(individual
          ? { tradeName: "", gstin: "", cin: "" }
          : {}),
        stateCode: gstinState?.code ?? form.stateCode,
        state: form.state || gstinState?.name || "",
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(`${result.data.legalName} added.`);
      onCreated(result.data);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid max-h-[60vh] gap-4 overflow-y-auto px-1 py-1 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Customer is</Label>
            <div className="inline-flex w-fit rounded-lg border p-0.5">
              {[
                { kind: BillingPartyKind.BUSINESS, label: "A business" },
                { kind: BillingPartyKind.INDIVIDUAL, label: "An individual" },
              ].map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  aria-pressed={form.kind === option.kind}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    form.kind === option.kind
                      ? "bg-secondary font-medium text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => set("kind", option.kind)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="party-name">
              {individual ? "Full name" : "Legal name"}
            </Label>
            <Input
              id="party-name"
              autoFocus
              value={form.legalName}
              onChange={(e) => set("legalName", e.target.value)}
              placeholder={
                individual ? "Priya Raghunathan" : "Meridian Textiles Private Limited"
              }
            />
          </div>

          {individual ? null : (
            <div className="grid gap-2">
              <Label htmlFor="party-trade">Trading name</Label>
              <Input
                id="party-trade"
                value={form.tradeName}
                onChange={(e) => set("tradeName", e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="party-code">Customer code</Label>
            <Input
              id="party-code"
              value={form.customerCode}
              onChange={(e) => set("customerCode", e.target.value)}
              placeholder="Your accounting reference"
            />
          </div>

          {individual ? null : (
            <div className="grid gap-2">
              <Label htmlFor="party-gstin">GSTIN</Label>
              <Input
                id="party-gstin"
                value={form.gstin}
                onChange={(e) => set("gstin", e.target.value.toUpperCase())}
                placeholder="07AAECM4321K1Z9"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {gstinState
                  ? `Place of supply: ${gstinState.name}`
                  : "Optional. It sets the place of supply, which decides IGST against CGST and SGST."}
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="party-pan">PAN</Label>
            <Input
              id="party-pan"
              value={form.pan}
              onChange={(e) => set("pan", e.target.value.toUpperCase())}
              className="font-mono"
            />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="party-address">Address</Label>
            <Input
              id="party-address"
              value={form.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
              placeholder="Street, building"
            />
            <Input
              value={form.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
              placeholder="Area (optional)"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-city">City</Label>
            <Input
              id="party-city"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-postal">Postal code</Label>
            <Input
              id="party-postal"
              value={form.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
            />
          </div>

          {/* Only offered when the GSTIN has not already answered it. */}
          {gstinState ? null : (
            <div className="grid gap-2">
              <Label>State</Label>
              <Select
                value={form.stateCode}
                onValueChange={(code) => {
                  const match = SELECTABLE_GST_STATES.find(
                    (s) => s.code === code,
                  );
                  set("stateCode", code);
                  set("state", match?.name ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_GST_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="party-contact">Contact</Label>
            <Input
              id="party-contact"
              value={form.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-email">Email</Label>
            <Input
              id="party-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="Where the invoice gets sent"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="party-phone">Phone</Label>
            <Input
              id="party-phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="party-notes">Notes</Label>
            <Textarea
              id="party-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving
            </>
          ) : (
            "Add customer"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
