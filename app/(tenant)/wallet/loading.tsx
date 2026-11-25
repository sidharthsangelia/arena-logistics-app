import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WalletActivityCard,
  WalletBalanceCard,
  WalletBalanceSkeleton,
  WalletTransactionsSkeleton,
} from "@/components/wallet/WalletPageParts";
import { WALLET_HISTORY_RANGE_DAYS } from "@/lib/wallet/historyRange";

/**
 * Covers the wallet page's chunk arriving. Built from the page's own card shells
 * (WalletPageParts), so the icon, headings, buttons and range tabs are the real
 * ones; only the balance and the transaction rows, which come from the
 * database, are skeletons.
 *
 * Buttons and tabs are inert (no pointer events, out of the tab order) rather
 * than disabled, so they keep their real colour and do not change when the
 * page takes over. The range starts on 7 days, as the page does.
 */
export default function WalletLoading() {
  return (
    <div className="mx-auto max-w-3xl py-8 space-y-6" aria-busy="true">
      <WalletBalanceCard
        amount={<WalletBalanceSkeleton />}
        actions={
          <>
            <Button variant="outline" size="icon" tabIndex={-1} aria-hidden className="pointer-events-none">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button tabIndex={-1} aria-hidden className="pointer-events-none">
              <Plus className="mr-2 h-4 w-4" />
              Recharge
            </Button>
          </>
        }
      />

      <WalletActivityCard
        rangeTabs={
          <Tabs value="7" className="pointer-events-none" aria-hidden>
            <TabsList>
              {WALLET_HISTORY_RANGE_DAYS.map((d) => (
                <TabsTrigger key={d} value={String(d)} tabIndex={-1}>
                  {d}d
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        <WalletTransactionsSkeleton />
      </WalletActivityCard>
    </div>
  );
}
