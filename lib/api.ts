import { RateApiResponse, RateRequest } from "./types";

 

export async function fetchRates(payload: RateRequest): Promise<RateApiResponse> {
  const res = await fetch("/api/rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err?.raw ? `\n\nAPI returned: ${err.raw}` : "";
    throw new Error((err?.message || "Failed to fetch rates") + detail);
  }

  return res.json();
}