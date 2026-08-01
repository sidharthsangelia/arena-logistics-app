import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentMode } from "@/generated/prisma";
import { furthestFirstMileStage } from "@/lib/shipmozo/firstMileStatusMap";
import { applyFirstMileTransition } from "@/lib/booking/firstMileTransition";
import type { ShipmozoTrackData } from "@/lib/shipmozo/types";

// Touches Prisma — Node runtime, never edge.
export const runtime = "nodejs";

/**
 * SHIPMOZO TRACKING WEBHOOK
 * -----------------------------------------------------------------------------
 * Register this URL in the Shipmozo panel:
 *     https://<host>/api/webhooks/shipmozo/<SHIPMOZO_WEBHOOK_TOKEN>
 *
 * Shipmozo has no webhook secret of its own, so we put OUR token in the path —
 * transparent to Shipmozo (it just POSTs the URL we gave it) and enough to
 * reject stray traffic. If SHIPMOZO_WEBHOOK_TOKEN is unset, the token segment is
 * accepted as-is and we fall back to match-only: a payload is acted on only when
 * its AWB / order id / reference resolves to a real door-pickup shipment.
 *
 * The body matches the tracking example Shipmozo documents: order_id,
 * refrence_id (their spelling), awb_number, current_status, and a
 * status_feed.scan[] history. We advance the first-mile leg to the FURTHEST
 * stage the scan proves, forward-only, so replayed or out-of-order posts are
 * safe. Unmatched or unmapped payloads are acknowledged with 200 so Shipmozo
 * does not retry them forever.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const expected = process.env.SHIPMOZO_WEBHOOK_TOKEN;
    if (expected && token !== expected) {
      // 404, not 401 — don't confirm the path exists to a guesser.
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const body = await readBody(req);
    if (!body) {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }

    // The webhook posts the tracking object directly; an API-style envelope
    // would nest it under `data`. Accept either.
    const d: ShipmozoTrackData =
      (body.data as ShipmozoTrackData | undefined) ?? (body as ShipmozoTrackData);

    const awb = d.awb_number?.trim();
    const orderId = d.order_id?.trim();
    const reference = d.refrence_id?.trim();

    if (!awb && !orderId && !reference) {
      return NextResponse.json({ ok: true, matched: false });
    }

    // Match the shipment by any identifier Shipmozo echoes. We set order_id =
    // shipment.id at push time, so `refrence_id` comes back as our id.
    //
    // Scoped to INTERNATIONAL on purpose. Domestic bookings now push their own
    // door → door orders to the same Shipmozo account and their tracking posts
    // arrive here carrying OUR shipment id, so without this a domestic parcel
    // would be advanced through a first-mile lifecycle it does not have. Those
    // payloads are acknowledged as unmatched until domestic tracking is wired
    // up through lib/tracking-adapters.
    const shipment = await prisma.shipment.findFirst({
      where: {
        mode: ShipmentMode.INTERNATIONAL,
        pickupIncluded: true,
        OR: [
          awb ? { firstMileTrackingNumber: awb } : undefined,
          orderId ? { firstMileShipmozoOrderId: orderId } : undefined,
          reference ? { id: reference } : undefined,
        ].filter(Boolean) as object[],
      },
      select: { id: true },
    });

    if (!shipment) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: "Shipmozo webhook: no matching shipment",
        data: { awb, orderId, reference },
      });
      return NextResponse.json({ ok: true, matched: false });
    }

    const scanStatuses = (d.status_feed?.scan ?? []).map((s) => s.status);
    const stage = furthestFirstMileStage(d.current_status, scanStatuses);

    if (!stage) {
      // A status we don't map to the happy path (e.g. RTO / cancelled). Left for
      // ops to handle by hand rather than auto-advancing.
      return NextResponse.json({ ok: true, matched: true, changed: false });
    }

    const result = await applyFirstMileTransition(shipment.id, stage, {
      changedByType: "SYSTEM",
      onlyForward: true,
      trackingNumber: awb || undefined,
      noteSuffix: "via Shipmozo",
    });

    if (!result.success) {
      // A genuine processing failure — let Shipmozo retry.
      Sentry.captureMessage("Shipmozo webhook: transition failed", {
        level: "error",
        extra: { shipmentId: shipment.id, stage, message: result.message },
      });
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, matched: true, changed: result.changed });
  } catch (err) {
    Sentry.captureException(err, { tags: { location: "shipmozoWebhook" } });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

/** Parse a JSON body, tolerating a text/plain content-type. */
async function readBody(
  req: NextRequest,
): Promise<Record<string, unknown> | null> {
  const raw = await req.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
