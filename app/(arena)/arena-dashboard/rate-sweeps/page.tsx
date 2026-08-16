import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getArenaAuth } from "@/utils/arena-auth";
import {
  getMatrixFreshness,
  listSweepRuns,
} from "@/lib/rateSweep/queries";
import { describeMatrix } from "@/lib/rateSweep/run";
import { SWEEP_COUNTRIES, WEIGHT_SLABS_KG } from "@/lib/rateSweep/config";
import { StartSweepButton } from "@/components/rate-sweeps/StartSweepButton";
import { SweepRunsTable } from "@/components/rate-sweeps/SweepRunsTable";
import { FreshnessBanner } from "@/components/rate-sweeps/FreshnessBanner";
import {
  FreshnessBannerSkeleton,
  StatValueSkeleton,
  SweepRunsTableSkeleton,
} from "./skeletons";

export const metadata = {
  title: "Rate sweeps",
};

/**
 * Every scheduled sweep of the international rate matrix.
 *
 * ── WHAT THIS SCREEN IS FOR ─────────────────────────────────────────────────
 * Not "did the job run". The question worth answering on a Tuesday morning is
 * whether the numbers a quotation would be built from are still true, so the
 * freshness banner comes first and the run history comes second. A run that
 * succeeded five weeks ago and nothing since is a green table and a stale grid,
 * and the banner is what makes that impossible to miss.
 *
 * ── VISIBLE TO EVERY ARENA MEMBER ───────────────────────────────────────────
 * Deliberately not admin-gated, unlike the invoices screen. These pages show
 * vendor cost, which is commercially sensitive, but it is already visible to
 * ops on the live rate calculator, and the person who notices the grid has gone
 * stale is not necessarily an admin. STARTING a sweep is admin-only, because
 * that spends 2,400 calls against accounts that rate-limit us; the button
 * enforces it and so does the action behind it.
 */
export default async function RateSweepsPage() {
  // The only await before the shell. It reads the session Clerk already resolved
  // in middleware, so the heading, the buttons and the three stats that come out
  // of config paint on the first frame; the two database reads happen inside the
  // boundaries below and never hold any of that up.
  const { isArenaMember, isArenaAdmin } = await getArenaAuth();
  if (!isArenaMember) redirect("/dashboard");

  const matrix = describeMatrix();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rate sweeps</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every fifth night the platform asks each international vendor for the
            same {matrix.countries} countries at the same {matrix.slabs} weights,
            and keeps the answers. Quotation sheets are built from what is stored
            here. Bookings are always priced live.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* The reason the sweep exists, so it leads rather than hiding behind
              the run history somebody only reads when something broke. The
              builder itself lives under Quotes — a rate card is a document that
              goes to a customer, not a piece of sweep machinery. Admins only:
              this screen is open to every member, the cards behind it are not,
              and a link to a tab that will not render is worse than no link. */}
          {isArenaAdmin ? (
            <Button asChild variant="outline">
              <Link href="/arena-dashboard/quotes?tab=rate-cards">
                <FileSpreadsheet className="size-4" />
                Rate cards
              </Link>
            </Button>
          ) : null}

          <StartSweepButton canStart={isArenaAdmin} />
        </div>
      </div>

      <Suspense fallback={<FreshnessBannerSkeleton />}>
        <FreshnessSection />
      </Suspense>

      {/* Three of these four are read straight out of lib/rateSweep/config, so
          they are already known and never wait on anything. Only the stored-rate
          count needs the database, and it is the only value that suspends. */}
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Countries" value={String(SWEEP_COUNTRIES.length)} />
        <Stat label="Weight slabs" value={String(WEIGHT_SLABS_KG.length)} />
        <Stat label="Rates stored">
          <Suspense fallback={<StatValueSkeleton />}>
            <StoredRatesValue />
          </Suspense>
        </Stat>
        <Stat label="Matrix version" value={matrix.configVersion} />
      </dl>

      <div className="mt-8">
        <h2 className="text-sm font-semibold">Recent runs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A run that finished PARTIAL still stored usable rates from the vendors
          that worked. FAILED means nothing usable came back at all.
        </p>

        {/* The heading and the caveat above are the same on every visit, so they
            sit outside the boundary and the table alone waits for its rows. */}
        <div className="mt-4">
          <Suspense fallback={<SweepRunsTableSkeleton />}>
            <RunHistorySection />
          </Suspense>
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        The matrix definition lives in{" "}
        <code className="rounded bg-muted px-1 py-0.5">lib/rateSweep/config.ts</code>
        . Changing a country, a postcode or a weight is a code change on purpose:
        it changes what every stored number means.{" "}
        <Link href="/arena-dashboard/rates" className="underline underline-offset-2">
          Price a single shipment live
        </Link>
        .
      </p>
    </div>
  );
}

// Each boundary owns exactly one query, so the banner and the run history land
// whenever each is ready rather than both waiting on the slower of the two.
// getMatrixFreshness is read twice within one render and is memoised per request
// by the query layer, so the second boundary costs nothing extra.

async function FreshnessSection() {
  const freshness = await getMatrixFreshness();
  return <FreshnessBanner freshness={freshness} />;
}

async function StoredRatesValue() {
  const freshness = await getMatrixFreshness();
  return <>{freshness.totalSnapshots.toLocaleString("en-IN")}</>;
}

async function RunHistorySection() {
  const runs = await listSweepRuns(25);
  return <SweepRunsTable runs={runs} />;
}

/**
 * Takes either a resolved value or children, so a tile whose number is still
 * loading keeps its label, its border and its height. The <dd> is the same
 * element either way, which is what stops the row from resizing when the count
 * arrives.
 */
function Stat({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">
        {children ?? value}
      </dd>
    </div>
  );
}
