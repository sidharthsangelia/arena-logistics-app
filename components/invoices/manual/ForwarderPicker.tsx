"use client";

/**
 * Who carried it, and under what product. Two comboboxes, one file, because
 * they are one decision: the product list depends on the forwarder above it,
 * and splitting them across two components meant passing the forwarder back
 * down as a prop to a sibling that only existed to read it.
 *
 * ── WHERE THE SUGGESTIONS COME FROM ─────────────────────────────────────────
 *   Used before   Everything already typed on a manual invoice, most used
 *                 first, read straight off the consignments. See
 *                 listForwarders and listForwarderProducts. Nothing has to be
 *                 registered anywhere: typing it once is what puts it in.
 *   Common        The seed lists in config.ts. What a fresh install offers
 *                 before anybody has typed anything at all.
 *
 * ── TYPED TEXT ALWAYS WINS ──────────────────────────────────────────────────
 * Anything typed that matches nothing is offered as its own row and saved as
 * written. There is no catalog to refuse it and no settings detour to take
 * first. Arena moves cargo through whichever forwarder priced the lane that
 * week, and every carrier renames its products on its own schedule, so a list
 * that cannot say what happened is a list people work around.
 *
 * The free-text row is LAST when there are matches and the only row when there
 * are none, so Enter does the obvious thing either way.
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
import { FORWARDERS, forwarderKey, productsFor } from "@/lib/invoices/manual/config";

/** Products already used, keyed by forwarder. "" holds those used under none. */
export type ProductHistory = Record<string, string[]>;

// ---------------------------------------------------------------------------
// The shared combobox
// ---------------------------------------------------------------------------

function Picker({
  value,
  groups,
  placeholder,
  prompt,
  emptyText,
  disabled,
  onChange,
}: {
  value: string;
  /** Rendered in order. Empty ones are dropped, and nothing repeats across them. */
  groups: { heading: string; options: string[] }[];
  placeholder: string;
  prompt: string;
  emptyText: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const typed = query.trim();
  const needle = typed.toLowerCase();

  const filtered = React.useMemo(() => {
    const seen = new Set<string>();
    return groups
      .map((group) => ({
        heading: group.heading,
        options: group.options.filter((option) => {
          const key = option.toLowerCase();
          if (seen.has(key)) return false;
          if (needle && !key.includes(needle)) return false;
          seen.add(key);
          return true;
        }),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, needle]);

  const exact = filtered.some((group) =>
    group.options.some((option) => option.toLowerCase() === needle),
  );

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

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
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-60 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={prompt}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              {emptyText}
            </CommandEmpty>

            {filtered.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.options.map((option) => (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => pick(option)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0",
                        value === option ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{option}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {/* Clearing matters as much as choosing: a forwarder set by
                accident on a consignment that went direct has to be removable
                without deleting the whole consignment. */}
            {value ? (
              <CommandGroup>
                <CommandItem value="__clear" onSelect={() => pick("")}>
                  <span className="text-muted-foreground">Clear</span>
                </CommandItem>
              </CommandGroup>
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

// ---------------------------------------------------------------------------
// The two fields
// ---------------------------------------------------------------------------

export function ForwarderPicker({
  value,
  history,
  disabled,
  onChange,
}: {
  value: string;
  /** Forwarders already used, most used first. Merged with the seed list. */
  history: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const groups = React.useMemo(
    () => [
      { heading: "Used before", options: history },
      { heading: "Common", options: [...FORWARDERS] },
    ],
    [history],
  );

  return (
    <Picker
      value={value}
      groups={groups}
      placeholder="DHL"
      prompt="Type or pick a forwarder"
      emptyText="Type who carried it."
      disabled={disabled}
      onChange={onChange}
    />
  );
}

export function ProductPicker({
  value,
  forwarder,
  history,
  disabled,
  onChange,
}: {
  value: string;
  /** Whose products to offer. Changing it changes the list, not the value. */
  forwarder: string;
  history: ProductHistory;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const groups = React.useMemo(() => {
    const key = forwarderKey(forwarder);
    const used = history[key] ?? [];

    return [
      // Named after the forwarder when there is one, so it is obvious the list
      // narrowed rather than lost things. A picker that silently shows fewer
      // rows than last time reads as broken.
      {
        heading: forwarder.trim() ? `Used with ${forwarder.trim()}` : "Used before",
        options: used,
      },
      {
        heading: forwarder.trim() ? `${forwarder.trim()} products` : "Common",
        options: productsFor(forwarder),
      },
    ];
  }, [forwarder, history]);

  return (
    <Picker
      value={value}
      groups={groups}
      placeholder={forwarder.trim() ? "Pick a product" : "Express Worldwide"}
      prompt="Type or pick a product"
      emptyText="Type the product sold."
      disabled={disabled}
      onChange={onChange}
    />
  );
}
