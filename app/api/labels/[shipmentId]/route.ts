import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { loadLabelData } from "@/lib/labels/awb/fromShipment";
import { renderAwbLabel } from "@/lib/labels/awb/render";
import { AwbLabelDataError, type LabelPaperSize } from "@/lib/labels/awb/types";
import { getDbOrgId } from "@/utils/tenant";

// Prisma and @react-pdf/renderer both need Node. Never edge.
export const runtime = "nodejs";

/**
 * SHIPPING LABEL
 * -----------------------------------------------------------------------------
 * GET /api/labels/<shipmentId>?paper=thermal|a4&disposition=inline
 *
 * Renders the Arena label for a booked domestic shipment, carrying the
 * COURIER's waybill in the barcode so the courier's own scanners can route it.
 *
 * Rendered per request rather than stored. A label is reprinted whenever a roll
 * jams or a box is repacked, and filing every reprint would fill the bucket
 * with identical PDFs. The vendor's own label, which IS filed against the
 * shipment, is a different artifact and lib/booking/labelStorage.ts owns it.
 *
 * Scoping is the same rule as the invoice download route: the org id goes into
 * the where clause, so another org's shipment id is a 404 rather than something
 * we look at and then decide about.
 *
 * Defaults to `attachment`, because the usual next action is printing it. Pass
 * `disposition=inline` to look at it in the browser first.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ shipmentId: string }> },
) {
  const { shipmentId } = await params;

  try {
    const orgId = await getDbOrgId();
    const url = new URL(req.url);
    const paper: LabelPaperSize = url.searchParams.get("paper") === "a4" ? "a4" : "thermal";
    const inline = url.searchParams.get("disposition") === "inline";

    const data = await loadLabelData(shipmentId, orgId);

    // One shape for "no such shipment" and "not yours". A caller cannot act on
    // the difference and a guesser should not learn it.
    if (!data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { buffer, fileName } = await renderAwbLabel(data, paper);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(fileName, inline),
        // Carries a customer's address and phone number: never a shared cache.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    if (isNextControlFlow(error)) throw error;

    // "No AWB yet" and "this is an export" are states, not faults. They are the
    // two things a user will actually hit, and answering 500 would send someone
    // to read logs about a shipment that is simply not ready.
    if (error instanceof AwbLabelDataError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    Sentry.captureException(error, { extra: { shipmentId } });
    return NextResponse.json(
      { error: "Could not render that label." },
      { status: 500 },
    );
  }
}

/**
 * The filename is built from an AWB we already stripped to alphanumerics, but
 * it is quoted and re-sanitised here anyway: this header is the wrong place to
 * trust an upstream guarantee, and a stray newline would end the header early.
 */
function contentDisposition(fileName: string, inline: boolean): string {
  const raw = fileName.replace(/[\r\n]/g, " ").trim();
  const base = raw.split(/[\\/]/).pop() || "label.pdf";
  const ascii = base.replace(/["]/g, "").replace(/[^\x20-\x7E]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(base)}`;
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
