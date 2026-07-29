"use client";

import { useMemo, useState } from "react";
import { Search, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PROHIBITED_GROUPS,
  PROHIBITED_ITEM_COUNT,
} from "@/lib/booking/prohibitedItems";

// ---------------------------------------------------------------------------
// The prohibited items reference the customer opens from the packages step.
//
// The point is a quick "is my thing in here?" check, so the carrier list is
// read as twelve rules (see lib/booking/prohibitedItems.ts) with a search box
// over every underlying entry. Search matches the examples as well as the
// rule titles, so typing "perfume" or "note 7" lands on the right rule even
// though neither word is a heading.
// ---------------------------------------------------------------------------

export function ProhibitedItemsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROHIBITED_GROUPS;
    return PROHIBITED_GROUPS.map((g) => {
      const titleHit = g.title.toLowerCase().includes(q);
      const examples = titleHit
        ? g.examples
        : g.examples.filter((e) => e.toLowerCase().includes(q));
      return examples.length ? { ...g, examples } : null;
    }).filter((g): g is (typeof PROHIBITED_GROUPS)[number] => g !== null);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1.5 border-b p-6 pb-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            What you cannot send by air
          </DialogTitle>
          <DialogDescription>
            {PROHIBITED_ITEM_COUNT} items every major carrier refuses, grouped
            into {PROHIBITED_GROUPS.length} rules. Some are simply returned to
            you at your cost; others are illegal to export and can be seized.
            Check your packing list here before you continue.
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search an item, for example perfume or batteries"
              className="pl-9"
              aria-label="Search prohibited items"
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {groups.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">
                Nothing in the list matches &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                That is a good sign, but it is not a clearance. If you are
                unsure about an item, ask our team before you book.
              </p>
            </div>
          ) : (
            <ul className="space-y-5">
              {groups.map((g) => (
                <li key={g.title}>
                  <h3 className="text-sm font-semibold">{g.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.note}
                  </p>
                  <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    {g.examples.map((e) => (
                      <li
                        key={e}
                        className="flex gap-2 text-xs leading-relaxed text-foreground"
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
                        />
                        {e}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="items-center gap-3 border-t p-4 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Destination countries add their own restrictions. When in doubt,
            ask us before packing.
          </p>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
