"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ElementType } from "react";
import { BarChart3, Building2, HandCoins, ReceiptText } from "lucide-react";

import {
  WALLET_TAB_KEYS,
  WALLET_TAB_META,
  type WalletTabKey,
} from "@/lib/wallet/adminConfig";
import { cn } from "@/lib/utils";

/**
 * Tab navigation for the wallets screen.
 *
 * The tab lives in the URL rather than in component state for two reasons: a link
 * to "the collections queue" is shareable and survives a refresh, and the server
 * page runs only the query for the visible tab instead of all four on every load.
 *
 * Keys, labels and `coerceWalletTab` live in lib/wallet/adminConfig.ts, not here.
 * The server page must resolve the active tab before choosing a query, and it
 * cannot call into a `"use client"` module. Only the icons stay local.
 *
 * Switching tabs deliberately drops the other tabs' filters. Carrying a
 * transaction type filter over into the collections queue would silently show a
 * filtered list with no visible control explaining why.
 */

const TAB_ICONS: Record<WalletTabKey, ElementType> = {
  overview: BarChart3,
  organisations: Building2,
  transactions: ReceiptText,
  collections: HandCoins,
};

export function WalletTabsNav({
  active,
  /** Shown on the collections tab so the queue size is visible before opening it. */
  outstandingCount,
}: {
  active: WalletTabKey;
  outstandingCount?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const goTo = (tab: WalletTabKey) => {
    if (tab === active) return;

    // Only the period carries across. It is a framing choice about how far back
    // to look, which stays meaningful on whichever tab you land on.
    const next = new URLSearchParams();
    const period = searchParams.get("period");
    if (period) next.set("period", period);
    next.set("tab", tab);

    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Wallet views"
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1",
        isPending && "opacity-70",
      )}
    >
      {WALLET_TAB_KEYS.map((key) => {
        const isActive = key === active;
        const Icon = TAB_ICONS[key];
        const meta = WALLET_TAB_META[key];
        const badge = key === "collections" && outstandingCount ? outstandingCount : null;

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={meta.hint}
            onClick={() => goTo(key)}
            className={cn(
              "flex flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {meta.label}
            {badge != null && (
              <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 tabular-nums">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
