// app/api/uploadthing/core.ts

import { createUploadthing, type FileRouter } from "uploadthing/next";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { updateQuotePdfAction } from "@/actions/quote/quotes.action";
import { saveKycDocumentAction } from "@/actions/documentVault/clientsDocument.action";

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

// ---------------------------------------------------------------------------
// File router
// ---------------------------------------------------------------------------

export const ourFileRouter = {

  // ── Quote PDF ─────────────────────────────────────────────────────────────
  quotePdf: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(async ({ req }) => {
      // Session is available here — resolve everything we need upfront
      const orgId   = await resolveDbOrgId();
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
      console.log("[PDF] uploaded:", file.ufsUrl, "for quote:", metadata.quoteId);

      await updateQuotePdfAction({
        quoteId: metadata.quoteId,
        orgId:   metadata.orgId,   // pass directly — no session lookup needed
        pdfUrl:  file.ufsUrl,
        pdfKey:  file.key,
      });

      return { ufsUrl: file.ufsUrl, key: file.key };
    }),

  // ── KYC Document ──────────────────────────────────────────────────────────
  kycDocument: f({
    pdf:   { maxFileSize: "16MB", maxFileCount: 1 },
    image: { maxFileSize: "8MB",  maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");

      // Resolve DB orgId while session is still available
      const orgId    = await resolveDbOrgId();
      const clientId = req.headers.get("x-client-id");
      const docType  = req.headers.get("x-doc-type");
      const label    = req.headers.get("x-doc-label");

      if (!clientId) throw new Error("Missing x-client-id header.");
      if (!docType)  throw new Error("Missing x-doc-type header.");
      if (!label)    throw new Error("Missing x-doc-label header.");

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
        "[KYC] uploaded:", file.name,
        "for client:", metadata.clientId,
        "type:", metadata.docType,
      );

      await saveKycDocumentAction({
        orgId:    metadata.orgId,   // pass directly
        clientId: metadata.clientId,
        docType:  metadata.docType as any,
        label:    metadata.label,
        fileUrl:  file.ufsUrl,
        fileKey:  file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      return {
        ufsUrl:   file.ufsUrl,
        key:      file.key,
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

} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;