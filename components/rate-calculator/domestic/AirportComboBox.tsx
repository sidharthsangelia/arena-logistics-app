"use client";

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

export interface AirportOption {
  code: string;
  city: string;
}

interface AirportComboboxProps {
  value?: string;
  onChange: (value: string) => void;
  airports: AirportOption[];
  placeholder?: string;
}

export function AirportCombobox({
  value,
  onChange,
  airports,
  placeholder = "Select airport",
}: AirportComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedAirport = airports.find(
    (airport) => airport.code === value,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selectedAirport
            ? `${selectedAirport.code} - ${selectedAirport.city}`
            : placeholder}

          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search airport..." />

          <CommandList>
            <CommandEmpty>No airport found.</CommandEmpty>

            <CommandGroup>
              {airports.map((airport) => (
                <CommandItem
                  key={airport.code}
                  value={`${airport.code} ${airport.city}`}
                  onSelect={() => {
                    onChange(airport.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === airport.code
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />

                  <span className="font-medium">
                    {airport.code}
                  </span>

                  <span className="ml-2 text-muted-foreground">
                    {airport.city}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}