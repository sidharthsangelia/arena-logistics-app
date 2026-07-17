/**
 * NEXT.JS API ROUTE  —  POST /api/rates
 * -----------------------------------------------------------------------------
 * This is a deliberately thin layer. Its only jobs are:
 *   1. Parse and validate the incoming request body
 *   2. Call the service
 *   3. Return the response
 *
 * All business logic lives in the service and adapters, not here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRates } from "@/lib/services/rate-calculator.service";
import type { CanonicalRateRequest } from "@/lib/rate-adapters/core/types";

export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // -- Basic validation -----------------------------------------------------
  // In production, swap this with zod.parse() for full schema validation.

  const validationError = validateRequest(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const input = body as CanonicalRateRequest;

  // -- Optional: filter to specific vendors via query param -----------------
  // e.g. POST /api/rates?vendors=skart,aramex
  const vendorParam = req.nextUrl.searchParams.get("vendors");
  const vendorIds = vendorParam ? vendorParam.split(",").map((v) => v.trim()) : undefined;

  // -- Call the service -----------------------------------------------------
  try {
    const response = await getRates(input, { vendorIds });
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("[POST /api/rates] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// --- VALIDATION HELPER --------------------------------------------------------
// Replace with zod for production use; kept simple here for clarity.

function validateRequest(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return "Request body must be a JSON object";
  }

  const b = body as Record<string, unknown>;

  if (!b.origin || typeof b.origin !== "object") {
    return "Missing required field: origin";
  }
  if (!b.destination || typeof b.destination !== "object") {
    return "Missing required field: destination";
  }
  if (!b.shipment || typeof b.shipment !== "object") {
    return "Missing required field: shipment";
  }

  const shipment = b.shipment as Record<string, unknown>;

  // Two accepted shapes:
  //   1. Multi-piece (preferred): shipment.packages = [{ quantity, weightKg,
  //      lengthCm, widthCm, heightCm }, ...]
  //   2. Legacy single-package: shipment.weight (total) + shipment.quantity
  const packages = shipment.packages;
  if (Array.isArray(packages)) {
    if (packages.length === 0) {
      return "shipment.packages must contain at least one package";
    }
    for (const [i, pkg] of packages.entries()) {
      if (typeof pkg !== "object" || pkg === null) {
        return `shipment.packages[${i}] must be an object`;
      }
      const p = pkg as Record<string, unknown>;
      if (typeof p.weightKg !== "number" || p.weightKg <= 0) {
        return `shipment.packages[${i}].weightKg must be a positive number`;
      }
      if (typeof p.quantity !== "number" || p.quantity < 1) {
        return `shipment.packages[${i}].quantity must be at least 1`;
      }
    }
    return null;
  }

  if (typeof shipment.weight !== "number" || shipment.weight <= 0) {
    return "shipment.weight must be a positive number (or provide shipment.packages)";
  }
  if (typeof shipment.quantity !== "number" || shipment.quantity < 1) {
    return "shipment.quantity must be at least 1";
  }

  return null;
}
