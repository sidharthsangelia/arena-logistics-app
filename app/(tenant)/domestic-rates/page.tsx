/**
 * app/rates/domestic/page.tsx
 *
 * Server Component shell for the domestic rate calculator page, mirroring
 * the structure of app/rates/page.tsx (international). No server-side data
 * requirements at load time — DomesticRatesClient is the single "use client"
 * boundary, and rates are computed on demand via the getDomesticRates
 * server action (Prisma queries against RateVersion/RateCard/RateSlab).
 */

import type { Metadata } from "next";
import DomesticRateCalculatorForm from "@/components/rate-calculator/domestic/DomesticRateCalculatorForm";
import { prisma } from "@/utils/db";
 

export const metadata: Metadata = {
  title: "Domestic Rate Calculator | Arena Cargo & Logistics",
  description:
    "Get instant domestic air freight rate quotes from EDS, IndiGo CarGo, and Air India Cargo.",
};

const airports = await prisma.airport.findMany({
  where: { isActive: true },
  orderBy: { iataCode: "asc" },
  select: {
    iataCode: true,
  },
});

export default function DomesticRatesPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page header — server-rendered, no JS required */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Domestic Rate Calculator
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Get the best domestic air cargo rates across carriers, calculated
            directly from your rate cards.
          </p>
        </div>

        {/* Interactive client subtree */}
        <DomesticRateCalculatorForm airports={airports} />
      </div>
    </main>
  );
}