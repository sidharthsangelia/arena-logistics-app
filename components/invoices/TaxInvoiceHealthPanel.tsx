"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { retryTaxInvoiceAction } from "@/actions/invoices/taxInvoices.action";
import type { TaxInvoiceRow } from "@/lib/invoices/tax/queries";

/**
 * The operational view of automatic invoicing: which invoices did not come out.
 *
 * This panel is the reason the whole feature can be trusted. A background job
 * that fails quietly leaves a customer with no tax invoice and nobody knowing,
 * which is the single failure mode worth building against. Everything that went
 * wrong surfaces here with its error attached and a button to try again.
 *
 * Deliberately shows nothing when there is nothing wrong. An empty panel that
 * is always on screen trains people to stop reading it.
 */
export function TaxInvoiceHealthPanel({
  stuck,
  missing,
}: {
  stuck: TaxInvoiceRow[];
  missing: Array<{ id: string; shipmentNumber: string; bookedAt: Date | null }>;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  const total = stuck.length + missing.length;

  if (total === 0) {
    return (
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Every booked shipment has its tax invoice.
      </div>
    );
  }

  const retry = async (shipmentId: string, label: string) => {
    setPending(shipmentId);
    const result = await retryTaxInvoiceAction(shipmentId);
    setPending(null);

    if (result.ok) toast.success(`Queued invoice generation for ${label}.`);
    else toast.error(result.error);
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        {/* Colour as a functional cue: this is the one panel on the page that
            means somebody has to do something. */}
        <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
        <h2 className="text-sm font-semibold">
          {total} {total === 1 ? "invoice needs" : "invoices need"} attention
        </h2>
      </div>

      <div className="divide-y">
        {stuck.map((row) => (
          <div
            key={row.id}
            className="flex items-start justify-between gap-4 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {row.shipmentNumber}
                {row.orgName && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {row.orgName}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.generationStatus === "FAILED"
                  ? `Failed after ${row.generationAttempts} ${
                      row.generationAttempts === 1 ? "attempt" : "attempts"
                    }`
                  : "Staged but never generated"}
                {row.generationError ? `: ${row.generationError}` : "."}
              </p>
            </div>

            <RetryButton
              busy={pending === row.shipmentId}
              onClick={() => retry(row.shipmentId, row.shipmentNumber)}
            />
          </div>
        ))}

        {missing.map((row) => (
          <div
            key={row.id}
            className="flex items-start justify-between gap-4 px-5 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium tabular-nums">
                {row.shipmentNumber}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Booked with no invoice record at all.
              </p>
            </div>

            <RetryButton
              busy={pending === row.id}
              onClick={() => retry(row.id, row.shipmentNumber)}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}

function RetryButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={onClick}>
      {busy ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
      )}
      Retry
    </Button>
  );
}
