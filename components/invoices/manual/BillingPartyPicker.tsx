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
 *
 * The form itself lives in BillingPartyDialog, shared with the customers page,
 * because correcting a customer asks exactly the same questions as creating one
 * and two copies would eventually disagree about how a GSTIN sets the place of
 * supply.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { partySubtitle } from "@/lib/invoices/manual/config";
import type {
  BillingPartyOption,
  CustomerSearchResult,
  CustomerSource,
} from "@/lib/invoices/manual/config";
import {
  adoptCustomerAction,
  searchInvoiceCustomersAction,
} from "@/actions/invoices/manualInvoices.action";
import { BillingPartyDialog } from "./BillingPartyDialog";

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

      <BillingPartyDialog
        open={creating}
        onOpenChange={setCreating}
        initialName={typed}
        onSaved={(party) => {
          onChange(party);
          setCreating(false);
          setQuery("");
        }}
      />
    </>
  );
}
