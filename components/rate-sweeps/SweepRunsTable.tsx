"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SweepRunRow } from "@/lib/rateSweep/queries";

/**
 * The run history.
 *
 * A client component for one reason: while a sweep is in flight the row is
 * changing every few seconds as lanes report in, and a static server render
 * would show 3/80 until somebody refreshed. It refreshes itself only while
 * something is actually running, so a quiet page makes no requests at all.
 *
 * Fifteen seconds matches the cadence the invoice and booking tables use, which
 * keeps the app's polling behaviour consistent rather than each screen picking
 * its own number.
 */
const RUNNING_POLL_MS = 15_000;

export function SweepRunsTable({ runs }: { runs: SweepRunRow[] }) {
  const router = useRouter();
  const hasRunning = runs.some((run) => run.status === "RUNNING");

  useEffect(() => {
    if (!hasRunning) return;

    const id = setInterval(() => router.refresh(), RUNNING_POLL_MS);
    return () => clearInterval(id);
  }, [hasRunning, router]);

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm font-medium">No sweeps yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The first one runs on the next scheduled night, or start one now.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Vendors</TableHead>
            <TableHead className="text-right">Lanes</TableHead>
            <TableHead className="text-right">Calls</TableHead>
            <TableHead className="text-right">Rates stored</TableHead>
            <TableHead className="text-right">Took</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Link
                  href={`/arena-dashboard/rate-sweeps/${run.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {new Date(run.startedAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {run.trigger === "MANUAL" ? "Started by hand" : "Scheduled"}
                  {" · "}
                  {run.configVersion}
                </div>
              </TableCell>

              <TableCell>
                <StatusBadge status={run.status} />
                {run.notes ? (
                  <div className="mt-1 max-w-xs truncate text-xs text-muted-foreground">
                    {run.notes}
                  </div>
                ) : null}
              </TableCell>

              <TableCell className="text-sm">{run.vendorIds.join(", ")}</TableCell>

              <TableCell className="text-right tabular-nums">
                {run.lanesCompleted}/{run.laneCount}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {/* Failures are shown next to successes rather than as a
                    percentage: "31 failed" is actionable, "97.4%" is not. */}
                {run.okCalls.toLocaleString("en-IN")}
                {run.failedCalls > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    / {run.failedCalls} failed
                  </span>
                ) : null}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {run.snapshotCount.toLocaleString("en-IN")}
              </TableCell>

              <TableCell className="text-right tabular-nums text-muted-foreground">
                {run.durationMinutes === null
                  ? "running"
                  : `${run.durationMinutes}m`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Four states, three treatments. PARTIAL and RUNNING both read as "not done
 * worrying yet" and share the outline style; only FAILED gets the destructive
 * colour, so that colour keeps meaning "nothing usable came back".
 */
function StatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED") return <Badge variant="secondary">Completed</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">Failed</Badge>;
  if (status === "RUNNING") return <Badge variant="outline">Running</Badge>;
  return <Badge variant="outline">Partial</Badge>;
}
