"use client";

import { useTransition } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  Plane,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/booking/CopyButton";
import {
  cancelIntlCarrierBooking,
  retryIntlCarrierBooking,
} from "@/actions/book/intlCarrierBooking.action";
import type { IntlCarrierPanelState } from "@/lib/booking/intlCarrierBooking";

/**
 * THE CARRIER, FROM OPS' SIDE
 * -----------------------------------------------------------------------------
 * An international booking places itself with the carrier vendor the moment it
 * is paid for, so on a normal day this panel is a read-out: service, carrier,
 * AWB, label. It earns its space on the bad day.
 *
 * ONE CONTROL, NOT TWO. The domestic panel beside it offers an auto-assign
 * opt-in; this one deliberately does not. International carriers are not
 * interchangeable — transit time, duty handling and customs paperwork all differ
 * — so there is no substitution an ops person could sensibly authorise. When the
 * service cannot be identified, the fix is the data, and the retry is what picks
 * the fix up.
 *
 * Content only, no card chrome: the page owns that.
 */

const STATUS_COPY: Record<
  IntlCarrierPanelState["status"],
  { label: string; tone: "muted" | "info" | "good" | "bad" }
> = {
  NOT_REQUIRED: { label: "Not applicable", tone: "muted" },
  PENDING: { label: "Waiting on the carrier", tone: "info" },
  BOOKED: { label: "Booked", tone: "good" },
  FAILED: { label: "Failed", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

const TONE_CLASS: Record<"muted" | "info" | "good" | "bad", string> = {
  muted: "text-muted-foreground",
  info: "text-sky-700 dark:text-sky-400",
  good: "text-emerald-700 dark:text-emerald-400",
  bad: "text-red-700 dark:text-red-400",
};

/**
 * The same row as DetailPrimitives' InfoRow, redeclared here rather than
 * imported: that module is server-side (it pulls a Prisma enum in), and this
 * panel is a client component. Copying twenty lines is cheaper than dragging the
 * Prisma client into the browser bundle.
 */
function Row({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value?: string | null;
  copyLabel?: string;
}) {
  if (!value) return null;

  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Plane className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground">{label}: </span>
        {copyLabel ? (
          <CopyButton
            value={value}
            label={copyLabel}
            className="align-middle text-sm font-medium"
          />
        ) : (
          <span className="font-medium text-foreground">{value}</span>
        )}
      </div>
    </div>
  );
}

export function IntlCarrierPanel({
  shipmentId,
  state,
}: {
  shipmentId: string;
  state: IntlCarrierPanelState;
}) {
  const [isRetrying, startRetry] = useTransition();
  const [isCancelling, startCancel] = useTransition();

  const status = STATUS_COPY[state.status];
  const hasAwb = Boolean(state.awbNumber);
  const busy = isRetrying || isCancelling;

  function handleRetry() {
    startRetry(async () => {
      const result = await retryIntlCarrierBooking({ shipmentId });
      if (result.success) {
        toast.success("Carrier booking queued", { description: result.message });
      } else {
        toast.error("Couldn't queue the booking", {
          description: result.message,
        });
      }
    });
  }

  function handleCancel() {
    startCancel(async () => {
      const result = await cancelIntlCarrierBooking({ shipmentId });
      if (result.success) {
        toast.success("Carrier booking cancelled", {
          description: result.message,
        });
      } else {
        toast.error("Couldn't cancel", { description: result.message });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Status</span>
        <span className={`text-xs font-medium ${TONE_CLASS[status.tone]}`}>
          {status.label}
        </span>
      </div>

      <Row label="Paid for" value={state.selectedProductName ?? "Not selected"} />
      {/* Only worth a row when it differs from what was bought — otherwise it is
          the same fact twice. */}
      {state.carrierName && state.carrierName !== state.selectedProductName && (
        <Row label="Carrier" value={state.carrierName} />
      )}
      <Row label="AWB" value={state.awbNumber} copyLabel="AWB" />
      <Row label="Booking id" value={state.orderId} copyLabel="Carrier booking id" />

      {state.error && (
        <div className="rounded-md border-l-2 border-red-400 bg-red-50/60 px-2.5 py-1.5 dark:border-red-600 dark:bg-red-950/20">
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-red-800 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>{state.error}</span>
          </p>
          {state.attempts > 0 && (
            <p className="mt-1 pl-4.5 text-[10px] text-red-700/70 dark:text-red-400/70">
              {state.attempts} attempt{state.attempts === 1 ? "" : "s"} so far.
              The customer&apos;s payment is untouched.
            </p>
          )}
        </div>
      )}

      {state.status === "PENDING" && !hasAwb && (
        <p className="rounded-md border-l-2 border-sky-400 bg-sky-50/60 px-2.5 py-1.5 text-xs leading-relaxed text-sky-800 dark:border-sky-600 dark:bg-sky-950/20 dark:text-sky-300">
          The booking is queued with {state.vendorName ?? "the carrier"}. An AWB
          normally comes back within a minute; the page shows it on refresh.
        </p>
      )}

      {/* The one case where an empty panel needs explaining. Without this, a row
          that was never queued looks identical to one the job skipped. */}
      {state.status === "NOT_REQUIRED" && !state.autoBookEnabled && (
        <p className="rounded-md border-l-2 border-amber-400 bg-amber-50/60 px-2.5 py-1.5 text-xs leading-relaxed text-amber-800 dark:border-amber-600 dark:bg-amber-950/20 dark:text-amber-300">
          Automatic carrier booking is switched off, so this export was not
          queued. Book it in the vendor&apos;s panel, or use the button below to
          place it through the API for this shipment only.
        </p>
      )}

      {state.labelUrl && (
        <Button asChild variant="outline" size="sm" className="h-8 w-full text-xs">
          <a href={state.labelUrl} target="_blank" rel="noopener noreferrer">
            <Download className="mr-1.5 h-3 w-3" aria-hidden />
            Shipping label
          </a>
        </Button>
      )}

      {state.trackingUrl && (
        <a
          href={state.trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-xs text-primary underline-offset-2 hover:underline"
        >
          Open carrier tracking
        </a>
      )}

      {!hasAwb && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Retrying re-drives the same booking job, so it cannot create a second
            consignment. If it failed on missing paperwork, fix the exporter
            profile first.
          </p>

          <Button
            size="sm"
            className="h-8 w-full text-xs"
            onClick={handleRetry}
            disabled={busy}
          >
            {isRetrying ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Queueing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3 w-3" />
                {state.status === "FAILED"
                  ? "Retry booking"
                  : "Book with carrier"}
              </>
            )}
          </Button>
        </div>
      )}

      {state.orderId && state.status !== "CANCELLED" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full text-xs text-muted-foreground hover:text-destructive"
          onClick={handleCancel}
          disabled={busy}
        >
          {isCancelling ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Cancelling...
            </>
          ) : (
            <>
              <X className="mr-1.5 h-3 w-3" />
              Cancel carrier booking
            </>
          )}
        </Button>
      )}
    </div>
  );
}
