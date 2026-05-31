"use client";

/**
 * ClientSelector.tsx
 *
 * A searchable combobox for picking an existing client, or triggering an
 * inline "Add new client" form. Lives inside QuoteSheet only.
 *
 * DESIGN DECISIONS
 * ─────────────────
 * • Uses a controlled Popover + Command (shadcn) pattern — same pattern used
 *   throughout the app — so it integrates without any new dependencies.
 *
 * • Search is debounced (300 ms) before hitting the server action to avoid
 *   hammering the DB on every keystroke.
 *
 * • The component is uncontrolled with respect to the search string: it
 *   manages `inputValue` locally since that is pure ephemeral UI state.
 *
 * • `onSelect` returns the full ClientSearchResult so the parent (QuoteSheet)
 *   can hydrate all client fields in one shot.
 */

import { useState, useEffect, useRef, useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { searchClientsAction } from "@/actions/clientSrearch.action";
import type { ClientSearchResult } from "@/actions/clientSrearch.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  value: ClientSearchResult | null;
  onSelect: (client: ClientSearchResult) => void;
  onAddNew: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientSelector({ value, onSelect, onAddNew }: Props) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch on open (empty query → recent clients) and on input change
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const data = await searchClientsAction(inputValue);
        setResults(data);
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, open]);

  const handleSelect = (client: ClientSearchResult) => {
    onSelect(client);
    setOpen(false);
    setInputValue("");
  };

  const label = value
    ? `${value.companyName}${value.contactName ? ` — ${value.contactName}` : ""}`
    : "Search clients…";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 text-sm"
        >
          <span className="truncate text-left">
            {value ? (
              <span className="text-foreground">{label}</span>
            ) : (
              <span className="text-muted-foreground">Search clients…</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search…"
            value={inputValue}
            onValueChange={setInputValue}
          />

          <CommandList>
            {isPending ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : (
              <>
                <CommandEmpty>No clients found.</CommandEmpty>

                {results.length > 0 && (
                  <CommandGroup heading="Clients">
                    {results.map((client) => (
                      <CommandItem
                        key={client.id}
                        value={client.id}
                        onSelect={() => handleSelect(client)}
                        className="flex items-start gap-2 py-2"
                      >
                        <Check
                          className={cn(
                            "mt-0.5 h-4 w-4 shrink-0",
                            value?.id === client.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-none">
                            {client.companyName}
                          </p>
                          {(client.contactName || client.email) && (
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">
                              {[client.contactName, client.email]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}

            <CommandSeparator />

            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onAddNew();
                }}
                className="gap-2 text-sm"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                Add new client
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}