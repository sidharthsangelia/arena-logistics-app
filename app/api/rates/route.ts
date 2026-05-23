/**
 * NEXT.JS API ROUTE  —  POST /api/rates
 * ─────────────────────────────────────────────────────────────────────────────
 * This is a deliberately thin layer. Its only jobs are:
 *   1. Parse and validate the incoming request body
 *   2. Call the service
 *   3. Return the response
 *
 * All business logic lives in the service and adapters, not here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRates } from "@/lib/services/rate-calculator.service";
import type { CanonicalRateRequest } from "@/lib/adapters/core/types";

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

  // ── Basic validation ─────────────────────────────────────────────────────
  // In production, swap this with zod.parse() for full schema validation.

  const validationError = validateRequest(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const input = body as CanonicalRateRequest;

  // ── Optional: filter to specific vendors via query param ─────────────────
  // e.g. POST /api/rates?vendors=skart,aramex
  const vendorParam = req.nextUrl.searchParams.get("vendors");
  const vendorIds = vendorParam ? vendorParam.split(",").map((v) => v.trim()) : undefined;

  // ── Call the service ─────────────────────────────────────────────────────
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

// ─── VALIDATION HELPER ────────────────────────────────────────────────────────
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
  if (typeof shipment.weight !== "number" || shipment.weight <= 0) {
    return "shipment.weight must be a positive number";
  }
  if (typeof shipment.quantity !== "number" || shipment.quantity < 1) {
    return "shipment.quantity must be at least 1";
  }

  return null;
}








// import { NextRequest, NextResponse } from "next/server";

// const SKYCART_API = "https://devapiv2.skart-express.com/api/v1/booking/rate-calculator";

// const ARAMEX_API = "https://ws.aramex.net/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate";

// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();

//     const upstream = await fetch(SKYCART_API, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "accept": "*/*",
//       },
//       body: JSON.stringify(body),
//     });

//     const aramex = await fetch(ARAMEX_API, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "accept": "*/*",
//       },
//       body: JSON.stringify(body),
//     });

//     // Read raw text first — the API sometimes returns HTML error pages
//     const text = await upstream.text();

//     // Try to parse as JSON; if it fails, surface the raw response for debugging
//     let data: unknown;
//     try {
//       data = JSON.parse(text);
//     } catch {
//       console.error("Skycart non-JSON response (status", upstream.status, "):\n", text.slice(0, 500));
//       return NextResponse.json(
//         {
//           message: `Skycart API returned a non-JSON response (HTTP ${upstream.status}). Check server logs for details.`,
//           raw: text.slice(0, 300),
//         },
//         { status: 502 }
//       );
//     }

//     return NextResponse.json(data, { status: upstream.status });
//   } catch (err) {
//     console.error("Skycart proxy error:", err);
//     return NextResponse.json(
//       { message: err instanceof Error ? err.message : "Upstream API error" },
//       { status: 502 }
//     );
//   }
// }