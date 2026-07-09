"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const awbSchema = z.object({
  shipmentId: z.string(),
  mawbNumber: z.string().trim().optional(),
  hawbNumber: z.string().trim().optional(),
  carrierAirline: z.string().trim().optional(),
  vendorTrackingUrl: z.string().trim().url().optional().or(z.literal("")),
});

export async function updateCarrierAwb(input: z.infer<typeof awbSchema>) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const data = awbSchema.parse(input);

  const shipment = await prisma.shipment.findUnique({
    where: { id: data.shipmentId },
    select: { id: true, status: true, mawbNumber: true, hawbNumber: true },
  });
  if (!shipment) throw new Error("Shipment not found");

  const isFirstTime = !shipment.mawbNumber && !shipment.hawbNumber;

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
          ? `AWB details added — MAWB: ${data.mawbNumber || "—"}, HAWB: ${data.hawbNumber || "—"}`
          : `AWB details updated — MAWB: ${data.mawbNumber || "—"}, HAWB: ${data.hawbNumber || "—"}`,
        changedByType: "OPS",
        changedById: userId,
      },
    }),
  ]);

  revalidatePath(`/arena-dashboard/bookings/${data.shipmentId}`);
  revalidatePath(`/shipments/${data.shipmentId}`);
}

export async function toggleDocumentVisibility(documentId: string, visibleToClient: boolean) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const doc = await prisma.shipmentDocument.update({
    where: { id: documentId },
    data: { visibleToClient },
    select: { shipmentId: true },
  });

  revalidatePath(`/arena-dashboard/bookings/${doc.shipmentId}`);
  revalidatePath(`/shipments/${doc.shipmentId}`);
}

const addDocSchema = z.object({
  shipmentId: z.string(),
  docType: z.enum([
    "INVOICE",
    "AIRWAY_BILL",
    "PACKING_LIST",
    "CUSTOMS_DECLARATION",
    "CERTIFICATE_OF_ORIGIN",
    "INSURANCE_CERT",
    "POD",
    "OTHER",
  ]),
  label: z.string().min(1),
  fileUrl: z.string().url(),
  fileKey: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  visibleToClient: z.boolean().default(true),
});

export async function addShipmentDocument(input: z.infer<typeof addDocSchema>) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const data = addDocSchema.parse(input);

  await prisma.shipmentDocument.create({
    data: {
      shipmentId: data.shipmentId,
      docType: data.docType,
      label: data.label,
      fileUrl: data.fileUrl,
      fileKey: data.fileKey,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      visibleToClient: data.visibleToClient,
      uploadedByType: "OPS",
      uploadedById: userId,
    },
  });

  revalidatePath(`/arena-dashboard/bookings/${data.shipmentId}`);
  revalidatePath(`/shipments/${data.shipmentId}`);
}