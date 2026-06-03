import { createUploadthing, type FileRouter } from "uploadthing/next";
import { updateQuotePdfAction } from "@/actions/quotes.action";
import { auth } from "@clerk/nextjs/server";
import { saveKycDocumentAction } from "@/actions/clientsDocument.action";

const f = createUploadthing();

export const ourFileRouter = {
  quotePdf: f({ pdf: { maxFileSize: "16MB" } })
    .middleware(async ({ req }) => {
      const quoteId = req.headers.get("x-quote-id");
      if (!quoteId) throw new Error("Missing quoteId");
      return { quoteId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("uploaded file:", file.ufsUrl, "for quote:", metadata.quoteId);

      await updateQuotePdfAction({
        quoteId: metadata.quoteId,
        pdfUrl: file.ufsUrl,
        pdfKey: file.key,
      });

      return { ufsUrl: file.ufsUrl, key: file.key };
    }),

    kycDocument: f({
    pdf:   { maxFileSize: "16MB", maxFileCount: 1 },
    image: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async ({ req }) => {
      // ── Clerk auth guard ─────────────────────────────────────────────
      // All app routes are already protected by middleware, but we add
      // an explicit check here so a direct API call is also rejected.
      const { userId } = await auth();
      if (!userId) throw new Error("Unauthorized");
 
      // ── Validate required headers ────────────────────────────────────
      const clientId = req.headers.get("x-client-id");
      const docType  = req.headers.get("x-doc-type");
      const label    = req.headers.get("x-doc-label");
 
      if (!clientId) throw new Error("Missing x-client-id header");
      if (!docType)  throw new Error("Missing x-doc-type header");
      if (!label)    throw new Error("Missing x-doc-label header");
 
      return { clientId, docType, label, uploadedBy: userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log(
        "[KYC] uploaded:",
        file.name,
        "for client:",
        metadata.clientId,
        "type:",
        metadata.docType,
      );
 
      await saveKycDocumentAction({
        clientId:    metadata.clientId,
        docType:     metadata.docType as any,
        label:       metadata.label,
        fileUrl:     file.ufsUrl,
        fileKey:     file.key,
        fileName:    file.name,
        fileSize:    file.size,
        mimeType:    file.type,
      });
 
      return {
        ufsUrl:   file.ufsUrl,
        key:      file.key,
        clientId: metadata.clientId,
      };
    }),

} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;