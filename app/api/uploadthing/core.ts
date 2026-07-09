// app/api/uploadthing/core.ts

import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { updateQuotePdfAction } from "@/actions/quote/quotes.action";
import { saveKycDocumentAction } from "@/actions/documentVault/clientsDocument.action";
import { revalidatePath } from "next/cache";

const f = createUploadthing();

// ---------------------------------------------------------------------------
// Resolve Clerk orgId → internal DB Org.id
// Safe to call in middleware() where the user session exists.
// NEVER call this inside onUploadComplete — no session there.
// ---------------------------------------------------------------------------

async function resolveDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) throw new Error("Unauthorized: no active organisation.");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) throw new Error("Org not found in DB.");

  return org.id;
}

// Must stay in sync with DOC_TYPES in the DocumentManager component AND
// the Prisma enum backing ShipmentDocument.docType. Validating against this
// whitelist here means a bad/unexpected value fails fast with a clear
// message instead of surfacing as a raw, unserializable Prisma error.
const SHIPMENT_DOC_TYPES = [
  "INVOICE",
  "AIRWAY_BILL",
  "PACKING_LIST",
  "CUSTOMS_DECLARATION",
  "CERTIFICATE_OF_ORIGIN",
  "INSURANCE_CERT",
  "POD",
  "OTHER",
] as const;
type ShipmentDocType = (typeof SHIPMENT_DOC_TYPES)[number];

function isShipmentDocType(value: string): value is ShipmentDocType {
  return (SHIPMENT_DOC_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// File router
// ---------------------------------------------------------------------------

export const ourFileRouter = {
  // ── Quote PDF ─────────────────────────────────────────────────────────────
  quotePdf: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(async ({ req }) => {
      // Session is available here — resolve everything we need upfront
      const orgId = await resolveDbOrgId();
      const quoteId = req.headers.get("x-quote-id");

      if (!quoteId) throw new Error("Missing x-quote-id header.");

      // Verify the quote belongs to this org before accepting the upload
      const quote = await prisma.quote.findFirst({
        where: { id: quoteId, orgId },
        select: { id: true },
      });
      if (!quote) throw new Error("Quote not found or access denied.");

      // orgId flows through to onUploadComplete via metadata
      return { quoteId, orgId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // No auth() call here — use orgId from metadata
      console.log(
        "[PDF] uploaded:",
        file.ufsUrl,
        "for quote:",
        metadata.quoteId,
      );

      await updateQuotePdfAction({
        quoteId: metadata.quoteId,
        orgId: metadata.orgId, // pass directly — no session lookup needed
        pdfUrl: file.ufsUrl,
        pdfKey: file.key,
      });

      return { ufsUrl: file.ufsUrl, key: file.key };
    }),

  // ── KYC Document ──────────────────────────────────────────────────────────
  kycDocument: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 1 },
    image: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");

      // Resolve DB orgId while session is still available
      const orgId = await resolveDbOrgId();
      const clientId = req.headers.get("x-client-id");
      const docType = req.headers.get("x-doc-type");
      const label = req.headers.get("x-doc-label");

      if (!clientId) throw new Error("Missing x-client-id header.");
      if (!docType) throw new Error("Missing x-doc-type header.");
      if (!label) throw new Error("Missing x-doc-label header.");

      // Verify the client belongs to this org before accepting the upload
      const client = await prisma.client.findFirst({
        where: { id: clientId, orgId, deletedAt: null },
        select: { id: true },
      });
      if (!client) throw new Error("Client not found or access denied.");

      return { clientId, docType, label, orgId, uploadedBy: userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // No auth() call here — use orgId from metadata
      console.log(
        "[KYC] uploaded:",
        file.name,
        "for client:",
        metadata.clientId,
        "type:",
        metadata.docType,
      );

      await saveKycDocumentAction({
        orgId: metadata.orgId, // pass directly
        clientId: metadata.clientId,
        docType: metadata.docType as any,
        label: metadata.label,
        fileUrl: file.ufsUrl,
        fileKey: file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      return {
        ufsUrl: file.ufsUrl,
        key: file.key,
        clientId: metadata.clientId,
      };
    }),

  rateSheetUploader: f({
    blob: {
      maxFileSize: "64MB",
      maxFileCount: 1,
    },
  }).onUploadComplete(async ({ file }) => {
    return {
      url: file.url,
      name: file.name,
    };
  }),

  bookingDocument: f({
    pdf: { maxFileSize: "16MB" },
    image: { maxFileSize: "8MB" },
  })
    .middleware(async () => {
      const orgId = await resolveDbOrgId();

      return { orgId };
    })
    .onUploadComplete(async ({ file }) => {
      return {
        url: file.ufsUrl,
        key: file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      };
    }),

  // shipment document upload for ops users

  shipmentDocument: f({
    pdf: {
      maxFileSize: "16MB",
      maxFileCount: 1,
    },
    image: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      try {
        const { userId, orgId } = await auth();
        if (!userId) throw new UploadThingError("Unauthorized");

        // Ops-only endpoint — caller's active Clerk org must be Arena itself,
        // not the shipment's owning org (that's a different tenant).
        if (orgId !== process.env.ARENA_ORG_ID) {
          throw new UploadThingError(
            "Only Arena ops staff can upload shipment documents.",
          );
        }

        const shipmentId = req.headers.get("x-shipment-id");
        const docType = req.headers.get("x-doc-type");
        const label = req.headers.get("x-doc-label");
        const visibleHeader = req.headers.get("x-visible-to-client");

        if (!shipmentId) throw new UploadThingError("Missing shipment id.");
        if (!docType) throw new UploadThingError("Missing document type.");
        if (!isShipmentDocType(docType)) {
          throw new UploadThingError(`Invalid document type: ${docType}`);
        }
        if (!label || !label.trim())
          throw new UploadThingError("Missing label.");
        if (label.length > 120) {
          throw new UploadThingError("Label must be 120 characters or fewer.");
        }

        const shipment = await prisma.shipment.findUnique({
          where: { id: shipmentId },
          select: { id: true },
        });
        if (!shipment) {
          throw new UploadThingError("Shipment not found.");
        }

        return {
          shipmentId,
          docType,
          label: label.trim(),
          visibleToClient: visibleHeader !== "false",
          uploadedBy: userId,
        };
      } catch (err) {
        if (err instanceof UploadThingError) throw err;
        console.error("[shipmentDocument] middleware error:", err);
        throw new UploadThingError(
          err instanceof Error ? err.message : "Upload validation failed.",
        );
      }
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
        const document = await prisma.shipmentDocument.create({
          data: {
            shipmentId: metadata.shipmentId,
            docType: metadata.docType,
            label: metadata.label,
            fileUrl: file.ufsUrl,
            fileKey: file.key,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            visibleToClient: metadata.visibleToClient,
            uploadedByType: "OPS",
            uploadedById: metadata.uploadedBy,
          },
          select: {
            id: true,
            shipmentId: true,
          },
        });

        revalidatePath(`/arena-dashboard/bookings/${document.shipmentId}`);
        revalidatePath(`/shipments/${document.shipmentId}`);

        return {
          documentId: document.id,
          shipmentId: document.shipmentId,
        };
      } catch (err) {
        // Same reasoning as the middleware: never let a raw exception
        // (e.g. a Prisma constraint/enum error) escape unwrapped. The file
        // has already been uploaded to storage at this point, so log
        // loudly for ops to reconcile, but still respond with valid JSON.
        console.error(
          "[shipmentDocument] onUploadComplete error:",
          err,
          "file:",
          file.ufsUrl,
          "key:",
          file.key,
        );
        throw new UploadThingError(
          err instanceof Error
            ? `Document upload succeeded but saving failed: ${err.message}`
            : "Document upload succeeded but saving failed.",
        );
      }
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
