import { NextRequest, NextResponse } from "next/server";

const SKYCART_API = "https://devapiv2.skart-express.com/api/v1/booking/rate-calculator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(SKYCART_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "accept": "*/*",
      },
      body: JSON.stringify(body),
    });

    // Read raw text first — the API sometimes returns HTML error pages
    const text = await upstream.text();

    // Try to parse as JSON; if it fails, surface the raw response for debugging
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Skycart non-JSON response (status", upstream.status, "):\n", text.slice(0, 500));
      return NextResponse.json(
        {
          message: `Skycart API returned a non-JSON response (HTTP ${upstream.status}). Check server logs for details.`,
          raw: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error("Skycart proxy error:", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Upstream API error" },
      { status: 502 }
    );
  }
}