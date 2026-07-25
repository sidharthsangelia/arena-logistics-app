"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

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

export interface ComboOption {
  id: string;
  label: string;
  sublabel: string | null;
}

/**
 * A searchable, server-backed picker. Debounces the query, fetches on open, and
 * reports the whole selected option back so the caller keeps the label without a
 * second lookup. Used for both the org and shipment pickers on the invoice form.
 */
export function AsyncCombobox({
  value,
  onChange,
  fetcher,
  placeholder = "Search…",
  emptyText = "No matches.",
  disabled = false,
  allowClear = false,
  clearLabel = "Clear selection",
  triggerClassName,
}: {
  value: ComboOption | null;
  onChange: (option: ComboOption | null) => void;
  fetcher: (query: string) => Promise<ComboOption[]>;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<ComboOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    // setLoading lives inside the debounce callback (not the effect body) so the
    // load flag is set asynchronously — same shape as the other comboboxes.
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetcher(query);
        // Ignore results from a stale request that resolved out of order.
        if (id === reqId.current) setOptions(res);
      } catch {
        if (id === reqId.current) setOptions([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
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
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between font-normal",
            !value && "text-muted-foreground",
            triggerClassName,
          )}
        >
          <span className="truncate">{value ? value.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyText}</CommandEmpty>
                {allowClear && value && (
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      onSelect={() => {
                        onChange(null);
                        setOpen(false);
                      }}
                      className="text-muted-foreground"
                    >
                      {clearLabel}
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {options.map((opt) => (
                    <CommandItem
                      key={opt.id}
                      value={opt.id}
                      onSelect={() => {
                        onChange(opt);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value?.id === opt.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="truncate text-xs text-muted-foreground">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
