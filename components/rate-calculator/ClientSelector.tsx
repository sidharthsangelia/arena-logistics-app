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
 *
 * • `onAddNew` forwards the current query so the new-client form can prefill
 *   the company name — the common case is "searched, not found, add it".
 */

import { useState, useEffect, useRef, useTransition } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  MapPin,
  Search,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { searchClientsAction } from "@/actions/clientSrearch.action";
import type { ClientSearchResult } from "@/actions/clientSrearch.action";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  value: ClientSearchResult | null;
  onSelect: (client: ClientSearchResult) => void;
  onAddNew: (query?: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function locationOf(c: ClientSearchResult): string {
  return [c.city, c.country].filter(Boolean).join(", ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClientSelector({ value, onSelect, onAddNew }: Props) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
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
        setHasSearched(true);
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, open]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Reset transient search state when the popover closes.
    if (!next) {
      setInputValue("");
      setHasSearched(false);
    }
  };

  const handleSelect = (client: ClientSearchResult) => {
    onSelect(client);
    setOpen(false);
  };

  const handleAddNew = () => {
    setOpen(false);
    onAddNew(inputValue.trim() || undefined);
  };

  const trimmed = inputValue.trim();
  const noResults = hasSearched && !isPending && results.length === 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto w-full justify-between gap-2 py-2 font-normal"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {initials(value.companyName)}
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-medium text-foreground">
                  {value.companyName}
                </span>
                {(value.contactName || locationOf(value)) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[value.contactName, locationOf(value)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Search className="h-4 w-4" />
              Search clients…
            </span>
          )}
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by company, contact, or email…"
            value={inputValue}
            onValueChange={setInputValue}
          />

          <CommandList>
            {isPending ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : (
              <>
                {results.length > 0 && (
                  <CommandGroup
                    heading={trimmed ? "Matching clients" : "Recent clients"}
                  >
                    {results.map((client) => {
                      const selected = value?.id === client.id;
                      const location = locationOf(client);
                      return (
                        <CommandItem
                          key={client.id}
                          value={client.id}
                          onSelect={() => handleSelect(client)}
                          className="flex items-center gap-2.5 py-2"
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {selected ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              initials(client.companyName)
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-tight">
                              {client.companyName}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {[client.contactName, client.email]
                                .filter(Boolean)
                                .join(" · ") || "No contact details"}
                            </p>
                          </div>
                          {location && (
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {location}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {noResults && (
                  <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {trimmed ? "No matching clients" : "No clients yet"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {trimmed
                        ? `Add “${trimmed}” as a new client below.`
                        : "Add your first client to get started."}
                    </p>
                  </div>
                )}
              </>
            )}

            <CommandSeparator />

            <CommandGroup>
              <CommandItem
                onSelect={handleAddNew}
                className="gap-2 py-2.5 text-sm font-medium text-primary aria-selected:text-primary"
              >
                <UserPlus className="h-4 w-4 shrink-0" />
                {trimmed ? `Add “${trimmed}” as new client` : "Add new client"}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
