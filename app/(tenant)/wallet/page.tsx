"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, ArrowUpRight, ArrowDownLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getWalletSummaryAction } from "@/actions/wallet/getWalletSummary.action";
import { getWalletTransactionsAction } from "@/actions/wallet/getWalletTransactions.action";
import { WALLET_HISTORY_RANGE_DAYS, type WalletHistoryRangeDays } from "@/lib/wallet/historyRange";
import { TopUpModal } from "@/components/wallet/TopUpModal";
import {
  WalletActivityCard,
  WalletBalanceCard,
  WalletBalanceSkeleton,
  WalletTransactionsSkeleton,
} from "@/components/wallet/WalletPageParts";

const BALANCE_QUERY_KEY = ["wallet-balance"];
const TRANSACTIONS_QUERY_KEY = "wallet-transactions";

function fmt(amount: string | number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number(amount),
  );
}

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; sign: string }> = {
  TOP_UP: { icon: ArrowDownLeft, label: "Top-up", sign: "+" },
  SHIPMENT_DEBIT: { icon: ArrowUpRight, label: "Shipment", sign: "−" },
  REFUND: { icon: RotateCcw, label: "Refund", sign: "+" },
  MANUAL_CREDIT: { icon: ArrowDownLeft, label: "Added by Arena", sign: "+" },
  MANUAL_DEBIT: { icon: ArrowUpRight, label: "Corrected by Arena", sign: "−" },
  ADJUSTMENT: { icon: RefreshCw, label: "Adjustment", sign: "±" },
};

const STATUS_VARIANT: Record<string, string> = {
  SUCCESS: "bg-green-50 text-green-700 border-green-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  REVERSED: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function WalletPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [rangeDays, setRangeDays] = useState<WalletHistoryRangeDays>(7);

  const balanceQuery = useQuery({
    queryKey: BALANCE_QUERY_KEY,
    queryFn: () => getWalletSummaryAction(),
    staleTime: 15_000,
  });

  const transactionsQuery = useQuery({
    queryKey: [TRANSACTIONS_QUERY_KEY, rangeDays],
    queryFn: () => getWalletTransactionsAction(rangeDays),
    staleTime: 15_000,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: BALANCE_QUERY_KEY });
    qc.invalidateQueries({ queryKey: [TRANSACTIONS_QUERY_KEY] });
  };

  const summary = balanceQuery.data;
  const history = transactionsQuery.data;
  const currency = summary?.currency ?? history?.currency;
  const isRefreshing = balanceQuery.isFetching || transactionsQuery.isFetching;

  return (
    <div className="mx-auto max-w-3xl py-8 space-y-6">
      <WalletBalanceCard
        amount={
          balanceQuery.isPending ? (
            <WalletBalanceSkeleton />
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {fmt(summary?.balance ?? 0, summary?.currency)}
            </p>
          )
        }
        actions={
          <>
            <Button variant="outline" size="icon" onClick={refreshAll} disabled={isRefreshing}>
              <RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Recharge
            </Button>
          </>
        }
      />

      <WalletActivityCard
        rangeTabs={
          <Tabs
            value={String(rangeDays)}
            onValueChange={(v) => setRangeDays(Number(v) as WalletHistoryRangeDays)}
          >
            <TabsList>
              {WALLET_HISTORY_RANGE_DAYS.map((d) => (
                <TabsTrigger key={d} value={String(d)}>
                  {d}d
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      >
        {transactionsQuery.isPending && <WalletTransactionsSkeleton />}
        {!transactionsQuery.isPending && history?.transactions.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No transactions in the last {rangeDays} days.
          </p>
        )}
        {!transactionsQuery.isPending &&
          history?.transactions.map((t) => {
            const meta = TYPE_META[t.type] ?? TYPE_META.ADJUSTMENT;
            const Icon = meta.icon;
            return (
              <div key={t.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString("en-IN")}
                      {t.shipmentId ? ` · Shipment ${t.shipmentId.slice(-8)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {meta.sign}
                    {fmt(t.amount, currency)}
                  </p>
                  <Badge variant="outline" className={`mt-0.5 text-[10px] ${STATUS_VARIANT[t.status] ?? ""}`}>
                    {t.status}
                  </Badge>
                </div>
              </div>
            );
          })}
      </WalletActivityCard>

      <TopUpModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        orgName={summary?.orgName}
        orgEmail={summary?.orgEmail ?? undefined}
        onSuccess={() => refreshAll()}
      />
    </div>
  );
}
