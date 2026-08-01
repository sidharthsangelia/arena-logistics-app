import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { ShipmentMode } from "@/generated/prisma";
import { furthestFirstMileStage } from "@/lib/shipmozo/firstMileStatusMap";
import { furthestShipmentStatus } from "@/lib/shipmozo/domesticStatusMap";
import {
  readScanStatus,
  readShipmozoCarrier,
  readShipmozoScans,
} from "@/lib/shipmozo/trackShape";
import { applyFirstMileTransition } from "@/lib/booking/firstMileTransition";
import { applyDomesticCourierStatus } from "@/lib/booking/domesticStatusTransition";
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
 * its AWB / order id / reference resolves to a real shipment of ours.
 *
 * ONE FEED, TWO MEANINGS
 * Both kinds of booking push orders to the same Shipmozo account, so their
 * tracking posts arrive here looking identical — same body, same statuses. What
 * they mean is not identical:
 *
 *   INTERNATIONAL  Shipmozo carries the parcel from the sender's door to OUR
 *                  hub. Its "Delivered" means the parcel reached Arena, so it
 *                  advances the small first-mile leg and nothing else. The main
 *                  status takes over from the hub onward.
 *
 *   DOMESTIC       Shipmozo carries the parcel the whole way. Its "Delivered"
 *                  is a real delivery to the customer's receiver, so it moves
 *                  the shipment's own status and sends the milestone email.
 *
 * Which one applies is decided by the matched shipment's mode, never by the
 * payload. Both paths advance to the FURTHEST stage the scan history proves,
 * forward-only, so replayed or out-of-order posts are safe. Unmatched or
 * unmapped payloads are acknowledged with 200 so Shipmozo does not retry them
 * forever.
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

    // Match on any identifier Shipmozo echoes, across both modes. We set
    // order_id = shipment.id at push time for international first-mile AND for
    // domestic orders, so `refrence_id` comes back as our id either way.
    const shipment = await prisma.shipment.findFirst({
      where: {
        OR: [
          awb ? { firstMileTrackingNumber: awb } : undefined,
          awb ? { domesticAwbNumber: awb } : undefined,
          orderId ? { firstMileShipmozoOrderId: orderId } : undefined,
          orderId ? { domesticCourierOrderId: orderId } : undefined,
          reference ? { id: reference } : undefined,
        ].filter(Boolean) as object[],
      },
      select: {
        id: true,
        mode: true,
        pickupIncluded: true,
        domesticCourierName: true,
      },
    });

    if (!shipment) {
      Sentry.addBreadcrumb({
        level: "warning",
        message: "Shipmozo webhook: no matching shipment",
        data: { awb, orderId, reference },
      });
      return NextResponse.json({ ok: true, matched: false });
    }

    // Read through the shared helper: Shipmozo posts `status_feed.scan[]` here
    // but answers `scan_detail[]` on the pull endpoint, and the panel can be
    // configured to send either.
    const scanStatuses = readShipmozoScans(d).map(readScanStatus);

    return shipment.mode === ShipmentMode.DOMESTIC
      ? handleDomestic(shipment, d, scanStatuses, awb)
      : handleFirstMile(shipment, scanStatuses, d.current_status, awb);
  } catch (err) {
    Sentry.captureException(err, { tags: { location: "shipmozoWebhook" } });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

// --- DOMESTIC: the courier's journey is the shipment's journey ---------------

async function handleDomestic(
  shipment: { id: string; domesticCourierName: string | null },
  data: ShipmozoTrackData,
  scanStatuses: Array<string | undefined>,
  awb: string | undefined,
) {
  // Record what we learn in passing. The courier is assigned by Shipmozo after
  // the push, so on a booking that raced ahead of its assignment this is the
  // first time we hear who is actually carrying it.
  const carrier = readShipmozoCarrier(data);
  if ((awb || carrier) && !shipment.domesticCourierName) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        ...(carrier ? { domesticCourierName: carrier } : {}),
        ...(awb ? { domesticAwbNumber: awb } : {}),
      },
    });
  }

  const status = furthestShipmentStatus(data.current_status, scanStatuses);

  if (!status) {
    // An RTO, a failed attempt, a cancellation — real events, but not ones an
    // automated feed should act on. Ops handle these from the booking page.
    return NextResponse.json({ ok: true, matched: true, changed: false });
  }

  const headline = data.current_status?.trim();
  const result = await applyDomesticCourierStatus(shipment.id, status, {
    changedByType: "SYSTEM",
    note: headline
      ? `${headline}${carrier ? ` (${carrier})` : ""} via Shipmozo`
      : "Courier update via Shipmozo",
  });

  if (!result.success) {
    Sentry.captureMessage("Shipmozo webhook: domestic transition failed", {
      level: "error",
      extra: { shipmentId: shipment.id, status, message: result.message },
    });
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matched: true, changed: result.changed });
}

// --- INTERNATIONAL: door → hub only -----------------------------------------

async function handleFirstMile(
  shipment: { id: string; pickupIncluded: boolean },
  scanStatuses: Array<string | undefined>,
  currentStatus: string | undefined,
  awb: string | undefined,
) {
  // An international booking without door pickup has no leg for Shipmozo to
  // move, so a post about one is a mismatch rather than something to act on.
  if (!shipment.pickupIncluded) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const stage = furthestFirstMileStage(currentStatus, scanStatuses);

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
