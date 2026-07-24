"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Minus, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { adjustWalletBalanceAction } from "@/actions/wallet/adminWallet.action";
import { MAX_MANUAL_AMOUNT } from "@/lib/wallet/schema";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";

/**
 * Moving money in an organisation's wallet by hand.
 *
 * There is no undo. A wrong credit can be spent on a booking before anyone
 * notices, and the only remedy is a second adjustment in the other direction. So
 * the dialog makes you read back what you are about to do, with the before and
 * after balance spelled out, before it will submit.
 *
 * The reason field is required rather than encouraged. Six months later, an
 * unexplained credit is indistinguishable from a bug.
 */

export type AdjustBalanceTarget = {
  orgId: string;
  orgName: string;
  balance: number;
  currency: string;
};

export function AdjustBalanceDialog({
  target,
  open,
  onOpenChange,
}: {
  target: AdjustBalanceTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Keyed on the org so switching rows resets the form on mount rather
            than through an effect, and kept mounted while the dialog animates out. */}
        {target && (
          <AdjustForm
            key={target.orgId}
            target={target}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Direction = "credit" | "debit";

function AdjustForm({
  target,
  onDone,
}: {
  target: AdjustBalanceTarget;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<"form" | "confirm">("form");
  const [direction, setDirection] = useState<Direction>("credit");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const amount = Number(amountText);
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= MAX_MANUAL_AMOUNT;
  const reasonValid = reason.trim().length >= 5;

  const projected =
    direction === "credit" ? target.balance + amount : target.balance - amount;
  const wouldGoNegative = direction === "debit" && projected < 0;

  const canReview = amountValid && reasonValid && !wouldGoNegative;

  const review = () => {
    setError(null);

    if (!amountValid) {
      setError(
        amount > MAX_MANUAL_AMOUNT
          ? `That is more than the ${formatMoney(MAX_MANUAL_AMOUNT, target.currency)} limit for a single entry. Check the amount.`
          : "Enter an amount greater than zero.",
      );
      return;
    }

    if (!reasonValid) {
      setError("Write a short reason, so this still makes sense months from now.");
      return;
    }

    if (wouldGoNegative) {
      setError(
        `That would take the balance below zero. There is ${formatMoney(
          target.balance,
          target.currency,
        )} available to remove.`,
      );
      return;
    }

    setStep("confirm");
  };

  const submit = () => {
    startTransition(async () => {
      const result = await adjustWalletBalanceAction({
        orgId: target.orgId,
        direction,
        amount,
        reason: reason.trim(),
        reference: reference.trim() || null,
      });

      if (!result.ok) {
        setError(result.error);
        setStep("form");
        return;
      }

      toast.success(
        direction === "credit"
          ? `Added ${formatMoney(amount, target.currency)} to ${target.orgName}.`
          : `Removed ${formatMoney(amount, target.currency)} from ${target.orgName}.`,
        {
          description: `New balance is ${formatMoney(result.balance, result.currency)}.`,
        },
      );

      router.refresh();
      onDone();
    });
  };

  if (step === "confirm") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Check this before it goes through</DialogTitle>
          <DialogDescription>
            This cannot be undone. The only way back is another adjustment in the
            opposite direction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              {direction === "credit" ? "Adding" : "Removing"}{" "}
              {formatMoney(amount, target.currency)}{" "}
              {direction === "credit" ? "to" : "from"} {target.orgName}
            </p>

            <div className="mt-3 flex items-center gap-2 text-muted-foreground">
              <span className="tabular-nums">{formatMoney(target.balance, target.currency)}</span>
              <span aria-hidden>&rarr;</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  direction === "credit" ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {formatMoney(projected, target.currency)}
              </span>
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">Reason recorded on the ledger</p>
            <p className="rounded-md border px-3 py-2">{reason.trim()}</p>
          </div>

          {reference.trim() && (
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">Reference</p>
              <p className="rounded-md border px-3 py-2 font-mono text-xs">{reference.trim()}</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep("form")}
            disabled={pending}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Change something
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending
              ? "Saving..."
              : direction === "credit"
                ? "Yes, add the money"
                : "Yes, remove the money"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Adjust {target.orgName}&apos;s wallet</DialogTitle>
        <DialogDescription>
          Use this for money that did not come through the app, such as a bank
          transfer or a cheque, or to correct an earlier entry.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-2">
        {/* Direction. Two large targets rather than a dropdown, because picking the
            wrong direction is the most expensive mistake available here. */}
        <div className="space-y-2">
          <Label>What are you doing?</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection("credit")}
              aria-pressed={direction === "credit"}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                direction === "credit"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "hover:bg-muted",
              )}
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">Add money</span>
                <span className="block text-xs opacity-80">They paid us offline</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDirection("debit")}
              aria-pressed={direction === "debit"}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                direction === "debit"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : "hover:bg-muted",
              )}
            >
              <Minus className="h-4 w-4 shrink-0" />
              <span>
                <span className="block font-medium">Remove money</span>
                <span className="block text-xs opacity-80">Fixing an over-credit</span>
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-amount">Amount</Label>
          <Input
            id="adjust-amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="tabular-nums"
          />
          <p className="text-xs text-muted-foreground">
            Balance now is {formatMoney(target.balance, target.currency)}.
            {amountValid && !wouldGoNegative && (
              <> It will become {formatMoney(projected, target.currency)}.</>
            )}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-reason">
            Reason <span className="text-muted-foreground">(required)</span>
          </Label>
          <Textarea
            id="adjust-reason"
            rows={2}
            placeholder="NEFT received on 22 July against invoice 4471"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Anyone reading the ledger later should be able to tell what this was for.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-reference">
            Reference <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="adjust-reference"
            placeholder="Bank UTR, cheque number, UPI reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>

        {wouldGoNegative && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A wallet cannot go below zero. The most you can remove is{" "}
            {formatMoney(target.balance, target.currency)}.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={review} disabled={!canReview || pending}>
          Review
        </Button>
      </DialogFooter>
    </>
  );
}
