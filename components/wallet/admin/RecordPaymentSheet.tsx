"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  recordPaymentCollectionAction,
  reversePaymentCollectionAction,
} from "@/actions/wallet/paymentCollection.action";
import type { CollectionRow } from "@/lib/wallet/adminLedger";
import {
  COLLECTION_STATUS_CONFIG,
  PAYMENT_METHOD_CONFIG,
  REFERENCE_PLACEHOLDER,
} from "@/lib/wallet/collections";
import type { PaymentCollectionMethod } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney } from "@/utils/format";

/**
 * Everything about one booking's money: what is owed, what has come in, and a form
 * to record the next payment.
 *
 * One panel rather than a form and a separate history view, because the question
 * "how much should I take from this customer" cannot be answered without seeing
 * what they have already paid.
 */

// ---------------------------------------------------------------------------
// datetime-local plumbing
//
// The input speaks the browser's local time with no zone, while the action wants
// an ISO string with an offset. Both conversions route through the local zone,
// which for Arena ops is IST, matching the pinned reporting timezone elsewhere.
// ---------------------------------------------------------------------------

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function RecordPaymentSheet({
  row,
  open,
  onOpenChange,
  isArenaAdmin,
}: {
  row: CollectionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isArenaAdmin: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {/* Keyed on the booking so opening a different row starts clean on mount
            rather than through an effect. Kept mounted while the sheet closes. */}
        {row && (
          <PaymentPanel
            key={row.shipmentId}
            row={row}
            isArenaAdmin={isArenaAdmin}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PaymentPanel({
  row,
  isArenaAdmin,
  onClose,
}: {
  row: CollectionRow;
  isArenaAdmin: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Prefilled with the whole outstanding balance, because paying in full is the
  // common case and part payments are the exception.
  const [amountText, setAmountText] = React.useState(
    row.owed > 0 ? String(row.owed) : "",
  );
  const [method, setMethod] = React.useState<PaymentCollectionMethod>("CASH");
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [collectedAt, setCollectedAt] = React.useState(() => toLocalInput(new Date()));

  // Which payment is being reversed, and why. Inline on the card rather than a
  // nested dialog, so the amount being reversed stays visible while typing the
  // reason for it.
  const [reversingId, setReversingId] = React.useState<string | null>(null);
  const [reversalReason, setReversalReason] = React.useState("");

  const amount = Number(amountText);
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= row.owed + 0.01;
  const settled = row.owed <= 0;

  const livePayments = row.payments.filter((p) => !p.reversedAt);
  const reversedPayments = row.payments.filter((p) => p.reversedAt);

  const statusConfig = COLLECTION_STATUS_CONFIG[row.collectionStatus];

  const submit = () => {
    setError(null);

    const iso = fromLocalInput(collectedAt);
    if (!iso) {
      setError("Pick when the money was received.");
      return;
    }

    startTransition(async () => {
      const result = await recordPaymentCollectionAction({
        shipmentId: row.shipmentId,
        amount,
        method,
        reference: reference.trim() || null,
        note: note.trim() || null,
        collectedAt: iso,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(result.message);
      router.refresh();
      onClose();
    });
  };

  const confirmReverse = () => {
    if (!reversingId) return;

    startTransition(async () => {
      const result = await reversePaymentCollectionAction({
        collectionId: reversingId,
        reason: reversalReason.trim(),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message);
      router.refresh();
      onClose();
    });
  };

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle className="flex items-center gap-2">
          <span className="font-mono text-base">{row.shipmentNumber}</span>
          <Badge variant="outline" className={statusConfig.chip}>
            {statusConfig.label}
          </Badge>
        </SheetTitle>
        <SheetDescription>
          {row.orgName}
          {row.clientName ? ` for ${row.clientName}` : ""}. Booked{" "}
          {row.ageDays === 0 ? "today" : `${row.ageDays} days ago`}.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-6 px-4 py-5">
        {/* ── Where this booking stands ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <Figure label="Booking total" value={formatMoney(row.quotedTotal ?? 0, row.currency)} />
          <Figure
            label="Paid so far"
            value={formatMoney(row.collected, row.currency)}
            tone={row.collected > 0 ? "good" : undefined}
          />
          <Figure
            label="Still owed"
            value={formatMoney(row.owed, row.currency)}
            tone={row.owed > 0 ? "warn" : "good"}
          />
        </div>

        <Separator />

        {/* ── Record a payment ──────────────────────────────────────────── */}
        {settled ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Nothing left to collect</p>
              <p className="mt-0.5 text-xs">
                The full amount has been recorded against this booking.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Record a payment</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enter what was actually received. Part payments are fine, and you can
                add more later.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="collect-amount">Amount received</Label>
                <Input
                  id="collect-amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max={row.owed}
                  step="0.01"
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  className="tabular-nums"
                />
                {amountText && !amountValid && (
                  <p className="text-xs text-destructive">
                    Enter an amount between zero and {formatMoney(row.owed, row.currency)}.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collect-method">How they paid</Label>
                <Select
                  value={method}
                  onValueChange={(next) => setMethod(next as PaymentCollectionMethod)}
                >
                  <SelectTrigger id="collect-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_METHOD_CONFIG) as PaymentCollectionMethod[]).map(
                      (key) => (
                        <SelectItem key={key} value={key}>
                          {PAYMENT_METHOD_CONFIG[key].label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="collect-when">When did the money arrive?</Label>
              <Input
                id="collect-when"
                type="datetime-local"
                value={collectedAt}
                max={toLocalInput(new Date())}
                onChange={(e) => setCollectedAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Not when you are entering it. Friday&apos;s cash entered on Monday should
                still say Friday.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="collect-reference">
                Reference <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="collect-reference"
                placeholder={REFERENCE_PLACEHOLDER[method]}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="collect-note">
                Note <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="collect-note"
                rows={2}
                placeholder="Collected at the Dwarka hub by Imran"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* ── What has come in already ──────────────────────────────────── */}
        {row.payments.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Payments recorded</h3>

              {livePayments.map((payment) => {
                const MethodIcon =
                  PAYMENT_METHOD_CONFIG[payment.method as PaymentCollectionMethod]?.icon;

                return (
                  <div key={payment.id} className="rounded-lg border px-3 py-2.5 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium tabular-nums">
                          {MethodIcon && <MethodIcon className="h-3.5 w-3.5 shrink-0" />}
                          {formatMoney(payment.amount, payment.currency)}
                          <span className="font-normal text-muted-foreground">
                            {PAYMENT_METHOD_CONFIG[payment.method as PaymentCollectionMethod]
                              ?.label ?? payment.method}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(payment.collectedAt)}
                          {payment.recordedByName ? ` · recorded by ${payment.recordedByName}` : ""}
                        </p>
                        {payment.reference && (
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {payment.reference}
                          </p>
                        )}
                        {payment.note && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{payment.note}</p>
                        )}
                      </div>

                      {isArenaAdmin && reversingId !== payment.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                          onClick={() => {
                            setReversingId(payment.id);
                            setReversalReason("");
                          }}
                          disabled={pending}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          Reverse
                        </Button>
                      )}
                    </div>

                    {reversingId === payment.id && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <Label htmlFor={`reverse-${payment.id}`} className="text-xs">
                          Why is this being reversed?
                        </Label>
                        <Textarea
                          id={`reverse-${payment.id}`}
                          rows={2}
                          autoFocus
                          placeholder="Entered against the wrong booking"
                          value={reversalReason}
                          onChange={(e) => setReversalReason(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          The payment stays on the record, marked as reversed with this
                          reason. The balance owed goes back up.
                        </p>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setReversingId(null)}
                            disabled={pending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={confirmReverse}
                            disabled={pending || reversalReason.trim().length < 5}
                          >
                            {pending ? "Reversing..." : "Reverse this payment"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {reversedPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 text-sm"
                >
                  <p className="font-medium tabular-nums text-muted-foreground line-through">
                    {formatMoney(payment.amount, payment.currency)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Reversed{payment.reversedByName ? ` by ${payment.reversedByName}` : ""}
                    {payment.reversedAt ? ` on ${formatDateTime(payment.reversedAt)}` : ""}
                  </p>
                  {payment.reversalReason && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Reason: {payment.reversalReason}
                    </p>
                  )}
                </div>
              ))}

              {!isArenaAdmin && livePayments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Only an admin can reverse a payment that was recorded by mistake.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <SheetFooter className="border-t">
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/arena-dashboard/bookings/${row.shipmentId}`}>Open the booking</Link>
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Close
            </Button>
            {!settled && (
              <Button onClick={submit} disabled={!amountValid || pending}>
                {pending ? "Saving..." : "Record payment"}
              </Button>
            )}
          </div>
        </div>
      </SheetFooter>
    </>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}
