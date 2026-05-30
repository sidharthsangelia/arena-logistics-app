/**
 * app/rates/page.tsx
 *
 * Server Component shell for the rate calculator page.
 *
 * WHY A SERVER COMPONENT SHELL
 * -----------------------------
 * The rates page has no server-side data requirements at load time — rates
 * are fetched on demand by the form. A Server Component shell is still
 * valuable for:
 *
 * 1. Static metadata (title, description) is set here without a client
 *    bundle hit.
 * 2. The page heading, layout chrome, and any future server-rendered content
 *    (e.g. a list of recent destinations from the database) live here.
 * 3. RatesClient is the single "use client" boundary. All components below
 *    it that need interactivity declare their own "use client" as needed
 *    (RateCalculatorForm, RateResultsList, QuoteSheet). Components that
 *    don't need client interactivity (RateResultCard could in theory be a
 *    Server Component) stay lean.
 *
 * FUTURE: If you add quote history, you could server-render a
 * <RecentQuotes /> component here that fetches from the DB, placed above
 * or beside <RatesClient />, without touching the client bundle.
 */

import type { Metadata } from "next";
import RatesClient from "./RatesClient";


export const metadata: Metadata = {
  title: "Rate Calculator | Arena Cargo & Logistics",
  description:
    "Get instant freight rate quotes from multiple carriers for international shipments.",
};

export default function RatesPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Page header — server-rendered, no JS required */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Rate Calculator
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Get live freight rates from multiple carriers in seconds.
          </p>
        </div>

        {/* Interactive client subtree */}
        <RatesClient />

      </div>
    </main>
  );
}