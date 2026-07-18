/**
 * app/(tenant)/domestic-rates/page.tsx
 *
 * Server Component shell for the DOMESTIC rate calculator.
 *
 * As of the Shipmozo integration this page reuses the same interactive client
 * as the international calculator (RatesClient) with scope="domestic". That
 * scope swaps the route card to India → India pincodes and fans requests over
 * the domestic adapter registry (Shipmozo /rate-calculator) — no DB rate cards.
 *
 * The legacy air-cargo calculator (IATA + RateVersion/RateCard) and the
 * arena-dashboard rate-upload flow are intentionally left in place elsewhere;
 * this page simply no longer uses them.
 */

import type { Metadata } from "next";
import RatesClient from "@/app/(tenant)/rates/RatesClient";

export const metadata: Metadata = {
  title: "Domestic Rate Calculator | Arena Cargo & Logistics",
  description:
    "Get instant domestic courier rate quotes across carriers by pincode.",
};

export default function DomesticRatesPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header — server-rendered, no JS required */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Domestic Rate Calculator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare live domestic courier rates by pincode in seconds.
          </p>
        </div>

        {/* Interactive client subtree (shared with the international calculator) */}
        <RatesClient scope="domestic" />
      </div>
    </main>
  );
}
