// -----------------------------------------------------------------------------
// lib/api.ts
//
// Thin HTTP layer for the rate calculator.
// Credentials live in env vars (server-side); never passed from the form.
// -----------------------------------------------------------------------------

import { RateRequest, RateResponse } from "@/lib/types";

/**
 * POST /api/rates
 *
 * @param payload  Canonical RateRequest — built from the form values
 * @param vendors  Optional subset of vendor IDs to query. Omit to query all.
 */
export async function fetchRates(
  payload: RateRequest,
  vendors?: string[]
): Promise<RateResponse> {
  const url = new URL("/api/rates", window.location.origin);
  if (vendors && vendors.length > 0) {
    url.searchParams.set("vendors", vendors.join(","));
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const raw = await res.text();
    throw new Error(`Unexpected non-JSON response from server:\n${raw.slice(0, 200)}`);
  }

  const data: RateResponse = await res.json();

  if (!res.ok) {
    throw new Error(
      (data as unknown as { error?: string }).error ?? `Server error ${res.status}`
    );
  }

  return data;
}