"use client";

/**
 * The label half of a consignment's custom field: a combobox over the saved
 * labels, shared by every admin.
 *
 * Works the way the charge picker does. The list is loaded once for the page
 * and filtered in the browser. Anything typed that matches nothing is still
 * accepted for this invoice, and can be saved so the next invoice offers it.
 * Each saved label can also be removed from the list. That only stops it being
 * suggested: invoices hold the label as plain text, so none of them change.
 */

import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { toast } from "sonner";

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
  fieldLabelKey,
  type InvoiceFieldLabelOption,
} from "@/lib/invoices/manual/config";
import {
  createInvoiceFieldLabelAction,
  deleteInvoiceFieldLabelAction,
} from "@/actions/invoices/manualInvoices.action";

export function FieldLabelPicker({
  value,
  labels,
  disabled,
  onChange,
  onLabelsChange,
}: {
  value: string;
  labels: InvoiceFieldLabelOption[];
  disabled?: boolean;
  onChange: (label: string) => void;
  /** The saved list after an add or a remove, so every picker on the page agrees. */
  onLabelsChange: (labels: InvoiceFieldLabelOption[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [working, setWorking] = React.useState(false);

  const typed = query.trim().replace(/\s+/g, " ");

  const filtered = React.useMemo(() => {
    const needle = typed.toLowerCase();
    return labels.filter(
      (option) => !needle || option.label.toLowerCase().includes(needle),
    );
  }, [labels, typed]);

  const exact = labels.some(
    (option) => fieldLabelKey(option.label) === fieldLabelKey(typed),
  );

  function pick(label: string) {
    onChange(label);
    setOpen(false);
    setQuery("");
  }

  async function save() {
    if (!typed) return;
    setWorking(true);
    try {
      const result = await createInvoiceFieldLabelAction(typed);
      if (!result.ok) {
        // Still used on this invoice; only the saving failed.
        toast.error(result.error);
        pick(typed);
        return;
      }
      if (!labels.some((option) => option.id === result.data.id)) {
        onLabelsChange(
          [...labels, result.data].sort((a, b) =>
            a.label.localeCompare(b.label),
          ),
        );
      }
      toast.success(`"${result.data.label}" saved for future invoices.`);
      pick(result.data.label);
    } finally {
      setWorking(false);
    }
  }

  async function remove(option: InvoiceFieldLabelOption) {
    setWorking(true);
    try {
      const result = await deleteInvoiceFieldLabelAction(option.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onLabelsChange(labels.filter((l) => l.id !== option.id));
      toast.success(`"${option.label}" removed from the saved labels.`);
    } finally {
      setWorking(false);
    }
  }

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
            "h-9 w-full justify-between px-3 font-normal",
            !value && "text-muted-foreground",
          )}
        >
          <span className="truncate">{value || "Label"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-40" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Seal no., shipping bill no.…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
              {labels.length === 0
                ? "No saved labels yet. Type one."
                : "No saved label matches."}
            </CommandEmpty>

            {filtered.length > 0 ? (
              <CommandGroup heading="Saved">
                {filtered.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => pick(option.label)}
                    className="group/label"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        fieldLabelKey(value) === fieldLabelKey(option.label)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{option.label}</span>
                    <button
                      type="button"
                      aria-label={`Remove "${option.label}" from the saved labels`}
                      disabled={working}
                      className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/label:opacity-100 group-data-[selected=true]/label:opacity-100 hover:text-destructive focus-visible:opacity-100"
                      // Keep the press from selecting the row underneath.
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(option);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {typed && !exact ? (
              <CommandGroup heading="Not saved">
                <CommandItem value="__use" onSelect={() => pick(typed)}>
                  Use &ldquo;{typed}&rdquo; on this invoice only
                </CommandItem>
                <CommandItem
                  value="__save"
                  disabled={working}
                  onSelect={save}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Save &ldquo;{typed}&rdquo; for future invoices
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
