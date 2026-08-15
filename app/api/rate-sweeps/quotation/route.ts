import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { loadQuotationData } from "@/lib/rateSweep/excel/data";
import { quotationFilename, quotationSpecSchema } from "@/lib/rateSweep/excel/spec";
import { buildQuotationWorkbook } from "@/lib/rateSweep/excel/workbook";
import { getArenaAuth } from "@/utils/arena-auth";

// ExcelJS and Prisma both need Node. Never edge.
export const runtime = "nodejs";

/**
 * QUOTATION WORKBOOK
 * -----------------------------------------------------------------------------
 * POST /api/rate-sweeps/quotation  { ...QuotationSpec }  ->  .xlsx
 *
 * ── WHY POST FOR A DOWNLOAD ─────────────────────────────────────────────────
 * The spec carries a markup percentage and a list of countries and weights,
 * which is more than belongs in a URL, and an internal-audience file is the
 * whole cost book. A GET would end up in browser history, in server logs, and
 * in anything a user pastes into a chat. POST keeps it in the body.
 *
 * ── ARENA STAFF ONLY, CHECKED HERE ──────────────────────────────────────────
 * proxy.ts does not cover /api, so the gate is in this handler and cannot be
 * skipped by hitting the URL directly. An INTERNAL file is raw carrier cost:
 * Arena's buying price, and therefore its margin.
 *
 * ── THE SPEC IS RE-PARSED SERVER SIDE ───────────────────────────────────────
 * The builder form validates the same schema, but nothing arriving over the
 * wire is trusted to say whether a file is a customer file. A hand-rolled
 * request setting audience to something unexpected, or a customer file at 0%
 * markup, is rejected here rather than rendered.
 */
export async function POST(req: Request) {
  try {
    const { isArenaMember } = await getArenaAuth();
    if (!isArenaMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
    }

    const parsed = quotationSpecSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "That combination cannot be built.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 422 },
      );
    }

    const spec = parsed.data;
    const data = await loadQuotationData(spec);

    // A workbook of empty grids is worse than an error: it looks like we have
    // no rates rather than like the filters excluded everything.
    if (data.carriers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No rates match those filters. Try more countries, more weights, or allow restricted services.",
        },
        { status: 422 },
      );
    }

    const buffer = await buildQuotationWorkbook(spec, data);
    const filename = quotationFilename(spec);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        // Priced from our cost book. Never let a proxy or a CDN hold a copy.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "rateSweepQuotationRoute" },
    });

    return NextResponse.json(
      { error: "Could not build the workbook." },
      { status: 500 },
    );
  }
}
