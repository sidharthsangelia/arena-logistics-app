import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { exportRunCsv } from "@/lib/rateSweep/queries";
import { getArenaAuth } from "@/utils/arena-auth";
import { prisma } from "@/utils/db";

// Prisma needs Node. Never edge.
export const runtime = "nodejs";

/**
 * RATE SWEEP EXPORT
 * -----------------------------------------------------------------------------
 * GET /api/rate-sweeps/<runId>/export
 *
 * One run's stored rates as CSV, for a spreadsheet or a notebook. This is the
 * exploratory-analysis path: the admin screen answers "did it work" and this
 * answers everything else.
 *
 * ── ARENA STAFF ONLY, CHECKED HERE ──────────────────────────────────────────
 * This file hands over the raw vendor cost of every lane in the matrix, which is
 * the most commercially sensitive data the platform holds: it is Arena's buying
 * price, and the markup applied on top is the margin. proxy.ts does not cover
 * /api routes, so the check is in this handler and cannot be skipped by
 * requesting the URL directly.
 *
 * Attachment rather than inline. A browser rendering thousands of CSV lines as
 * text is nobody's intention, and the filename carries the run so two downloads
 * do not overwrite each other.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const { isArenaMember } = await getArenaAuth();
    if (!isArenaMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const run = await prisma.rateSweepRun.findUnique({
      where: { id },
      select: { id: true, startedAt: true, snapshotCount: true },
    });

    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const csv = await exportRunCsv(id);

    const stamp = run.startedAt.toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rate-sweep-${stamp}-${run.id.slice(0, 8)}.csv"`,
        // Vendor cost. Never let a proxy or a CDN hold a copy.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "rateSweepExportRoute" },
      extra: { runId: id },
    });

    return NextResponse.json(
      { error: "Could not build the export." },
      { status: 500 },
    );
  }
}
