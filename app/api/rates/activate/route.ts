/**
 * app/api/rates/activate/route.ts
 * ────────────────────────────────
 * Activates a staged rate version.
 * Calls the DB procedure `activate_rate_version` via raw SQL.
 *
 * POST /api/rates/activate
 * Body: { "versionId": "clxxx..." }
 *
 * The procedure (defined in schema.sql) will:
 *  - Reject if unresolved conflicts exist (except LANE_ADDED)
 *  - Archive the current active version
 *  - Flip the staged version to active
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: "Use POST to activate a rate version." });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const versionId = body?.versionId as string | undefined;

  if (!versionId) {
    return NextResponse.json({ error: "versionId is required" }, { status: 400 });
  }

  // Verify version exists and is staged
  const version = await prisma.rateVersion.findUnique({
    where: { id: versionId },
    select: { id: true, isStaged: true, isActive: true, vendor: true },
  });

  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  if (version.isActive) {
    return NextResponse.json({ error: "Version is already active" }, { status: 409 });
  }

  if (!version.isStaged) {
    return NextResponse.json({ error: "Version is not staged" }, { status: 409 });
  }

  // Check for unresolved conflicts (block on RATE_CHANGE / LANE_DROPPED / LARGE_CHANGE)
  const unresolvedCount = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count
    FROM rate_conflicts
    WHERE staging_version = ${versionId}::uuid
      AND resolution IS NULL
      AND conflict_type != 'LANE_ADDED'
  `;

  const unresolved = Number(unresolvedCount[0].count);
  if (unresolved > 0) {
    return NextResponse.json(
      {
        error: `${unresolved} unresolved conflicts must be reviewed before activation.`,
        hint: "Use GET /api/rates/conflicts?versionId=... to review them.",
      },
      { status: 409 },
    );
  }

  try {
    await prisma.$executeRaw`CALL activate_rate_version(${versionId}::uuid, ${userId})`;

    return NextResponse.json({
      success: true,
      versionId,
      vendor: version.vendor,
      message: `Version ${versionId} is now active.`,
    });
  } catch (err) {
    console.error("[rate-activate] Activation failed:", err);
    return NextResponse.json(
      { error: "Activation failed", detail: String(err) },
      { status: 500 },
    );
  }
}