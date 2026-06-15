/**
 * app/api/rates/upload/route.ts
 * ─────────────────────────────
 * Next.js App Router API route that:
 *  1. Accepts multipart/form-data with up to 3 CSV files (eds, indigo, airindia).
 *  2. Validates vendor + file.
 *  3. Streams progress events via SSE while loading (optional — see /api/rates/upload/stream).
 *  4. Returns a JSON summary of what was loaded.
 *
 * Auth: protect this route with your existing Clerk middleware.
 * The orgId is read from Clerk's auth() so we can log uploadedBy.
 *
 * POST /api/rates/upload
 * Content-Type: multipart/form-data
 *
 * Fields:
 *   vendor          "EDS" | "INDIGO" | "AIR_INDIA"
 *   file            <CSV file>
 *   effectiveFrom   "2025-06-01"  (optional, defaults to today)
 *
 * Response 200:
 *   {
 *     "vendor": "INDIGO",
 *     "versionId": "clxxx...",
 *     "cardsInserted": 1284,
 *     "slabsInserted": 4302,
 *     "awbChargesInserted": 7,
 *     "message": "Staged successfully. Activate from the rates dashboard."
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { RateVendor } from "@/generated/prisma/edge";
import { parseCSVForVendor } from "@/lib/domestic/csvParser";
import { runLoad } from "@/lib/domestic/rateLoader";
import { prisma } from "@/utils/db";
 

const ALLOWED_VENDORS: RateVendor[] = ["EDS", "INDIGO", "AIR_INDIA"];

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse multipart ──────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const vendorRaw = (formData.get("vendor") as string | null)?.toUpperCase();
  const file = formData.get("file") as File | null;
  const effectiveFromRaw = formData.get("effectiveFrom") as string | null;

  if (!vendorRaw || !ALLOWED_VENDORS.includes(vendorRaw as RateVendor)) {
    return NextResponse.json(
      { error: `vendor must be one of: ${ALLOWED_VENDORS.join(", ")}` },
      { status: 400 },
    );
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const vendor = vendorRaw as RateVendor;

  // ── Parse date ───────────────────────────────────────────────────────────
  let effectiveFrom: Date | undefined;
  if (effectiveFromRaw) {
    effectiveFrom = new Date(effectiveFromRaw);
    if (isNaN(effectiveFrom.getTime())) {
      return NextResponse.json(
        { error: "effectiveFrom must be a valid date (YYYY-MM-DD)" },
        { status: 400 },
      );
    }
  }

  // ── Read CSV text ────────────────────────────────────────────────────────
  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return NextResponse.json({ error: "Failed to read uploaded file" }, { status: 400 });
  }

  if (!csvText.trim()) {
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  }

  // ── Parse rows ───────────────────────────────────────────────────────────
  let parsedRows: ReturnType<typeof parseCSVForVendor>;
  try {
    parsedRows = parseCSVForVendor(csvText, vendor);
  } catch (err) {
    return NextResponse.json(
      { error: "CSV parse error", detail: String(err) },
      { status: 422 },
    );
  }

  if (parsedRows.rows.length === 0) {
    return NextResponse.json(
      { error: "CSV parsed to 0 rows. Check that the file matches the expected vendor format." },
      { status: 422 },
    );
  }

  // ── Load into DB ─────────────────────────────────────────────────────────
  try {
    const result = await runLoad(
      prisma,
      {
        vendor,
        sourceFilename: file.name,
        effectiveFrom,
        uploadedBy: userId,
      },
      parsedRows.rows,
    );

    return NextResponse.json({
      ...result,
      rowsParsed: parsedRows.rows.length,
      message: "Staged successfully. Activate from the rates dashboard when ready.",
    });
  } catch (err) {
    console.error("[rate-upload] Load failed:", err);
    return NextResponse.json(
      {
        error: "Database load failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

// Only POST is allowed
export const GET = () =>
  NextResponse.json({ error: "Method not allowed" }, { status: 405 });