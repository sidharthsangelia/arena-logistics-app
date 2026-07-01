"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wallet, Plus, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getWalletSummaryAction } from "@/actions/wallet/getWalletSummary.action";
import { TopUpModal } from "@/components/wallet/TopUpModal";

function fmt(amount: number | string, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

interface WalletSufficiencyInfo {
  loading: boolean;
  sufficient: boolean;
  balance: number | null;
}

interface WalletPaymentSummaryProps {
  /** The exact amount that will be debited on submit — pass selectedService.price. */
  requiredAmountRupees: number;
  currency?: string;
  /**
   * Fired whenever loading/sufficiency changes (initial load, manual refresh,
   * post-topup refresh). Lets a parent (e.g. a wizard) gate its own submit
   * button without duplicating the balance fetch.
   */
  onSufficiencyChange?: (info: WalletSufficiencyInfo) => void;
  /**
   * Fired after a top-up is confirmed successful — separate from the
   * internal balance refresh, so a parent can react (e.g. auto-submit a
   * pending booking) without polling this component's state.
   */
  onTopUpSuccess?: () => void;
}

/**
 * Shows current balance vs. required amount, with an inline top-up flow.
 * Purely informational by default — parents that want to gate a submit
 * button or auto-continue after top-up should use onSufficiencyChange /
 * onTopUpSuccess rather than assuming this component blocks anything
 * itself. The actual debit is always re-verified atomically server-side
 * inside createShipmentAction; this component only shortens the common
 * path so users aren't surprised at the last step.
 */
export function WalletPaymentSummary({
  requiredAmountRupees,
  currency = "INR",
  onSufficiencyChange,
  onTopUpSuccess,
}: WalletPaymentSummaryProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [orgName, setOrgName] = useState<string | undefined>();
  const [orgEmail, setOrgEmail] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Keep the latest callbacks in refs so `load` doesn't need them in its
  // dependency array — avoids re-creating `load` (and re-firing effects)
  // every time a parent passes a fresh inline function on re-render.
  const onSufficiencyChangeRef = useRef(onSufficiencyChange);
  const onTopUpSuccessRef = useRef(onTopUpSuccess);
  useEffect(() => {
    onSufficiencyChangeRef.current = onSufficiencyChange;
    onTopUpSuccessRef.current = onTopUpSuccess;
  });

  const load = useCallback(async () => {
    setLoading(true);
    onSufficiencyChangeRef.current?.({ loading: true, sufficient: false, balance: null });
    try {
      const summary = await getWalletSummaryAction();
      const bal = Number(summary.balance);
      setBalance(bal);
      setOrgName(summary.orgName);
      setOrgEmail(summary.orgEmail ?? undefined);
      onSufficiencyChangeRef.current?.({
        loading: false,
        sufficient: bal >= requiredAmountRupees,
        balance: bal,
      });
    } catch {
      // Fail closed: an unknown balance should never read as "sufficient".
      setBalance(null);
      onSufficiencyChangeRef.current?.({ loading: false, sufficient: false, balance: null });
    } finally {
      setLoading(false);
    }
  }, [requiredAmountRupees]);

  useEffect(() => {
    load();
  }, [load]);

  const sufficient = balance !== null && balance >= requiredAmountRupees;
  const shortfall = balance !== null ? Math.max(0, requiredAmountRupees - balance) : 0;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Wallet className="h-4 w-4" />
          Wallet balance
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          aria-label="Refresh balance"
        >
          <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        </button>
      </div>

      <div className="space-y-2 px-4 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current balance</span>
          <span className="font-medium">{loading ? "…" : fmt(balance ?? 0, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Order total</span>
          <span className="font-medium">{fmt(requiredAmountRupees, currency)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 font-semibold">
          <span>{sufficient ? "Balance after payment" : "You still need"}</span>
          <span className={sufficient ? "text-green-700" : "text-amber-700"}>
            {loading
              ? "…"
              : sufficient
                ? fmt((balance ?? 0) - requiredAmountRupees, currency)
                : fmt(shortfall, currency)}
          </span>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        {!loading && sufficient && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Sufficient balance — ready to pay and book.
          </div>
        )}
        {!loading && !sufficient && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Top up {fmt(shortfall, currency)} more to book this shipment.
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setModalOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add funds
            </Button>
          </div>
        )}
      </div>

      <TopUpModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        suggestedAmount={shortfall > 0 ? shortfall : undefined}
        reasonLabel="this shipment"
        orgName={orgName}
        orgEmail={orgEmail}
        onSuccess={async () => {
          await load();
          onTopUpSuccessRef.current?.();
        }}
      />
    </div>
  );
}