import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getArenaAuth } from "@/utils/arena-auth";
import { prisma } from "@/utils/db";
import { getMatrixFreshness } from "@/lib/rateSweep/queries";
import { QuotationBuilder } from "@/components/rate-sweeps/QuotationBuilder";

export const metadata = {
  title: "Build a quotation",
};

/**
 * Turn the stored rate matrix into a workbook somebody can send.
 *
 * ── WHY THIS IS A PAGE AND NOT A BUTTON ─────────────────────────────────────
 * A quotation is not an export. An export has one correct answer and a button;
 * this has an audience, a markup, a carrier set and two exclusions that each
 * change what the file means, and getting the first of them wrong emails our
 * cost book to a customer. The decisions deserve room.
 *
 * ── VISIBLE TO EVERY ARENA MEMBER ───────────────────────────────────────────
 * Same reasoning as the sweeps list: the person who builds a quotation is not
 * necessarily an admin. The internal-audience file is gated by being obvious
 * rather than by role, because ops legitimately need the cost view.
 */
export default async function QuotationBuilderPage() {
  const { isArenaMember } = await getArenaAuth();
  if (!isArenaMember) redirect("/dashboard");

  const run = await prisma.rateSweepRun.findFirst({
    where: {
      status: { in: ["COMPLETED", "PARTIAL"] },
      snapshotCount: { gt: 0 },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });

  if (!run) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          No rates to quote from yet
        </h1>
        <p className="mt-2 text-muted-foreground">
          A rate sweep has to finish before a quotation can be built. Start one
          from the sweeps screen, or wait for tonight&apos;s scheduled run.
        </p>
        <Link
          href="/arena-dashboard/rate-sweeps"
          className="mt-6 inline-block underline underline-offset-4"
        >
          Go to rate sweeps
        </Link>
      </div>
    );
  }

  // Carrier counts come from the data rather than the rule list, so the picker
  // never offers a carrier that would produce an empty sheet.
  const carrierGroups = await prisma.vendorRateSnapshot.groupBy({
    by: ["carrier"],
    where: { runId: run.id, isComparable: true },
    _count: { _all: true },
  });

  const availableCarriers = carrierGroups
    .map((group) => ({ code: group.carrier, rows: group._count._all }))
    .sort((a, b) => b.rows - a.rows);

  // Freshness comes from the query layer rather than a Date.now() in the render
  // path: a component that reads the clock is not idempotent, and this is the
  // same number the sweeps screen shows, so it should come from one place.
  const freshness = await getMatrixFreshness();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href="/arena-dashboard/rate-sweeps"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Rate sweeps
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Build a quotation</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A formatted Excel workbook from the stored rate matrix: a cover, a
          rate grid per carrier or a single best-rate grid, and the full terms
          and conditions. Every price carries the carrier it belongs to.
        </p>
      </div>

      <QuotationBuilder
        runId={run.id}
        capturedAt={run.startedAt.toISOString()}
        ageDays={freshness.ageDays ?? 0}
        stale={freshness.stale}
        availableCarriers={availableCarriers}
      />
    </div>
  );
}
