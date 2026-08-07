import { NextResponse } from "next/server";

import { renderAwbLabel } from "@/lib/labels/awb/render";
import { SAMPLE_COD_LABEL, SAMPLE_PREPAID_LABEL } from "@/lib/labels/awb/sample";
import type { LabelPaperSize } from "@/lib/labels/awb/types";
import { getDbOrgId } from "@/utils/tenant";

// @react-pdf/renderer needs Node streams. Never edge.
export const runtime = "nodejs";

/**
 * LABEL PREVIEW
 * -----------------------------------------------------------------------------
 * GET /api/labels/preview?payment=cod|prepaid&paper=thermal|a4
 *
 * Renders the label template with sample data, so the design can be looked at
 * in a browser without booking a shipment and waiting for a courier to issue a
 * waybill. Opens inline rather than downloading, because the whole point is to
 * look at it.
 *
 * Signed in, even though it contains nothing real. An open PDF renderer is a
 * free CPU-burning endpoint for anyone who finds it, and the auth check costs
 * one cached lookup. It is not protecting the sample data; it is protecting the
 * renderer.
 *
 * For the same design check without a running server, and with the page count
 * asserted:  npx tsx scripts/renderSampleLabel.tsx
 */
export async function GET(req: Request) {
  try {
    await getDbOrgId();

    const url = new URL(req.url);
    const paper: LabelPaperSize = url.searchParams.get("paper") === "a4" ? "a4" : "thermal";
    const data =
      url.searchParams.get("payment") === "prepaid"
        ? SAMPLE_PREPAID_LABEL
        : SAMPLE_COD_LABEL;

    const { buffer } = await renderAwbLabel(data, paper);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="label-preview-${paper}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // redirect() from getDbOrgId throws a control-flow error Next handles itself.
    if (isNextControlFlow(error)) throw error;

    console.error("[labels/preview] render failed:", error);
    return NextResponse.json(
      { error: "Could not render the label preview." },
      { status: 500 },
    );
  }
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
