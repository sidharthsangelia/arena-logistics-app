/**
 * app/api/rates/job-status/route.ts   (Next.js App Router)
 * ──────────────────────────────────────────────────────────
 * Thin proxy so the browser can poll job status without knowing the
 * service URL or secret key.
 *
 * GET /api/rates/job-status?jobId=xxx
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRateJobStatus } from "@/lib/services/domesticRate.service";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  try {
    const status = await getRateJobStatus(jobId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}