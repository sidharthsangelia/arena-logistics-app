"use client";

/**
 * What was actually done for the customer, as a combobox over two lists.
 *
 * ── WHERE THE SUGGESTIONS COME FROM ─────────────────────────────────────────
 *   Used before   Every service description already typed on a manual invoice,
 *                 most used first, read straight off the consignments. See
 *                 listServiceTypes. Nothing has to be registered anywhere for a
 *                 service to appear here: typing it once is what puts it in.
 *   Common        The curated list in config.ts, filtered to the invoice type.
 *                 This is what a brand new install has before anyone has typed
 *                 anything at all.
 *
 * A service typed on the consignment above shows up in the first group
 * immediately, so a three-leg invoice spells its service the same way three
 * times without anyone having to remember how they spelled it.
 *
 * ── TYPED TEXT ALWAYS WINS ──────────────────────────────────────────────────
 * Anything typed that matches nothing is offered as its own row and saved as
 * written. There is no catalog to refuse it and no settings detour to take
 * first, which is the same rule the charge picker follows for the same reason:
 * a picker that cannot express what happened is a picker people work around.
 *
 * The free-text row is LAST when there are matches and the only row when there
 * are not, so Enter does the obvious thing either way: it takes the match if
 * there is one and takes what you typed if there is not.
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
import type { ShipmentMode } from "@/generated/prisma";
import { servicesFor } from "@/lib/invoices/manual/config";

export function ServicePicker({
  value,
  mode,
  history,
  disabled,
  onChange,
}: {
  value: string;
  mode: ShipmentMode;
  /** Services already used, most used first. Merged with the curated list. */
  history: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const typed = query.trim();
  const needle = typed.toLowerCase();

  const { used, common } = React.useMemo(() => {
    const match = (label: string) =>
      !needle || label.toLowerCase().includes(needle);

    const usedList = history.filter(match).slice(0, 12);
    const seen = new Set(usedList.map((label) => label.toLowerCase()));

    return {
      used: usedList,
      // Never offer the same wording twice. A service that is both curated and
      // already used belongs in the group that says somebody chose it.
      common: servicesFor(mode)
        .map((s) => s.label)
        .filter((label) => match(label) && !seen.has(label.toLowerCase())),
    };
  }, [history, mode, needle]);

  const exact = [...used, ...common].some(
    (label) => label.toLowerCase() === needle,
  );

  const pick = React.useCallback(
    (label: string) => {
      onChange(label);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  const row = (label: string) => (
    <CommandItem key={label} value={label} onSelect={() => pick(label)}>
      <Check
        className={cn(
          "mr-2 h-3.5 w-3.5 shrink-0",
          value === label ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="truncate">{label}</span>
    </CommandItem>
  );

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
            "h-8 w-full justify-between px-2 font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value || "Air freight"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type or pick a service"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              Type what was done.
            </CommandEmpty>

            {used.length > 0 ? (
              <CommandGroup heading="Used before">{used.map(row)}</CommandGroup>
            ) : null}

            {common.length > 0 ? (
              <CommandGroup heading="Common">{common.map(row)}</CommandGroup>
            ) : null}

            {typed && !exact ? (
              <CommandGroup heading="Not in the list">
                <CommandItem value="__freetext" onSelect={() => pick(typed)}>
                  Use &ldquo;{typed}&rdquo;
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
