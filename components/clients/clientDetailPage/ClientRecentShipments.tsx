import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ShipmentStatus } from "@/generated/prisma";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { fmt } from "@/utils/helpers";

export type ClientShipmentRow = {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  quotedTotal: any;
  currency: string;
  createdAt: Date;
  pickupAddress: { city: string };
  deliveryAddress: { city: string };
};

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(d);
}

export default function ClientRecentShipments({
  shipments,
  totalCount,
}: {
  shipments: ClientShipmentRow[];
  totalCount: number;
}) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Recent shipments
        </p>
        <span className="text-xs text-muted-foreground">
          {totalCount} total
        </span>
      </div>

      {shipments.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No shipments for this client yet.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">
                Shipment
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Route
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Status
              </TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">
                Amount
              </TableHead>
              <TableHead className="text-xs uppercase tracking-wide">
                Date
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shipments.map((s) => {
              const cfg = STATUS_CONFIG[s.status];
              return (
                <TableRow
                  key={s.id}
                  className="relative transition-colors hover:bg-muted/50"
                >
                  <TableCell className="relative">
                    <Link
                      href={`/shipments/${s.id}`}
                      className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View shipment ${s.shipmentNumber}`}
                    />
                    <span className="block text-sm font-medium">
                      {s.shipmentNumber}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.pickupAddress.city} → {s.deliveryAddress.city}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-medium ${cfg.className}`}
                    >
                      {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {s.quotedTotal != null
                      ? fmt(Number(s.quotedTotal), s.currency)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(s.createdAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
