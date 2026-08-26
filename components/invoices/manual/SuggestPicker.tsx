"use client";

/**
 * A field with a suggestion list that never refuses what you type.
 *
 * ── WHY THIS IS NOT A SELECT ────────────────────────────────────────────────
 * Parcel type and ship mode are the same shape of problem: there is a short
 * list that covers nine invoices in ten, and a tenth invoice that says
 * something the list has never heard of. A closed dropdown makes that tenth
 * invoice unbillable, or, worse, billable as "Other", which is how a column
 * stops meaning anything. A plain text box makes the nine spell the same thing
 * three ways.
 *
 * So: the list is offered, and anything typed is taken as written and saved.
 * The free-text row is LAST when there are matches and the only row when there
 * are none, so Enter does the obvious thing either way. That is the same rule
 * ServicePicker and ChargePicker follow, for the same reason.
 *
 * Unlike ServicePicker and ForwarderPicker there is no "used before" group,
 * because these two values come from a genuinely short vocabulary that does not
 * grow the way a service description or a carrier's product range does. If that
 * stops being true, this grows a `history` prop and starts looking exactly like
 * its siblings.
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

export function SuggestPicker({
  value,
  options,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  options: readonly string[];
  /** Shown in the closed trigger when nothing is chosen. An example, not a hint. */
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const typed = query.trim();
  const needle = typed.toLowerCase();

  const matches = React.useMemo(
    () =>
      options.filter(
        (option) => !needle || option.toLowerCase().includes(needle),
      ),
    [options, needle],
  );

  const exact = matches.some((option) => option.toLowerCase() === needle);

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

      <PopoverContent className="w-56 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type or pick"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              Type what it was.
            </CommandEmpty>

            {matches.length > 0 ? (
              <CommandGroup>
                {matches.map((option) => (
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
            ) : null}

            {/* Clearing matters as much as choosing: a parcel type set by
                accident on a consignment that has none has to be removable
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
