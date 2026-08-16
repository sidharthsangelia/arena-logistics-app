"use server";

import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { ArenaForbiddenError, requireArenaMember } from "@/utils/arena-auth";

/**
 * OPS ACTIONS FOR THE CARRIER / DOCUMENTS PANELS
 * -----------------------------------------------------------------------------
 * Everything in this file writes to a shipment that belongs to a customer, from
 * the Arena booking detail page. None of it is a tenant action.
 *
 * ── WHY EVERY EXPORT CALLS requireArenaMember ───────────────────────────────
 * These used to check `if (!userId)` and nothing else, which is not an
 * authorisation check — it only asks whether somebody is signed in. A server
 * action is a public POST endpoint: it is reachable by any authenticated user
 * with a fetch call, and it never passes through proxy.ts on the way in. The
 * route gate on /arena-dashboard protects the PAGE, not the actions the page
 * happens to import. So the gate lives here, in each action, where it cannot be
 * skipped.
 *
 * Member rather than admin: this is ops work — recording a waybill, filing
 * paperwork — not a commercial position. See utils/arena-auth.ts for the split.
 *
 * ── WHY THESE THROW RATHER THAN RETURNING A RESULT ──────────────────────────
 * Both call sites (CarrierTrackingPanel, DocumentManager) already wrap the call
 * in try/catch and surface `error.message` in a toast. ArenaForbiddenError
 * carries a message written for a person to read, so a blocked call shows the
 * right thing without either component changing.
 */

// ---------------------------------------------------------------------------
// Carrier / AWB details
// ---------------------------------------------------------------------------

/**
 * http and https only.
 *
 * Zod's `.url()` accepts anything WHATWG `new URL()` parses, which includes
 * `javascript:` and `data:`. This string is stored and handed to the tenant
 * shipment page; the day anyone renders it as an anchor, an unrestricted scheme
 * is stored XSS. Constraining it at the point of entry costs nothing and means
 * no reader downstream has to know to be careful.
 */
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        const { protocol } = new URL(value);
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Tracking link must be an http:// or https:// URL." },
  );

const awbSchema = z.object({
  shipmentId: z.string().min(1),
  mawbNumber: z.string().trim().max(64).optional(),
  hawbNumber: z.string().trim().max(64).optional(),
  carrierAirline: z.string().trim().max(120).optional(),
  vendorTrackingUrl: httpUrl.optional().or(z.literal("")),
});

export async function updateCarrierAwb(input: z.infer<typeof awbSchema>) {
  const { userId } = await requireArenaMember();

  const data = awbSchema.parse(input);

  const shipment = await prisma.shipment.findUnique({
    where: { id: data.shipmentId },
    select: { id: true, status: true, mawbNumber: true, hawbNumber: true },
  });
  if (!shipment) throw new Error("Shipment not found");

  const isFirstTime = !shipment.mawbNumber && !shipment.hawbNumber;

  try {
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: data.shipmentId },
        data: {
          mawbNumber: data.mawbNumber || null,
          hawbNumber: data.hawbNumber || null,
          carrierAirline: data.carrierAirline || null,
          vendorTrackingUrl: data.vendorTrackingUrl || null,
          awbAddedAt: isFirstTime ? new Date() : undefined,
          awbUpdatedAt: new Date(),
          awbAddedById: userId,
        },
      }),
      prisma.shipmentStatusEvent.create({
        data: {
          shipmentId: data.shipmentId,
          fromStatus: shipment.status,
          toStatus: shipment.status, // AWB update doesn't change status, just logs the event
          note: isFirstTime
            ? `AWB details added. MAWB: ${data.mawbNumber || "—"}, HAWB: ${data.hawbNumber || "—"}`
            : `AWB details updated. MAWB: ${data.mawbNumber || "—"}, HAWB: ${data.hawbNumber || "—"}`,
          changedByType: "OPS",
          changedById: userId,
        },
      }),
    ]);
  } catch (error) {
    if (!(error instanceof ArenaForbiddenError)) {
      Sentry.captureException(error, {
        tags: { location: "updateCarrierAwb" },
        extra: { shipmentId: data.shipmentId },
      });
    }
    throw error;
  }

  revalidatePath(`/arena-dashboard/bookings/${data.shipmentId}`);
  revalidatePath(`/shipments/${data.shipmentId}`);
}

// ---------------------------------------------------------------------------
// Document visibility
// ---------------------------------------------------------------------------

/**
 * Flip whether a shipment document is visible to the customer.
 *
 * The row is read before it is written so a missing id produces a sentence a
 * person can act on, rather than a raw Prisma P2025 reaching the toast.
 */
export async function toggleDocumentVisibility(
  documentId: string,
  visibleToClient: boolean,
) {
  await requireArenaMember();

  const id = z.string().min(1).parse(documentId);
  const visible = z.boolean().parse(visibleToClient);

  const existing = await prisma.shipmentDocument.findUnique({
    where: { id },
    select: { id: true, shipmentId: true },
  });
  if (!existing) throw new Error("Document not found");

  try {
    await prisma.shipmentDocument.update({
      where: { id },
      data: { visibleToClient: visible },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "toggleDocumentVisibility" },
      extra: { documentId: id, shipmentId: existing.shipmentId },
    });
    throw error;
  }

  revalidatePath(`/arena-dashboard/bookings/${existing.shipmentId}`);
  revalidatePath(`/shipments/${existing.shipmentId}`);
}

// ---------------------------------------------------------------------------
// addShipmentDocument — deliberately removed
//
// It created a ShipmentDocument from a caller-supplied fileUrl, stamped
// `uploadedByType: "OPS"`, and had no call site anywhere in the app. Documents
// are filed through the `shipmentDocument` UploadThing route in
// app/api/uploadthing/core.ts, which checks Arena staff in its middleware,
// validates the doc type and label, and writes the row itself in
// onUploadComplete.
//
// So this was a second, unauthenticated way into the same table that accepted
// an arbitrary URL — attack surface with no user. Gating it would have left
// dead code guarding a path nothing takes; deleting it removes the endpoint.
// If a manual filing path is ever needed, add it to the UploadThing route
// rather than reintroducing a bare create.
// ---------------------------------------------------------------------------
