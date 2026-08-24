import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VendorBreakdownRow } from "@/lib/rateSweep/queries";

/**
 * One row per vendor the run set out to query.
 *
 * Driven by the run's own vendor list rather than by whatever produced rows, so
 * a vendor that returned nothing at all still appears, as a line of zeroes.
 * A vendor that quietly disappeared from the report is exactly the failure this
 * table exists to surface.
 *
 * ── EXPECTED, NOT ATTEMPTED ─────────────────────────────────────────────────
 * The first column is what the run planned to record, and the Missing column is
 * the gap. Both are here because the earlier version of this table counted only
 * the rows that exist, which meant a vendor that recorded nothing for eleven
 * countries was shown with a 0.0% failure rate. Every number below now comes
 * from the shared judgement in lib/rateSweep/health.ts, so this screen and the
 * alert cannot tell two different stories.
 */
export function VendorHealthTable({
  vendors,
}: {
  vendors: VendorBreakdownRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Quoted</TableHead>
            <TableHead className="text-right">Not served</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">Missing</TableHead>
            <TableHead className="text-right">Failure rate</TableHead>
            <TableHead className="text-right">Rates stored</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {vendors.map((vendor) => (
            <TableRow key={vendor.vendorId}>
              <TableCell className="font-medium">
                {vendor.vendorId}
                {vendor.silent ? (
                  <Badge variant="destructive" className="ml-2">
                    Nothing usable
                  </Badge>
                ) : vendor.degraded ? (
                  <Badge variant="outline" className="ml-2">
                    Degraded
                  </Badge>
                ) : null}

                {/* Lane coverage first, because a whole country with no rows is
                    the failure that a cell count can hide. */}
                {vendor.lanesEmpty > 0 || vendor.lanesPartial > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {[
                      vendor.lanesEmpty > 0
                        ? `${vendor.lanesEmpty} of ${vendor.lanesExpected} lanes recorded nothing`
                        : null,
                      vendor.lanesPartial > 0
                        ? `${vendor.lanesPartial} stopped short`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                ) : null}

                {/* The status spread only matters when something went wrong,
                    so it stays out of the way until it does. */}
                {vendor.failedRows > 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {Object.entries(vendor.byStatus)
                      .filter(
                        ([status]) => status !== "OK" && status !== "NO_SERVICE",
                      )
                      .map(([status, count]) => `${count} ${status.toLowerCase()}`)
                      .join(", ")}
                  </div>
                ) : null}
              </TableCell>

              <TableCell className="text-right tabular-nums text-muted-foreground">
                {vendor.expected.toLocaleString("en-IN")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {vendor.ok.toLocaleString("en-IN")}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {vendor.noService.toLocaleString("en-IN")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {vendor.failedRows.toLocaleString("en-IN")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {vendor.missing.toLocaleString("en-IN")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {(vendor.failureRatio * 100).toFixed(1)}%
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {vendor.snapshots.toLocaleString("en-IN")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
