// app/api/cron/expire-quotes/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/utils/db";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── Auth guard ─────────────────────────────────────────────────────────
  // Vercel automatically sends this header on cron invocations.
  // Reject anything that doesn't carry it so the route can't be
  // triggered manually in production.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Expire all DRAFT quotes whose validUntil has passed
    // SENT quotes are intentionally excluded — an accepted/read quote
    // shouldn't silently flip to EXPIRED even if the rate window closed.
    // Ops team can manually expire those if needed.
    const expired = await prisma.quote.updateMany({
      where: {
        status:    "DRAFT",
        validUntil: { lt: now },
      },
      data: { status: "EXPIRED" },
    });

    // Also expire SENT quotes that are more than 3 days past validUntil
    // (grace period — gives the client time to respond after opening)
    const expiredSent = await prisma.quote.updateMany({
      where: {
        status: "SENT",
        validUntil: {
          lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
      },
      data: { status: "EXPIRED" },
    });

    const total = expired.count + expiredSent.count;

    console.log(
      `[cron/expire-quotes] Expired ${expired.count} DRAFT + ${expiredSent.count} SENT quotes`
    );

    return NextResponse.json({
      success:      true,
      expiredDraft: expired.count,
      expiredSent:  expiredSent.count,
      total,
      timestamp:    now.toISOString(),
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { location: "cron/expire-quotes" },
    });
    console.error("[cron/expire-quotes] Failed:", err);
    return NextResponse.json(
      { error: "Failed to expire quotes" },
      { status: 500 }
    );
  }
}