"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { retryTaxInvoiceAction } from "@/actions/invoices/taxInvoices.action";

/**
 * Booked shipments that have no invoice row at all.
 *
 * ── WHY THIS IS STILL A PANEL AND NOT A ROW ─────────────────────────────────
 * The invoice table below shows every ShipmentInvoice, including the ones whose
 * generation failed or stalled: they carry a "Needs attention" badge, the error
 * in their tooltip, and a retry in their row menu. That covers half of what this
 * panel used to.
 *
 * The other half cannot be a row, because there is nothing to make a row out of.
 * These are bookings where staging the invoice AND the job both failed, so no
 * document exists to list. Rare, and precisely why it is worth being able to
 * ask: a background job that fails silently and leaves nothing behind is the one
 * failure mode worth building against.
 *
 * Renders nothing when there is nothing wrong. A panel that is always on screen
 * is a panel people stop reading.
 */
export function TaxInvoiceHealthPanel({
  missing,
}: {
  missing: Array<{ id: string; shipmentNumber: string; bookedAt: Date | null }>;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  if (missing.length === 0) return null;

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
          {missing.length}{" "}
          {missing.length === 1
            ? "booked shipment has no invoice"
            : "booked shipments have no invoice"}
        </h2>
      </div>

      <div className="divide-y">
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
                Booked with no invoice record at all, so there is nothing in the
                list below to retry.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={pending === row.id}
              onClick={() => retry(row.id, row.shipmentNumber)}
            >
              {pending === row.id ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="mr-1.5 h-4 w-4" aria-hidden />
              )}
              Generate it
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
