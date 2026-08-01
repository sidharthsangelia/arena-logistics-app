import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";

// Touches Prisma — Node runtime, never edge.
export const runtime = "nodejs";

/**
 * INVOICE DOWNLOAD
 * -----------------------------------------------------------------------------
 * GET /api/invoices/booking|account/<id>/download
 *
 * Why this exists at all: invoice PDFs live on UploadThing, a different origin.
 * An <a download> is ignored cross-origin, so the browser navigates to the file
 * and shows the PDF in its viewer instead of saving it — which is not what a
 * button labelled Download should do. Streaming the file back from our own
 * origin with `Content-Disposition: attachment` makes the download a download,
 * on every browser, with no dependence on the CDN's CORS headers.
 *
 * It is also an access check the raw storage URL does not have: the row is
 * looked up WITH the caller's org in the where clause, so another org's invoice
 * id returns nothing rather than something we then decide about.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;

  if (kind !== "booking" && kind !== "account") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const orgId = await getDbOrgId();
    const file = await lookupFile(kind, id, orgId);

    // One shape for "no such invoice", "not yours" and "not rendered yet". A
    // customer cannot act on the difference, and a guesser should not learn it.
    if (!file?.fileUrl) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const upstream = await fetch(file.fileUrl);
    if (!upstream.ok || !upstream.body) {
      Sentry.captureMessage("Invoice download: storage fetch failed", {
        level: "error",
        extra: { kind, id, status: upstream.status },
      });
      return NextResponse.json(
        { error: "The invoice file could not be fetched. Try again shortly." },
        { status: 502 },
      );
    }

    const headers = new Headers({
      "Content-Type": file.mimeType ?? "application/pdf",
      "Content-Disposition": contentDisposition(file.fileName),
      // It is somebody's tax document: never store it in a shared cache.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    // Passed through when the CDN gives it, so the browser can show real
    // progress instead of an indeterminate spinner.
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    // redirect() from getDbOrgId throws a control-flow error Next handles
    // itself; anything else is ours.
    if (isNextControlFlow(error)) throw error;

    Sentry.captureException(error, { extra: { kind, id } });
    return NextResponse.json(
      { error: "Could not prepare that download." },
      { status: 500 },
    );
  }
}

interface StoredFile {
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
}

/** orgId goes in the where clause, never into a check afterwards. */
async function lookupFile(
  kind: "booking" | "account",
  id: string,
  orgId: string,
): Promise<StoredFile | null> {
  if (kind === "booking") {
    const row = await prisma.shipmentInvoice.findFirst({
      where: { id, orgId },
      select: { fileUrl: true, fileName: true },
    });
    // Always a PDF this app rendered itself, so there is no stored mime type.
    return row ? { ...row, mimeType: "application/pdf" } : null;
  }

  return prisma.invoice.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { fileUrl: true, fileName: true, mimeType: true },
  });
}

/**
 * A filename reaches this header from a database column, so it is quoted and
 * stripped of anything that could end the header early or steer a write outside
 * the download folder. The RFC 5987 form carries any non-ASCII characters.
 */
function contentDisposition(fileName: string | null): string {
  const raw = (fileName ?? "invoice.pdf").replace(/[\r\n]/g, " ").trim();
  const base = raw.split(/[\\/]/).pop() || "invoice.pdf";
  const ascii = base.replace(/["]/g, "").replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  );
}
