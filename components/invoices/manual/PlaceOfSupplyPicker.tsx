"use client";

/**
 * Where the supply is treated as made, which is the field that decides whether
 * this invoice carries IGST or a CGST/SGST split.
 *
 * ── WHY A COMBOBOX AND NOT THE SELECT IT WAS ────────────────────────────────
 * Thirty-eight states and territories in one unsearchable list is a scroll, and
 * the code matters as much as the name: an admin filing a return knows they
 * want 06 more often than they know how far down Haryana sits. Typing either
 * half finds the row, so "06", "har" and "Haryana" all land in the same place.
 *
 * ── CLOSED, UNLIKE EVERY OTHER PICKER IN THIS FOLDER ────────────────────────
 * The forwarder, the product, the service and the charge all take free text,
 * because their vocabularies are Arena's own and grow. This one does not: the
 * state codes are the government's, GSTR-1 accepts exactly these values, and a
 * typed-in "Haryana " with a trailing space is an invoice that files nowhere.
 * So there is no free-text row here on purpose.
 */

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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
import {
  OUTSIDE_INDIA,
  SELECTABLE_GST_STATES,
  type GstState,
} from "@/lib/invoices/tax/gst";

export function PlaceOfSupplyPicker({
  value,
  international,
  disabled,
  onChange,
}: {
  /** A GST state code, or "" for not yet decided. */
  value: string;
  /**
   * Whether to offer code 96. It is not a state and is not in
   * SELECTABLE_GST_STATES for that reason; it is what GSTR-1 wants in this
   * column on an export, and it is meaningful nowhere else.
   */
  international: boolean;
  disabled?: boolean;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const options = React.useMemo<GstState[]>(
    () =>
      international
        ? [OUTSIDE_INDIA, ...SELECTABLE_GST_STATES]
        : [...SELECTABLE_GST_STATES],
    [international],
  );

  const needle = query.trim().toLowerCase();
  const matches = options.filter(
    (s) =>
      !needle ||
      s.name.toLowerCase().includes(needle) ||
      s.code.includes(needle),
  );

  const chosen = options.find((s) => s.code === value);
  const label = (s: GstState) =>
    s.code === OUTSIDE_INDIA.code ? `96  ${s.name} (export)` : `${s.code}  ${s.name}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-56 justify-between px-2 font-normal",
            !chosen && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {chosen ? label(chosen) : "Pick a state or territory"}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="State or code"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              No state or code matches that.
            </CommandEmpty>
            <CommandGroup>
              {matches.map((s) => (
                <CommandItem
                  key={s.code}
                  value={s.code}
                  onSelect={() => {
                    onChange(s.code);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5 shrink-0",
                      value === s.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{label(s)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
