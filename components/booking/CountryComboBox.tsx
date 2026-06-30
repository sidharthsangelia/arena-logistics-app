"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";

import { COUNTRIES } from "@/utils/data";

interface CountryComboboxProps {
  /** Stores the country *name* (not ISO code), matching ConsignorForm/ConsigneeForm. */
  value: string;
  onChange: (countryName: string) => void;
  label?: string;
  error?: string;
}

// Converts an ISO 3166-1 alpha-2 code to its emoji flag.
function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

export function CountryCombobox({
  value,
  onChange,
  label = "Country",
  error,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRIES.find((c) => c.name === value) ?? null;

  return (
    <div className="space-y-1">
      <Label>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              !selected && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            {selected ? (
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">
                  {countryFlag(selected.code)}
                </span>
                {selected.name}
              </span>
            ) : (
              "Select country…"
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search country…" />
            <CommandList className="max-h-60">
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRIES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={c.name}
                    onSelect={() => {
                      onChange(c.name);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === c.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="mr-2 text-base leading-none">
                      {countryFlag(c.code)}
                    </span>
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}