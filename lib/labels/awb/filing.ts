/**
 * FILING ARENA'S OWN LABEL AGAINST A SHIPMENT
 * -----------------------------------------------------------------------------
 * The vendor's label is fetched from the courier and filed by the booking job.
 * This is the twin for the label we render ourselves: same waybill, same
 * barcode, our artwork. Both end up on the shipment so they can be compared in
 * real use before one of them is chosen as the only one.
 *
 * ── NOTHING IN HERE THROWS ──────────────────────────────────────────────────
 * Every function returns `{ ok: false, reason }` instead. That is the whole
 * point of the module: the caller is the domestic booking job, which has
 * already taken a customer's money, placed an order with a courier and been
 * issued a waybill by the time it gets here. A PDF renderer or an upload having
 * a bad minute must not fail that run, retry it, or walk a BOOKED order back
 * into a FAILED state.
 *
 * Losing this label costs nothing that cannot be recovered: it is rendered on
 * demand from the same data by GET /api/labels/<shipmentId>, and a later
 * re-drive of the job files it. The vendor's label — the one the courier's own
 * network expects — is filed by a separate set of steps that DO fail loudly.
 *
 * ── SPLIT INTO THREE FOR THE SAME REASON THE VENDOR LABEL IS ────────────────
 * Render, upload, file. They fail for unrelated reasons and each is one durable
 * step, so a retry does not redo the parts that worked. Nothing here knows
 * about Inngest, so an ops action or a script can call the same three.
 */

import "server-only";

import * as Sentry from "@sentry/nextjs";

import { ShipmentDocType } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { uploadLabel, type StoredLabel } from "@/lib/booking/labelStorage";

import { loadLabelDataUnscoped } from "./fromShipment";
import { arenaLabelDocumentLabel, arenaLabelFileName } from "./naming";
import { renderAwbLabel } from "./render";
import { AwbLabelDataError } from "./types";

/** PDF, always. Named once so the three steps cannot disagree. */
const LABEL_MIME_TYPE = "application/pdf";

/** Every result in this module: a value, or a reason there is not one. */
export type ArenaLabelResult<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };

function failed(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

/**
 * Report a genuine fault, and stay quiet about the states that are not faults.
 *
 * `AwbLabelDataError` means the shipment is not printable yet — no waybill, or
 * an export whose carrier issues its own label. Sending those to Sentry would
 * bury the real failures under noise from shipments that are simply not ready.
 */
function report(err: unknown, location: string, shipmentId: string): string {
  const message = err instanceof Error ? err.message : String(err);

  if (!(err instanceof AwbLabelDataError)) {
    Sentry.captureException(err, {
      level: "warning",
      tags: { location, shipmentId },
    });
  }

  return message.slice(0, 500);
}

// ---------------------------------------------------------------------------

/**
 * Render the Arena label for a shipment.
 *
 * The AWB comes off the shipment row, so this must run AFTER the courier has
 * issued one. It is the courier's number that goes into the barcode: an Arena
 * reference there would print a label that looks right and cannot be routed.
 *
 * The bytes come back base64 because a durable step's output crosses a JSON
 * boundary. A 4x6 label is tens of kilobytes.
 */
export async function renderArenaLabelForShipment(
  shipmentId: string,
): Promise<
  ArenaLabelResult<{
    base64: string;
    fileName: string;
    mimeType: string;
    awbNumber: string;
  }>
> {
  try {
    const data = await loadLabelDataUnscoped(shipmentId);

    if (!data) {
      return failed(`Shipment ${shipmentId} no longer exists.`);
    }

    const { buffer } = await renderAwbLabel(data, "thermal");

    return {
      ok: true,
      base64: buffer.toString("base64"),
      fileName: arenaLabelFileName(data.awbNumber),
      mimeType: LABEL_MIME_TYPE,
      awbNumber: data.awbNumber,
    };
  } catch (err) {
    return failed(report(err, "arenaLabel:render", shipmentId));
  }
}

/** Put the rendered bytes in the bucket the customer downloads from. */
export async function uploadArenaLabel(input: {
  shipmentId: string;
  base64: string;
  fileName: string;
  mimeType: string;
}): Promise<ArenaLabelResult<{ stored: StoredLabel }>> {
  try {
    const stored = await uploadLabel({
      bytes: Uint8Array.from(Buffer.from(input.base64, "base64")),
      fileName: input.fileName,
      mimeType: input.mimeType,
    });

    return { ok: true, stored };
  } catch (err) {
    return failed(report(err, "arenaLabel:upload", input.shipmentId));
  }
}

/**
 * File the stored label against the shipment.
 *
 * Idempotent, and not by checking first and hoping. The column is claimed with
 * an `updateMany` that only matches while it is still null, so two runs racing
 * here produce one filed label rather than two rows fighting over the pointer.
 * The loser deletes the document it created, which is the honest way round: a
 * duplicate row a customer can see is worse than an orphaned file in a bucket.
 */
export async function fileArenaLabelDocument(input: {
  shipmentId: string;
  awbNumber: string;
  stored: StoredLabel;
}): Promise<ArenaLabelResult<{ documentId: string; created: boolean }>> {
  try {
    const existing = await prisma.shipment.findUnique({
      where: { id: input.shipmentId },
      select: { arenaLabelDocumentId: true },
    });

    if (!existing) {
      return failed(`Shipment ${input.shipmentId} no longer exists.`);
    }
    if (existing.arenaLabelDocumentId) {
      return { ok: true, documentId: existing.arenaLabelDocumentId, created: false };
    }

    const document = await prisma.shipmentDocument.create({
      data: {
        shipmentId: input.shipmentId,
        docType: ShipmentDocType.AIRWAY_BILL,
        label: arenaLabelDocumentLabel(input.awbNumber),
        fileUrl: input.stored.fileUrl,
        fileKey: input.stored.fileKey,
        fileName: input.stored.fileName,
        fileSize: input.stored.fileSize,
        mimeType: input.stored.mimeType,
        // The customer paid for this shipment; every label for it is theirs.
        visibleToClient: true,
        uploadedByType: "SYSTEM",
      },
      select: { id: true },
    });

    const claimed = await prisma.shipment.updateMany({
      where: { id: input.shipmentId, arenaLabelDocumentId: null },
      data: { arenaLabelDocumentId: document.id },
    });

    if (claimed.count === 0) {
      await prisma.shipmentDocument
        .delete({ where: { id: document.id } })
        .catch(() => {
          // Already gone, or gone with the shipment. Either way the pointer
          // below is the answer and this row is not worth failing over.
        });

      const winner = await prisma.shipment.findUnique({
        where: { id: input.shipmentId },
        select: { arenaLabelDocumentId: true },
      });

      return winner?.arenaLabelDocumentId
        ? { ok: true, documentId: winner.arenaLabelDocumentId, created: false }
        : failed("Could not claim the label pointer on the shipment.");
    }

    return { ok: true, documentId: document.id, created: true };
  } catch (err) {
    return failed(report(err, "arenaLabel:file", input.shipmentId));
  }
}
