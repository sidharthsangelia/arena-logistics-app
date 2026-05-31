/**
 * src/lib/uploadthing/core.ts
 *
 * UploadThing file router.
 *
 * ROUTES
 * ──────
 * quotePdf  — accepts a single PDF up to 8 MB. Called by QuoteSheet after
 *             the user downloads the PDF locally. On completion,
 *             updateQuotePdfAction patches the CDN URL onto the Quote record.
 *
 * AUTHENTICATION
 * ──────────────
 * The `middleware` function runs on the server before the upload begins.
 * Add your auth check here (Clerk, NextAuth, etc.).
 * The returned object is forwarded to `onUploadComplete` as `metadata`.
 *
 * ADDING MORE ROUTES
 * ──────────────────
 * Follow the same pattern: define a route key, set file constraints,
 * add middleware, handle completion. The router is tree-shakeable — unused
 * routes add no client bundle cost.
 */

import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

export const ourFileRouter = {
  quotePdf: f({ pdf: { maxFileSize: "8MB", maxFileCount: 1 } })
    .middleware(async ({ req: _req }) => {
      // ── Add your auth guard here ──────────────────────────────────────
      // Example with Clerk:
      //   const { userId } = auth();
      //   if (!userId) throw new UploadThingError("Unauthorised");
      //   return { userId };
      //
      // The returned object is available as `metadata` in onUploadComplete.
      return {};
    })
    .onUploadComplete(async ({ metadata: _metadata, file }) => {
      // This runs on the server after UploadThing has accepted the file.
      // We intentionally do NOT call updateQuotePdfAction here because we
      // don't have the quoteId in scope — it is passed from the client via
      // the `input` mechanism (see QuoteSheet → useUploadQuotePdf).
      //
      // If you later need server-side post-processing (virus scan, watermark,
      // etc.) this is the right place.
      console.log("quotePdf uploaded:", file.ufsUrl);

      // Return value is forwarded to the client-side `onClientUploadComplete`
      return { ufsUrl: file.ufsUrl, key: file.key };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;