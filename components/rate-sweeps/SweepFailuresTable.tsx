import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SweepFailureRow } from "@/lib/rateSweep/queries";

/**
 * Every call that did not produce a rate, with the vendor's own words.
 *
 * The synthetic-postcode marker is the useful one here. UAE and Qatar have no
 * postal system, so their lanes go out with a placeholder, and if those come
 * back empty the cause is almost certainly the placeholder rather than an
 * outage. Without the marker that is an afternoon of confusion; with it, it is
 * the first thing you see.
 */
export function SweepFailuresTable({
  failures,
}: {
  failures: SweepFailureRow[];
}) {
  if (failures.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nothing failed in this run.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Lane</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>What the vendor said</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {failures.map((failure, index) => (
            <TableRow key={`${failure.vendorId}-${failure.destCountryCode}-${failure.weightKg}-${index}`}>
              <TableCell className="font-medium">{failure.vendorId}</TableCell>

              <TableCell>
                {failure.destCountryCode}
                {failure.syntheticPostcode ? (
                  <Badge variant="outline" className="ml-2 font-normal">
                    placeholder postcode
                  </Badge>
                ) : null}
              </TableCell>

              <TableCell className="text-right tabular-nums">
                {failure.weightKg}kg
              </TableCell>

              <TableCell>
                <Badge
                  variant={
                    failure.status === "AUTH_ERROR" ? "destructive" : "outline"
                  }
                >
                  {failure.status.toLowerCase().replace("_", " ")}
                </Badge>
                {failure.httpStatus ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    HTTP {failure.httpStatus}
                  </span>
                ) : null}
              </TableCell>

              <TableCell className="max-w-md text-sm text-muted-foreground">
                <span className="line-clamp-2">{failure.errorMessage ?? "—"}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
