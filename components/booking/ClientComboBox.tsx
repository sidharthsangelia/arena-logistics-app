"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { searchClients } from "@/lib/actions/clients";
import { ClientSummary } from "@/types/booking";
import { searchClientsAction } from "@/actions/clientSrearch.action";
 

interface ClientComboboxProps {
  value: ClientSummary | null;
  onChange: (client: ClientSummary) => void;
  placeholder?: string;
}

export function ClientCombobox({ value, onChange, placeholder = "Search clients…" }: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        const res = await searchClientsAction(query);
        if (res) setResults(res);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? value.companyName : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            {/* <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" /> */}
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search by name, contact, or email…"
              className="border-0 focus:ring-0 w-[300]"
            />
          </div>
          <CommandList>
            {isPending && <div className="text-muted-foreground p-3 text-sm">Searching…</div>}
            {!isPending && results.length === 0 && (
              <CommandEmpty>No clients found.</CommandEmpty>
            )}
            <CommandGroup>
              {results.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  onSelect={() => {
                    onChange(client);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value?.id === client.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{client.companyName}</span>
                    {(client.contactName || client.email) && (
                      <span className="text-muted-foreground text-xs">
                        {[client.contactName, client.email].filter(Boolean).join(" · ")}
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
  );
}