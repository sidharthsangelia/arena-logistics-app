import { BarChart3, Building2, HandCoins, ReceiptText } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { WalletOverviewSkeleton } from "@/components/wallet/admin/WalletPanelSkeletons";
import {
  WALLET_TAB_KEYS,
  WALLET_TAB_META,
  type WalletTabKey,
} from "@/lib/wallet/adminConfig";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<WalletTabKey, React.ElementType> = {
  overview: BarChart3,
  organisations: Building2,
  transactions: ReceiptText,
  collections: HandCoins,
};

/**
 * Covers the instant between clicking Wallets in the sidebar and the route
 * rendering.
 *
 * Everything on this screen that does not come from the database is printed
 * here as itself: the heading, the sentence under it, the four tab names. Those
 * are the same words the page renders a moment later, in the same boxes, so the
 * swap is invisible — nothing that was readable becomes a grey bar and nothing
 * moves. Only the period select, which needs the URL, and the panel, which needs
 * the money, are placeholders.
 *
 * The panel fallback is the overview's, because the overview is the tab a
 * sidebar click lands on. Arriving on any other tab means arriving with ?tab= in
 * the URL, and the page's own boundary picks the matching shape from there.
 */
export default function ArenaWalletsLoading() {
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallets and money</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every rupee across the platform: what you are holding for customers, what
            moved, and what is still owed to you.
          </p>
        </div>

        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      {/* Same markup as WalletTabsNav, minus the click handling it cannot have
          yet. Labels and keys come from the same config the nav reads, so the
          bar cannot drift out of step with it, and the buttons occupy exactly
          the space the real ones will. */}
      <div
        role="tablist"
        aria-label="Wallet views"
        className="flex w-full gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1"
      >
        {WALLET_TAB_KEYS.map((key) => {
          const Icon = TAB_ICONS[key];
          const isActive = key === "overview";

          return (
            <span
              key={key}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "flex flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {WALLET_TAB_META[key].label}
            </span>
          );
        })}
      </div>

      <WalletOverviewSkeleton />
    </div>
  );
}
