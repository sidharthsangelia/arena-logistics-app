"use client";

import * as React from "react";
import { Banknote, CircleCheck, HandCoins, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RecordPaymentSheet } from "@/components/wallet/admin/RecordPaymentSheet";
import type { CollectionRow } from "@/lib/wallet/adminLedger";
import {
  AGING_TONE_CLASS,
  COLLECTION_STATUS_CONFIG,
  PAYMENT_METHOD_CONFIG,
  agingTone,
} from "@/lib/wallet/collections";
import type { PaymentCollectionMethod } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/utils/format";

/**
 * Payment tracking for a booking that shipped before paying, shown on the
 * shipment itself.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE WALLETS SCREEN
 * The wallets screen is admin-only, but recording a payment is deliberately open
 * to any Arena member, because the person taking cash when a parcel reaches the
 * hub is often not an admin. Without this card they would have had no way to
 * record it, and the money would end up on paper instead. Reversing a payment
 * stays admin-only, so members see the history read-only.
 */

export function PaymentCollectionCard({
  collection,
  isArenaAdmin,
}: {
  collection: CollectionRow;
  isArenaAdmin: boolean;
}) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const statusConfig = COLLECTION_STATUS_CONFIG[collection.collectionStatus];
  const settled = collection.owed <= 0;
  const total = collection.quotedTotal ?? 0;
  const percentPaid = total > 0 ? Math.min(100, (collection.collected / total) * 100) : 0;

  const livePayments = collection.payments.filter((p) => !p.reversedAt);
  const hasReversals = collection.payments.some((p) => p.reversedAt);

  return (
    <TooltipProvider delayDuration={200}>
      <Card
        className={cn(
          "border-l-4",
          settled ? "border-l-emerald-500" : "border-l-amber-500",
        )}
      >
        <CardHeader className="border-b py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Payment on arrival</CardTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className={cn("cursor-help", statusConfig.chip)}>
                    {statusConfig.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">{statusConfig.hint}</TooltipContent>
              </Tooltip>
            </div>

            {!settled && collection.collectionStatus !== "WRITTEN_OFF" && (
              <span
                className={cn("text-xs", AGING_TONE_CLASS[agingTone(collection.ageDays)])}
              >
                Waiting{" "}
                {collection.ageDays === 0
                  ? "since today"
                  : collection.ageDays === 1
                    ? "1 day"
                    : `${collection.ageDays} days`}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {collection.quotedTotal == null ? (
            <p className="text-sm text-muted-foreground">
              This booking has no price on it yet, so there is no amount to collect
              against. Add the price to the shipment first.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Figure label="Booking total" value={formatMoney(total, collection.currency)} />
                <Figure
                  label="Paid so far"
                  value={formatMoney(collection.collected, collection.currency)}
                  tone={collection.collected > 0 ? "good" : undefined}
                />
                <Figure
                  label="Still owed"
                  value={formatMoney(collection.owed, collection.currency)}
                  tone={settled ? "good" : "warn"}
                />
              </div>

              {collection.collected > 0 && !settled && (
                <div className="space-y-1">
                  <Progress value={percentPaid} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {Math.round(percentPaid)}% of the booking has been paid.
                  </p>
                </div>
              )}

              {settled ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {collection.collectionStatus === "WRITTEN_OFF"
                      ? "This balance was written off, so nothing is owed."
                      : "Fully paid. Nothing left to collect on this booking."}
                  </span>
                </div>
              ) : (
                <Button size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
                  <HandCoins className="h-3.5 w-3.5" />
                  Record a payment
                </Button>
              )}

              {/* History. Read-only here; reversing happens in the sheet, and only
                  admins get that control. */}
              {livePayments.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Payments received
                  </p>

                  {livePayments.map((payment) => {
                    const config =
                      PAYMENT_METHOD_CONFIG[payment.method as PaymentCollectionMethod];

                    return (
                      <div
                        key={payment.id}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <span className="flex items-center gap-1.5">
                          {config?.icon && <config.icon className="h-3.5 w-3.5 shrink-0" />}
                          <span className="font-medium tabular-nums">
                            {formatMoney(payment.amount, payment.currency)}
                          </span>
                          <span className="text-muted-foreground">
                            {config?.label ?? payment.method}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(payment.collectedAt)}
                          {payment.recordedByName ? ` · ${payment.recordedByName}` : ""}
                        </span>
                      </div>
                    );
                  })}

                  {hasReversals && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Undo2 className="h-3 w-3 shrink-0" />
                      Some payments on this booking were reversed. Open the payment panel
                      to see them.
                    </p>
                  )}
                </div>
              )}

              {(livePayments.length > 0 || hasReversals) && settled && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setSheetOpen(true)}
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  View payment history
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <RecordPaymentSheet
        row={collection}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isArenaAdmin={isArenaAdmin}
      />
    </TooltipProvider>
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
    <div className="rounded-md border px-3 py-2">
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
