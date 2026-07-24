import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  HandCoins,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StatCard from "@/components/StatCard";
import { MONEY_PERIODS, type WalletOverviewDTO } from "@/lib/wallet/adminConfig";
import { formatMoney } from "@/utils/format";

import { CollectionAgingChart } from "./CollectionAgingChart";
import { MoneyFlowChart } from "./MoneyFlowChart";

/**
 * The overview tab: four figures, one flow chart, one aging chart, and a strip
 * that only appears when something is actually wrong.
 *
 * Kept deliberately short. Everything here answers a question an admin would
 * otherwise have to ask someone: how much of this money is ours to spend, is more
 * coming in than going out, and how much is stuck with people who have not paid.
 */

export function WalletOverviewTab({ data }: { data: WalletOverviewDTO }) {
  const periodLabel = MONEY_PERIODS[data.period].label.toLowerCase();
  const netMovement = data.toppedUp - data.spent;

  return (
    <div className="space-y-6">
      <MoneyAttentionStrip data={data} />

      {/* ── The four figures ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Money in wallets"
          value={formatMoney(data.heldInWallets, data.currency)}
          sub={
            data.lowBalanceCount > 0
              ? `${data.walletCount} wallets, ${data.lowBalanceCount} running low`
              : `Across ${data.walletCount} wallet${data.walletCount === 1 ? "" : "s"}`
          }
          icon={Wallet}
          tooltip="What organisations have topped up and not spent yet. This money is still theirs, so treat it as money you are holding for them rather than money you have earned. Always current, whatever period is selected."
        />

        <StatCard
          label="Topped up"
          value={formatMoney(data.toppedUp, data.currency)}
          sub={`${data.toppedUpCount} payment${data.toppedUpCount === 1 ? "" : "s"}, ${periodLabel}`}
          icon={ArrowDownLeft}
          tooltip="Money that came into wallets during this period, whether paid online or added by an admin for a bank transfer or cheque."
        />

        <StatCard
          label="Spent on bookings"
          value={formatMoney(data.spent, data.currency)}
          sub={`${data.spentCount} booking${data.spentCount === 1 ? "" : "s"}, ${periodLabel}`}
          icon={ArrowUpRight}
          tooltip="Money taken out of wallets to pay for shipments during this period. This is the point at which their balance becomes your revenue."
        />

        <StatCard
          label="Waiting to be collected"
          value={formatMoney(data.awaitingCollection, data.currency)}
          sub={
            data.awaitingCollectionCount > 0
              ? `${data.awaitingCollectionCount} booking${data.awaitingCollectionCount === 1 ? "" : "s"} owe you`
              : "Everything is settled"
          }
          icon={HandCoins}
          tooltip="Owed on bookings that were allowed to ship before paying. Record payments as they come in on the Collections tab."
        />
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Money in and out</CardTitle>
            <CardDescription className="text-xs">
              {netMovement >= 0
                ? `Wallets gained ${formatMoney(netMovement, data.currency)} overall in this period.`
                : `Wallets drained by ${formatMoney(Math.abs(netMovement), data.currency)} overall in this period.`}
            </CardDescription>
          </CardHeader>
          <div className="px-4 pb-4">
            <MoneyFlowChart data={data.series} currency={data.currency} />
          </div>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">What you are owed, by age</CardTitle>
            <CardDescription className="text-xs">
              The older a balance gets, the less likely it is to be paid.
            </CardDescription>
          </CardHeader>
          <div className="px-4 pb-4">
            <CollectionAgingChart data={data.aging} currency={data.currency} />
          </div>
        </Card>
      </div>
    </div>
  );
}

/**
 * Only renders when there is something to act on. An always-present "all clear"
 * panel trains people to scroll past this area, which defeats the purpose.
 *
 * Failures come first and in the destructive style, because a rejected payment is
 * the one case where a customer thinks they have paid and the system disagrees.
 */
function MoneyAttentionStrip({ data }: { data: WalletOverviewDTO }) {
  const { attention } = data;
  const hasFailures = attention.failedTopUpCount > 0;
  const hasStale = attention.staleTopUpCount > 0;

  if (!hasFailures && !hasStale) return null;

  return (
    <div className="space-y-3">
      {hasFailures && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {attention.failedTopUpCount} payment
            {attention.failedTopUpCount === 1 ? "" : "s"} failed,{" "}
            {formatMoney(attention.failedTopUpAmount, data.currency)} in total
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              The bank turned these down, so the money never arrived. The organisation
              may believe it did. Worth a call before they try to book.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link href="/arena-dashboard/wallets?tab=transactions&status=FAILED">
                See the failures
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {hasStale && (
        <Alert>
          <Clock className="h-4 w-4" />
          <AlertTitle>
            {attention.staleTopUpCount} top-up
            {attention.staleTopUpCount === 1 ? "" : "s"} never finished,{" "}
            {formatMoney(attention.staleTopUpAmount, data.currency)} in total
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Someone opened the payment page and did not complete it. Almost always an
              abandoned checkout rather than lost money, but check if an organisation
              says they paid.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link href="/arena-dashboard/wallets?tab=transactions&status=PENDING">
                See the unfinished ones
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
