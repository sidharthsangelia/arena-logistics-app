import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";

import { getArenaAuth } from "@/utils/arena-auth";
import {
  browseMatrix,
  compareCarriers,
  getSweepRunDetail,
  listRunCarriers,
  listSweepFailures,
  listUnmappedServices,
} from "@/lib/rateSweep/queries";
import { SWEEP_COUNTRIES, WEIGHT_SLABS_KG } from "@/lib/rateSweep/config";
import { Button } from "@/components/ui/button";
import { VendorHealthTable } from "@/components/rate-sweeps/VendorHealthTable";
import { SweepFailuresTable } from "@/components/rate-sweeps/SweepFailuresTable";
import { CarrierComparison } from "@/components/rate-sweeps/CarrierComparison";
import { UnmappedServicesTable } from "@/components/rate-sweeps/UnmappedServicesTable";
import { MatrixBrowser } from "@/components/rate-sweeps/MatrixBrowser";
import { ForceFinaliseButton } from "@/components/rate-sweeps/ForceFinaliseButton";
import {
  CarrierComparisonSkeleton,
  MatrixBrowserSkeleton,
  SweepFailuresTableSkeleton,
  SweepHeroSkeleton,
  UnmappedServicesTableSkeleton,
  VendorHealthTableSkeleton,
} from "./skeletons";

export const metadata = {
  title: "Rate sweep",
};

/**
 * One sweep, in the order somebody debugs it.
 *
 *   1. did it finish, and how long did it take
 *   2. which vendor let us down (per vendor, never averaged: four vendors
 *      averaged together hide the one that is completely down)
 *   3. what exactly failed
 *   4. what actually landed, so the data can be sanity-checked by eye before
 *      anyone builds a quotation on it
 *
 * The matrix browser at the bottom defaults to the cheapest comparable rate per
 * lane, because that is the shape a quotation is built from and therefore the
 * shape most worth eyeballing for something obviously wrong.
 *
 * ── HOW IT LOADS ────────────────────────────────────────────────────────────
 * Six queries, of very different weights: reading the run row is one indexed
 * lookup, browsing the matrix pulls up to 500 rows. Awaiting them together meant
 * the whole screen, headings included, waited on the slowest.
 *
 * So each section streams on its own, and every heading and every paragraph of
 * explanation renders before any of them. Those never depended on the database:
 * they are the same words on every sweep ever run. The effect is that the page
 * has its full height and all of its prose from the first frame, and the tables
 * fill into boxes that are already the right size. Nothing below what you are
 * reading moves when something above it lands.
 */
export default async function RateSweepDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { isArenaMember, isArenaAdmin } = await getArenaAuth();
  if (!isArenaMember) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;

  const country = firstString(query.country);
  const vendor = firstString(query.vendor);
  const carrier = firstString(query.carrier);
  const weightParam = firstString(query.weight);
  const showAll = firstString(query.all) === "1";

  // The carrier comparison has its own lane and weight, kept on separate query
  // keys from the matrix browser's. They answer different questions and are
  // read at different moments, and sharing one filter would mean scrolling to
  // the bottom of the page changed what the top of it said.
  const cmpCountry = firstString(query.cmpCountry) ?? "US";
  const cmpWeight = firstString(query.cmpWeight) ?? "5";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href="/arena-dashboard/rate-sweeps"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All sweeps
      </Link>

      <Suspense fallback={<SweepHeroSkeleton />}>
        <SweepHero id={id} isArenaAdmin={isArenaAdmin} />
      </Suspense>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Per vendor</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The failure rate excludes lanes a vendor simply does not serve. A
          vendor that declines Brazil on all 30 weights answered those calls
          correctly, and counting them as failures would put every honest vendor
          permanently near the alert threshold.
        </p>

        <div className="mt-4">
          <Suspense fallback={<VendorHealthTableSkeleton />}>
            <VendorHealthSection id={id} />
          </Suspense>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Failures {showAll ? "and unserved lanes" : ""}
          </h2>

          {/* Built from the id in the URL rather than from the run row, so the
              toggle is clickable before any query has come back. */}
          <Link
            href={`/arena-dashboard/rate-sweeps/${id}${showAll ? "" : "?all=1"}`}
            className="text-sm underline underline-offset-2"
          >
            {showAll ? "Hide unserved lanes" : "Include unserved lanes"}
          </Link>
        </div>

        <div className="mt-4">
          <Suspense key={String(showAll)} fallback={<SweepFailuresTableSkeleton />}>
            <FailuresSection id={id} showAll={showAll} />
          </Suspense>
        </div>
      </section>

      <section className="mt-8" id="carriers">
        <h2 className="text-sm font-semibold">Same carrier, every vendor</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Three of our vendors resell FedEx and each spells it differently, so
          this groups on the normalised carrier rather than the service label.
          Reseller own-brand networks are left out: only one vendor sells each of
          them, so there is nothing to compare. The spread column is how much
          dearer the worst option is than the best.
        </p>

        <div className="mt-4">
          <Suspense
            key={`${cmpCountry}-${cmpWeight}`}
            fallback={<CarrierComparisonSkeleton />}
          >
            <CarrierComparisonSection
              id={id}
              cmpCountry={cmpCountry}
              cmpWeight={cmpWeight}
            />
          </Suspense>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Unmapped services</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Service names that matched no carrier rule. Each one is either a
          carrier we have no rule for, in which case its rates are missing from
          the comparison above, or a reseller product that belongs where it is.
          Add a rule in lib/rateSweep/carrier.ts and re-run the backfill.
        </p>

        <div className="mt-4">
          <Suspense fallback={<UnmappedServicesTableSkeleton />}>
            <UnmappedSection id={id} />
          </Suspense>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">What landed</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Raw vendor cost, no markup. Showing the cheapest comparable rate per
          lane by default; pick a vendor or a carrier to see every product
          behind it. Rates in a currency other than INR are excluded from the
          cheapest-of comparison rather than converted, because nothing here
          invents an exchange rate.
        </p>

        <div className="mt-4">
          <Suspense
            key={`${country}-${vendor}-${carrier}-${weightParam}`}
            fallback={<MatrixBrowserSkeleton />}
          >
            <MatrixSection
              id={id}
              country={country}
              vendor={vendor}
              carrier={carrier}
              weightParam={weightParam}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
//
// One query per boundary, so the cheap reads are on screen while the expensive
// ones are still running. The two filtered sections carry a key on their
// boundary — unlike the list screens, where a key would flash a skeleton on
// every keystroke, these filters are links and each click asks a genuinely
// different question, so bringing the skeleton back is the honest answer.
// ---------------------------------------------------------------------------

/**
 * The run row itself, and the only place notFound is raised. Every other section
 * reads the same run through the same memoised call, so a bad id costs one
 * lookup and the whole route is replaced before anything else can paint.
 */
async function SweepHero({
  id,
  isArenaAdmin,
}: {
  id: string;
  isArenaAdmin: boolean;
}) {
  const detail = await getSweepRunDetail(id);
  if (!detail) notFound();

  const { run } = detail;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Sweep of{" "}
            {new Date(run.startedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {run.trigger === "MANUAL" ? "Started by hand" : "Scheduled run"} ·
            matrix {run.configVersion} · {SWEEP_COUNTRIES.length} countries ×{" "}
            {WEIGHT_SLABS_KG.length} weights × {run.vendorIds.length} vendors
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/rate-sweeps/${run.id}/export`}>
              <Download className="size-4" />
              Export CSV
            </a>
          </Button>

          {run.status === "RUNNING" && isArenaAdmin ? (
            <ForceFinaliseButton runId={run.id} />
          ) : null}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Status" value={titleCase(run.status)} />
        <Stat
          label="Lanes reported"
          value={`${run.lanesCompleted}/${run.laneCount}`}
        />
        <Stat
          label="Rates stored"
          value={run.snapshotCount.toLocaleString("en-IN")}
        />
        <Stat
          label="Took"
          value={run.durationMinutes === null ? "running" : `${run.durationMinutes}m`}
        />
      </dl>

      {run.notes ? (
        <p className="mt-4 rounded-lg border p-3 text-sm text-muted-foreground">
          {run.notes}
        </p>
      ) : null}
    </>
  );
}

async function VendorHealthSection({ id }: { id: string }) {
  const detail = await getSweepRunDetail(id);
  if (!detail) return null;

  return <VendorHealthTable vendors={detail.vendors} />;
}

async function FailuresSection({
  id,
  showAll,
}: {
  id: string;
  showAll: boolean;
}) {
  const failures = await listSweepFailures(id, { includeNoService: showAll });
  return <SweepFailuresTable failures={failures} />;
}

async function CarrierComparisonSection({
  id,
  cmpCountry,
  cmpWeight,
}: {
  id: string;
  cmpCountry: string;
  cmpWeight: string;
}) {
  const [detail, cells] = await Promise.all([
    getSweepRunDetail(id),
    compareCarriers({
      runId: id,
      countryCode: cmpCountry,
      weightKg: Number(cmpWeight),
    }),
  ]);

  if (!detail) return null;

  return (
    <CarrierComparison
      cells={cells}
      vendorIds={detail.run.vendorIds}
      runId={detail.run.id}
      country={cmpCountry}
      weight={cmpWeight}
    />
  );
}

async function UnmappedSection({ id }: { id: string }) {
  const unmapped = await listUnmappedServices(id);
  return <UnmappedServicesTable rows={unmapped} />;
}

async function MatrixSection({
  id,
  country,
  vendor,
  carrier,
  weightParam,
}: {
  id: string;
  country: string | undefined;
  vendor: string | undefined;
  carrier: string | undefined;
  weightParam: string | undefined;
}) {
  const weightKg = weightParam ? Number(weightParam) : undefined;

  const [detail, rows, carriers] = await Promise.all([
    getSweepRunDetail(id),
    browseMatrix({
      runId: id,
      countryCode: country,
      vendorId: vendor,
      carrier,
      weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
      // A carrier filter is itself a "show me every option" request: the point
      // of picking FedEx is to see all of them, not one winner per lane.
      cheapestOnly: !vendor && !carrier,
      limit: 500,
    }),
    listRunCarriers(id),
  ]);

  if (!detail) return null;

  return (
    <MatrixBrowser
      rows={rows}
      runId={detail.run.id}
      vendorIds={detail.run.vendorIds}
      carriers={carriers}
      selected={{ country, vendor, carrier, weight: weightParam }}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** searchParams values can arrive as arrays when a key is repeated. */
function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}
