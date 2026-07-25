"use client";

import { useEffect, useState, useCallback } from "react";
import { Wallet, Plus, RefreshCw, ArrowUpRight, ArrowDownLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
 
import { getWalletSummaryAction } from "@/actions/wallet/getWalletSummary.action";
import { TopUpModal } from "@/components/wallet/TopUpModal";

type Summary = Awaited<ReturnType<typeof getWalletSummaryAction>>;

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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWalletSummaryAction();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl py-8 space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Wallet balance</p>
              {loading ? (
                <Skeleton className="mt-1.5 h-8 w-40" />
              ) : (
                <p className="text-3xl font-bold text-foreground">
                  {fmt(summary?.balance ?? 0, summary?.currency)}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Recharge
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold">Recent activity</p>
        </CardHeader>
        <CardContent className="divide-y">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
                <div className="space-y-1.5 text-right">
                  <Skeleton className="ml-auto h-4 w-20" />
                  <Skeleton className="ml-auto h-3 w-14" />
                </div>
              </div>
            ))}
          {!loading && summary?.transactions.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
          )}
          {!loading &&
            summary?.transactions.map((t) => {
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
                      {fmt(t.amount, summary.currency)}
                    </p>
                    <Badge variant="outline" className={`mt-0.5 text-[10px] ${STATUS_VARIANT[t.status] ?? ""}`}>
                      {t.status}
                    </Badge>
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>

      <TopUpModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        orgName={summary?.orgName}
        orgEmail={summary?.orgEmail ?? undefined}
        onSuccess={() => load()}
      />
    </div>
  );
}