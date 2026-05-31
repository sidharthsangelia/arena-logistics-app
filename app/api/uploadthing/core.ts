import { createUploadthing, type FileRouter } from "uploadthing/next";
import { updateQuotePdfAction } from "@/actions/quotes.action";

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
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;