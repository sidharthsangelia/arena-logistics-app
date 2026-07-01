"use client";

import { useState } from "react";
import { Loader2, Wallet, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { createTopUpOrderAction } from "@/actions/wallet/createTopUpOrder.action";
import { verifyTopUpPaymentAction } from "@/actions/wallet/verifyTopUpPayment.action";

declare global {
  interface Window {
    Razorpay: any;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpayScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Razorpay checkout script."));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

const PRESETS = [500, 1000, 2500, 5000];

interface TopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled amount, e.g. the detected shortfall during booking. Always editable — user can increase it. */
  suggestedAmount?: number;
  /** Shown as context, e.g. "cover shipment SHP-2026-00123" */
  reasonLabel?: string;
  orgName?: string;
  orgEmail?: string;
  onSuccess?: (newBalance: string) => void;
}

export function TopUpModal({
  open,
  onOpenChange,
  suggestedAmount,
  reasonLabel,
  orgName,
  orgEmail,
  onSuccess,
}: TopUpModalProps) {
  const [amount, setAmount] = useState<string>(
    suggestedAmount ? Math.ceil(suggestedAmount).toString() : "1000",
  );
  const [stage, setStage] = useState<
    "idle" | "opening" | "verifying" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const numericAmount = Number(amount);
  const isValid = Number.isFinite(numericAmount) && numericAmount >= 100;

  const handlePay = async () => {
    setError(null);
    if (!isValid) {
      setError("Enter an amount of at least ₹100.");
      return;
    }

    setStage("opening");
    try {
      await loadRazorpayScript();

      const order = await createTopUpOrderAction({
        amountRupees: numericAmount,
        shipmentContext: reasonLabel
          ? { shortfallFor: reasonLabel }
          : undefined,
      });

      if (!order.success) {
        setError(order.error);
        setStage("error");
        return;
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: orgName ?? "Wallet Top-up",
        description: reasonLabel ?? "Wallet recharge",
        prefill: orgEmail ? { email: orgEmail } : undefined,
        theme: { color: "#0f172a" },
        handler: async (response: any) => {
          setStage("verifying");
          const result = await verifyTopUpPaymentAction({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });

          if (result.success) {
            setStage("idle");
            onSuccess?.(result.balance);
            onOpenChange(false);
          } else if ("pending" in result && result.pending) {
            // Signature checked out; webhook just hasn't landed in our
            // short poll window yet. The money is safe — let the caller
            // refresh balance a moment later rather than showing an error.
            setStage("idle");
            onSuccess?.("");
            onOpenChange(false);
          } else {
            setError(result.error);
            setStage("error");
          }
        },
        modal: {
          ondismiss: () => setStage("idle"),
        },
      });

      rzp.on("payment.failed", (resp: any) => {
        setError(
          resp.error?.description ?? "Payment failed. Please try again.",
        );
        setStage("error");
      });

      rzp.open();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open payment window.",
      );
      setStage("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Recharge wallet
          </DialogTitle>
          <DialogDescription className="sr-only">
            Add funds to your wallet to book shipments.
          </DialogDescription>
        </DialogHeader>

        {reasonLabel && suggestedAmount ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your wallet balance is short. Top up at least{" "}
              <strong>
                ₹{Math.ceil(suggestedAmount).toLocaleString("en-IN")}
              </strong>{" "}
              to book this shipment — or add more to cover future shipments too.
            </span>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p.toString())}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  amount === p.toString()
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border"
                }`}
              >
                ₹{p.toLocaleString("en-IN")}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Amount (₹)</label>
            <Input
              type="number"
              min={100}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum ₹100 per top-up.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            className="w-full"
            disabled={!isValid || stage === "opening" || stage === "verifying"}
            onClick={handlePay}
          >
            {stage === "opening" || stage === "verifying" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {stage === "verifying"
                  ? "Confirming payment…"
                  : "Opening payment window…"}
              </>
            ) : (
              `Pay ₹${isValid ? numericAmount.toLocaleString("en-IN") : "—"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
