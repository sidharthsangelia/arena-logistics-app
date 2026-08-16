/**
 * NEXT.JS API ROUTE  —  POST /api/rates
 * -----------------------------------------------------------------------------
 * This is a deliberately thin layer. Its only jobs are:
 *   1. Throttle the caller
 *   2. Parse and validate the incoming request body
 *   3. Call the service
 *   4. Return the response
 *
 * All business logic lives in the service and adapters, not here.
 *
 * ── WHY THIS ROUTE IS THROTTLED TWICE ───────────────────────────────────────
 * Every call here fans out to live vendor APIs that bill us per request. The
 * two server actions that do the same fan-out are throttled per org, because a
 * Clerk session gives them a stable identity to count against. This route has
 * no session: `/api/*` is excluded from the tenant matcher in proxy.ts, so
 * anyone who can reach the host can spend our vendor quota here.
 *
 * A per-IP window is the only per-caller identity available, and an IP is
 * rotatable — on its own it caps an honest client and nothing else. So there is
 * a second, process-wide window as well. That one is the real bound: it caps
 * what this route can cost per instance per minute no matter how the traffic is
 * spread. Neither number is reachable by legitimate use.
 *
 * This is a cost control, not an access control. The route still answers
 * unauthenticated callers and still returns un-marked-up buying cost — that is
 * a separate open finding (N1 in the launch-readiness report) with a real
 * decision behind it: whether this endpoint should exist at all, or should be
 * authenticated and marked up like the actions. Throttling it does not settle
 * that, and is not meant to look like it has.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRates } from "@/lib/services/rate-calculator.service";
import { checkRateLimit } from "@/lib/rateLimit";
import type { CanonicalRateRequest } from "@/lib/rate-adapters/core/types";

/**
 * Best-effort caller identity. `x-forwarded-for` is client-controllable, so a
 * determined caller can forge or rotate it — hence the global window above.
 * Everything unattributable shares one bucket, which is the conservative
 * direction: unknown callers are throttled together, not exempted.
 */
function callerKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  return ip || "unknown";
}

function throttled(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: `Too many requests. Retry in ${retryAfterSeconds}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(req: NextRequest) {
  // -- Throttle first -------------------------------------------------------
  // Ahead of body parsing on purpose: a throttled request should cost us as
  // little as possible, and JSON parsing an attacker-supplied body is work.
  const perCaller = checkRateLimit("ratesApiCaller", callerKey(req));
  if (!perCaller.ok) return throttled(perCaller.retryAfterSeconds);

  const global = checkRateLimit("ratesApiGlobal", "all");
  if (!global.ok) return throttled(global.retryAfterSeconds);

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
