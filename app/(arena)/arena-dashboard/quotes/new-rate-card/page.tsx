import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getArenaAuth } from "@/utils/arena-auth";
import { prisma } from "@/utils/db";
import { getMatrixFreshness } from "@/lib/rateSweep/queries";
import { QuotationBuilder } from "@/components/rate-quotations/QuotationBuilder";

export const metadata = {
  title: "Build a rate card",
};

/**
 * Turn the stored rate matrix into a workbook somebody can send.
 *
 * ── WHY THIS IS A PAGE AND NOT A BUTTON ─────────────────────────────────────
 * A rate card is not an export. An export has one correct answer and a button;
 * this has an audience, a markup, a carrier set and two exclusions that each
 * change what the file means, and getting the first of them wrong emails our
 * cost book to a customer. The decisions deserve room.
 *
 * ── WHY IT LIVES UNDER /quotes AND NOT /rate-sweeps ─────────────────────────
 * The sweep is the machinery: which vendors answered, how fresh the grid is,
 * what failed. A rate card is a document that goes to a customer and belongs
 * beside the other documents that go to customers. Somebody building one is
 * doing sales, not operations, and should not have to pass through a
 * diagnostics screen to get there.
 *
 * ── ARENA ADMINS ONLY ───────────────────────────────────────────────────────
 * Not every member, unlike the quotes list. Setting the markup on a document
 * that goes to a customer is a pricing decision, and the internal audience
 * produces our buying price as a file. Both sit on the same side of the line as
 * wallets and invoices. proxy.ts redirects as a courtesy; this check is the one
 * that counts, and the API route behind the button checks for itself.
 */
export default async function BuildRateCardPage() {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard/quotes");

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
          A rate sweep has to finish before a rate card can be built. Start one
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

  // Every client on the platform, for the optional link on a generated card.
  // Not org-scoped: Arena staff build cards for any account's client, and the
  // account name travels with each one so two clients of the same name stay
  // distinguishable in the picker.
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      org: { select: { name: true } },
    },
  });

  // Freshness comes from the query layer rather than a Date.now() in the render
  // path: a component that reads the clock is not idempotent, and this is the
  // same number the sweeps screen shows, so it should come from one place.
  const freshness = await getMatrixFreshness();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href="/arena-dashboard/quotes?tab=rate-cards"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Rate cards
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Build a rate card</h1>
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
        clients={clients.map((client) => ({
          id: client.id,
          companyName: client.companyName,
          orgName: client.org.name,
        }))}
      />
    </div>
  );
}
