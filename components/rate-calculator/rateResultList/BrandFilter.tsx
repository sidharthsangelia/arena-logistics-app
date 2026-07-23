"use client";

/**
 * BrandFilter.tsx
 * -----------------------------------------------------------------------------
 * Customer-facing carrier-brand filter for the INTERNATIONAL results. Groups
 * the returned services by big-4 brand (DHL / FedEx / UPS / Aramex) plus an
 * "Arena" bucket for own-brand services, so a user can narrow to "just the DHL
 * options", etc. Multi-select: toggling several brands widens the view.
 *
 * Shares detection with the card logos via lib/carrierLogo (carrierBrand), so
 * the chip a service falls under always matches the logo it renders with. Shown
 * to everyone (unlike the Arena-only sourcing-vendor chips in Toolbar), because
 * the big-4 brand IS customer-facing.
 */

import Image from "next/image";
import { useMemo } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import {
  CARRIER_BRANDS,
  OTHER_BRAND,
  ARENA_LOGO,
  carrierBrand,
  type CarrierLogo,
} from "@/lib/carrierLogo";

interface BrandGroup {
  key: string;
  label: string;
  logo: CarrierLogo;
  count: number;
}

export default function BrandFilter() {
  const quotes = useAppStore((s) => s.quotes);
  const activeBrands = useAppStore((s) => s.activeBrands);
  const toggleBrandFilter = useAppStore((s) => s.toggleBrandFilter);
  const clearBrandFilters = useAppStore((s) => s.clearBrandFilters);

  // Count services per brand from the full result set (stable across sort /
  // other filters), keeping the big-4 in detection order with "Arena" last.
  const groups = useMemo<BrandGroup[]>(() => {
    const counts = new Map<string, number>();
    for (const q of quotes) {
      const brand = carrierBrand(q.productName);
      counts.set(brand, (counts.get(brand) ?? 0) + 1);
    }

    const ordered: BrandGroup[] = [];
    for (const { brand, logo } of CARRIER_BRANDS) {
      const count = counts.get(brand);
      if (count) ordered.push({ key: brand, label: brand, logo, count });
    }
    const otherCount = counts.get(OTHER_BRAND);
    if (otherCount) {
      ordered.push({
        key: OTHER_BRAND,
        label: "Arena",
        logo: ARENA_LOGO,
        count: otherCount,
      });
    }
    return ordered;
  }, [quotes]);

  // Nothing to filter unless there is more than one brand to choose between.
  if (groups.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">
        Filter by carrier
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) => {
          const active = activeBrands.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => toggleBrandFilter(g.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Image
                src={g.logo.src}
                alt=""
                width={g.logo.width}
                height={g.logo.height}
                className="h-3.5 w-auto max-w-8 shrink-0 object-contain"
              />
              <span>{g.label}</span>
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-foreground/70" : "text-muted-foreground/70",
                )}
              >
                {g.count}
              </span>
              {active && <X className="h-3 w-3" />}
            </button>
          );
        })}
        {activeBrands.length > 0 && (
          <button
            type="button"
            onClick={clearBrandFilters}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
