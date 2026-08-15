import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VENDOR_FAILURE_ALERT_RATIO } from "@/lib/rateSweep/config";
import type { VendorBreakdownRow } from "@/lib/rateSweep/queries";

/**
 * One row per vendor the run set out to query.
 *
 * Driven by the run's own vendor list rather than by whatever produced rows, so
 * a vendor that returned nothing at all still appears, as a line of zeroes.
 * A vendor that quietly disappeared from the report is exactly the failure this
 * table exists to surface.
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
            <TableHead className="text-right">Attempted</TableHead>
            <TableHead className="text-right">Quoted</TableHead>
            <TableHead className="text-right">Not served</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">Failure rate</TableHead>
            <TableHead className="text-right">Rates stored</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {vendors.map((vendor) => {
            const silent = vendor.attempted > 0 && vendor.ok === 0;
            const degraded =
              silent || vendor.failureRatio > VENDOR_FAILURE_ALERT_RATIO;

            return (
              <TableRow key={vendor.vendorId}>
                <TableCell className="font-medium">
                  {vendor.vendorId}
                  {silent ? (
                    <Badge variant="destructive" className="ml-2">
                      Nothing usable
                    </Badge>
                  ) : degraded ? (
                    <Badge variant="outline" className="ml-2">
                      Degraded
                    </Badge>
                  ) : null}

                  {/* The status spread only matters when something went wrong,
                      so it stays out of the way until it does. */}
                  {vendor.failed > 0 ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {Object.entries(vendor.byStatus)
                        .filter(([status]) => status !== "OK" && status !== "NO_SERVICE")
                        .map(([status, count]) => `${count} ${status.toLowerCase()}`)
                        .join(", ")}
                    </div>
                  ) : null}
                </TableCell>

                <TableCell className="text-right tabular-nums">
                  {vendor.attempted.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {vendor.ok.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {vendor.noService.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {vendor.failed.toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(vendor.failureRatio * 100).toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {vendor.snapshots.toLocaleString("en-IN")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
