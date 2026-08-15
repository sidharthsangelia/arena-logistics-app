import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UnmappedServiceRow } from "@/lib/rateSweep/queries";

/**
 * Service names this run returned that matched no carrier rule.
 *
 * Empty is the normal state and says so plainly rather than hiding, because
 * "there is nothing here" and "this check did not run" look identical when a
 * section disappears.
 *
 * A row here is not a failure. It is a decision waiting: either a vendor has
 * started selling a carrier we have no rule for, in which case every rate under
 * that name is missing from the carrier comparison and from any quotation built
 * on it, or it is a reseller's own product and OTHER is the right answer.
 */
export function UnmappedServicesTable({ rows }: { rows: UnmappedServiceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Every service name in this run mapped to a known carrier.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Service name</TableHead>
            <TableHead className="text-right">Rates</TableHead>
            <TableHead className="text-right">Countries</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.vendorId}-${row.productName}`}>
              <TableCell>{row.vendorId}</TableCell>
              <TableCell className="font-medium">{row.productName}</TableCell>
              <TableCell className="text-right tabular-nums">{row.rows}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {row.countries}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
