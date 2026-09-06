"use client";

/**
 * "3 MORE DELHIVERY RATES"
 * -----------------------------------------------------------------------------
 * The disclosure that sits under a merged rate card and holds every other rate
 * the same courier quoted for the same lane.
 *
 * ── WHY A DISCLOSURE AND NOT A FILTER ───────────────────────────────────────
 * A domestic lane comes back as fifteen rows that are really four couriers at
 * different weight slabs, and the difference between two Delhivery rows is
 * usually a slab boundary rather than a choice anyone wants to make. Showing
 * the cheapest of each courier makes the list readable; hiding the rest outright
 * would take away a real option (a higher slab that is fewer days, or the one
 * service that suits an odd consignment). So they are one click away, never
 * gone, and the count is on the trigger so nobody has to click to find out
 * whether anything is behind it.
 *
 * ── CLOSED BY DEFAULT, AND NO LAYOUT SHIFT ──────────────────────────────────
 * The trigger renders at its final size on first paint, so opening a group
 * moves the cards below it and nothing else. The count comes from data that
 * arrives with the quotes, so there is no measure-then-resize step and no
 * skeleton to stand in for one.
 *
 * Shared by the calculator's RateResultCard and the booking wizard's
 * RateOptionCard so a rate reads identically whether it is being compared or
 * bought.
 */

import { useState } from "react";
import { ChevronDown, Clock, Zap } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface AlternativeQuote {
  vendorId: string;
  productName: string;
  currency: string;
  totalWithTax: number;
  tatDays: number;
}

interface Props<Q extends AlternativeQuote> {
  /** Courier heading, e.g. "Delhivery". Used in the trigger copy. */
  courierLabel: string;
  /** Every rate in the group except the one on the card. Cheapest first. */
  alternatives: readonly Q[];
  /** The name the viewer sees. Resolved by the caller so branding applies once. */
  displayName: (quote: Q) => string;
  /** Stable identity for the React key. */
  quoteId: (quote: Q) => string;
  /** True for the one rate that holds the "Fastest" badge, if it is in here. */
  isFastest?: (quote: Q) => boolean;
  /**
   * Choose this rate instead. Omitted on read-only surfaces, where the rows
   * render as plain text rather than as buttons that do nothing.
   */
  onSelect?: (quote: Q) => void;
  /** Extra classes for the wrapper, so each card can match its own padding. */
  className?: string;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CourierAlternatives<Q extends AlternativeQuote>({
  courierLabel,
  alternatives,
  displayName,
  quoteId,
  isFastest,
  onSelect,
  className,
}: Props<Q>) {
  const [open, setOpen] = useState(false);

  if (alternatives.length === 0) return null;

  const count = alternatives.length;
  // The fastest rate on the whole list can be a slab we collapsed. Saying so on
  // the trigger is the difference between a disclosure worth opening and one
  // that looks like more of the same.
  const hidesFastest = isFastest ? alternatives.some(isFastest) : false;

  return (
    <div
      className={cn("w-full", className)}
      // Both cards make their outer surface clickable (open the quote sheet,
      // select the service). Every interaction in here means something else.
      onClick={(e) => e.stopPropagation()}
    >
      <Separator className="mb-2" />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="group flex w-full items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
          <span>
            {count} more {courierLabel} rate{count !== 1 ? "s" : ""}
          </span>
          {hidesFastest && (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-violet-200 px-1.5 py-px text-[10px] font-medium text-violet-700 dark:border-violet-800 dark:text-violet-400">
              <Zap className="h-2.5 w-2.5" />
              fastest inside
            </span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <ul className="mt-2 space-y-1">
            {alternatives.map((quote) => {
              const fastest = isFastest?.(quote) ?? false;

              const row = (
                <>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {displayName(quote)}
                  </span>
                  {fastest && (
                    <Zap className="h-3 w-3 shrink-0 text-violet-600 dark:text-violet-400" />
                  )}
                  <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {quote.tatDays > 0 ? `${quote.tatDays}d` : "TBD"}
                  </span>
                  <span className="w-16 shrink-0 text-right font-medium tabular-nums text-foreground">
                    {money(quote.totalWithTax, quote.currency)}
                  </span>
                </>
              );

              return (
                <li key={quoteId(quote)}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(quote)}
                      className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs transition-colors hover:border-border hover:bg-muted/50"
                    >
                      {row}
                    </button>
                  ) : (
                    <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                      {row}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
