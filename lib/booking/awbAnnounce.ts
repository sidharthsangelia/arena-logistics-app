/**
 * TELLING THE CUSTOMER THEIR AIRWAY BILL IS READY
 * -----------------------------------------------------------------------------
 * One helper, called by both booking jobs — bookDomesticCourier and
 * bookInternationalCarrier — once a waybill has been issued and its label filed.
 *
 * WHY IT EXISTS AT ALL. The booking confirmation email makes a specific promise:
 * "As soon as your airway bill is issued, we will send it to you along with
 * everything you need to follow the journey." (See the BOOKED copy in
 * lib/email/shipment/copy.ts.) Until this existed nothing kept that promise — the
 * label appeared on the shipment page and the customer had to think to go and
 * look. Now they get an in-app notification and an email with the label attached.
 *
 * WHY IT IS SHARED. Domestic and international issue waybills through completely
 * different vendors and different jobs, but from the customer's side the event is
 * identical: their label is ready. Writing it twice is how the two would drift
 * into telling customers different things about the same thing.
 *
 * ── SENT EXACTLY ONCE, AND WHY THAT TAKES CARE ──────────────────────────────
 * The jobs are durable and ops can re-drive them by hand, so this can genuinely
 * be reached more than once for one consignment. Step memoisation only covers a
 * retry WITHIN a run; a fresh re-drive has no memory of the earlier one.
 *
 * So the NOTIFICATION ROW IS THE LEDGER. It carries a unique dedupeKey of
 * `awb-ready:<shipmentId>:<awbNumber>`, and notifyAwbReady returns true only when
 * this call is the one that inserted it. The email is sent only on that true.
 * Idempotency therefore rests on a database constraint rather than a
 * check-then-act two runs could both pass, and it needs no extra column.
 *
 * The ledger row is claimed BEFORE the email is attempted. That ordering is
 * deliberate: it means the failure mode is a customer who was notified in-app but
 * whose email bounced (recoverable, visible in Sentry, and the label is still on
 * their page) rather than a customer emailed the same label twice. Keyed on the
 * AWB as well as the shipment, so a consignment that is cancelled and rebooked
 * under a NEW waybill is announced again, which is correct.
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";

import { sendAwbReadyEmail } from "@/lib/email/shipment/send";
import { notifyAwbReady } from "@/lib/notifications/emit";

export interface AnnounceAwbInput {
  shipmentId: string;
  orgId: string;
  shipmentNumber: string;
  awbNumber: string;
  carrierName?: string | null;
  trackingUrl?: string | null;
  /**
   * The stored labels, so the email can carry them. Resend fetches each URL
   * itself, which keeps the PDFs out of the job's step state. Empty when none
   * could be filed — the email still goes, because the waybill number is the
   * useful part and the copy adapts.
   *
   * A LIST because a domestic shipment now has two labels for one waybill: the
   * courier's own, and Arena's rendering of it. ORDER IS MEANINGFUL. The first
   * is the one the copy tells the customer to print, so callers put the
   * courier's label first.
   */
  labels?: { fileName: string; fileUrl: string }[] | null;
}

export interface AnnounceAwbResult {
  /** False when this consignment's waybill had already been announced. */
  announced: boolean;
  emailed: boolean;
}

export async function announceAwbReady(
  input: AnnounceAwbInput,
): Promise<AnnounceAwbResult> {
  // Claim the ledger. False means somebody already told them about this exact
  // waybill, and there is nothing left to do.
  const claimed = await notifyAwbReady({
    shipmentId: input.shipmentId,
    orgId: input.orgId,
    shipmentNumber: input.shipmentNumber,
    awbNumber: input.awbNumber,
    carrierName: input.carrierName ?? null,
  });

  if (!claimed) return { announced: false, emailed: false };

  // Never throws by contract, and swallowed here as well: the booking is
  // complete and the label is on the customer's shipment page. An email that
  // would not send must not fail a run that has already done its real work.
  const result = await sendAwbReadyEmail(input.shipmentId, {
    awbNumber: input.awbNumber,
    carrierName: input.carrierName ?? null,
    trackingUrl: input.trackingUrl ?? null,
    labels: (input.labels ?? []).map((label) => ({
      filename: label.fileName,
      url: label.fileUrl,
    })),
  }).catch((err) => {
    Sentry.captureException(err, {
      level: "warning",
      tags: { location: "announceAwbReady" },
      extra: { shipmentId: input.shipmentId, awbNumber: input.awbNumber },
    });
    return { sent: false, audience: "none" as const };
  });

  return { announced: true, emailed: result.sent };
}
