"use client";

/**
 * The charge description cell: a combobox over the whole catalog.
 *
 * The catalog is fetched ONCE for the page and filtered in the browser. Forty
 * or so rows is a few kilobytes and typing is the slow part of this form; a
 * debounced round trip per keystroke would make the fastest field the one that
 * waits. It also means the picker still works with the list open while an
 * amount is being typed beside it.
 *
 * Anything typed that matches nothing is still accepted as a free label, and
 * offered as "add to the catalog" so the next invoice finds it. Refusing an
 * unknown charge would send the admin somewhere else mid-invoice, which is
 * exactly the interruption this whole screen exists to avoid.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { ShipmentMode } from "@/generated/prisma";
import { ChargeApplicability } from "@/generated/prisma";
import type { ChargeTypeOption } from "@/lib/invoices/manual/config";
import { createChargeTypeAction } from "@/actions/invoices/manualInvoices.action";

/**
 * How well a charge fits the invoice being raised. This ORDERS the list; it
 * never filters it. A charge marked international still appears on a domestic
 * invoice, just below the ones that belong there. A catalog that refuses to let
 * you bill something is a catalog people work around.
 */
function relevance(type: ChargeTypeOption, mode: ShipmentMode): number {
  if (type.applicability === ChargeApplicability.ANY) return 1;
  if (
    mode === ShipmentMode.DOMESTIC &&
    type.applicability === ChargeApplicability.DOMESTIC
  ) {
    return 0;
  }
  if (
    mode === ShipmentMode.INTERNATIONAL &&
    (type.applicability === ChargeApplicability.INTERNATIONAL ||
      type.applicability === ChargeApplicability.AIR ||
      type.applicability === ChargeApplicability.SEA)
  ) {
    return 0;
  }
  return 2;
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function ChargePicker({
  value,
  catalog,
  mode,
  onPick,
  onFreeText,
  onCatalogAdd,
  autoFocus,
}: {
  value: string;
  catalog: ChargeTypeOption[];
  mode: ShipmentMode;
  /** A row from the catalog: brings its SAC, rate and reimbursement flag. */
  onPick: (type: ChargeTypeOption) => void;
  /** A label with no catalog row behind it. */
  onFreeText: (label: string) => void;
  /** A newly created catalog row, so the parent can refresh its copy. */
  onCatalogAdd: (type: ChargeTypeOption) => void;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const typed = query.trim();

  const filtered = React.useMemo(() => {
    const needle = typed.toLowerCase();
    return catalog
      .filter(
        (type) =>
          !needle ||
          type.label.toLowerCase().includes(needle) ||
          type.code.includes(needle) ||
          (type.description?.toLowerCase().includes(needle) ?? false),
      )
      .sort(
        (a, b) =>
          relevance(a, mode) - relevance(b, mode) ||
          a.sortOrder - b.sortOrder ||
          a.label.localeCompare(b.label),
      )
      .slice(0, 40);
  }, [catalog, typed, mode]);

  const exact = catalog.some(
    (type) => type.label.toLowerCase() === typed.toLowerCase(),
  );

  async function addToCatalog() {
    if (!typed) return;
    setAdding(true);
    try {
      const result = await createChargeTypeAction({
        code: slugify(typed),
        label: typed,
        description: null,
        sacCode: "996812",
        defaultRatePercent: 18,
        defaultReimbursement: false,
        applicability: ChargeApplicability.ANY,
        sortOrder: 500,
      });

      if (!result.ok) {
        // Still usable on this invoice: the label is accepted either way, and
        // only the catalog entry failed.
        toast.error(result.error);
        onFreeText(typed);
        setOpen(false);
        return;
      }

      onCatalogAdd(result.data);
      onPick(result.data);
      toast.success(`"${typed}" added to the charge list.`);
      setOpen(false);
      setQuery("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          autoFocus={autoFocus}
          aria-expanded={open}
          className={cn(
            "h-8 w-full justify-between px-2 font-normal hover:bg-muted/60",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value || "Click to add a charge"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Freight, fuel, AHS, duty…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              Nothing in the list matches.
            </CommandEmpty>

            {filtered.length > 0 ? (
              <CommandGroup>
                {filtered.map((type) => (
                  <CommandItem
                    key={type.id}
                    value={type.id}
                    onSelect={() => {
                      onPick(type);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === type.label ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{type.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        SAC {type.sacCode}
                        {type.defaultReimbursement
                          ? "  ·  paid on the customer's behalf"
                          : `  ·  ${type.defaultRatePercent}% GST`}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {typed && !exact ? (
              <CommandGroup heading="Not in the list">
                <CommandItem
                  value="__freetext"
                  onSelect={() => {
                    onFreeText(typed);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  Use &ldquo;{typed}&rdquo; on this invoice only
                </CommandItem>
                <CommandItem
                  value="__addcatalog"
                  disabled={adding}
                  onSelect={addToCatalog}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add &ldquo;{typed}&rdquo; to the charge list
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
