import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { Shipment } from "@/generated/prisma";
import { formatDate } from "@/lib/utils";

// Every ShipmentStatus mapped — add new statuses here as the enum grows.
const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  DRAFT: "outline",
  PENDING_PAYMENT: "secondary",
  BOOKED: "secondary",
  PROCESSING: "secondary",
  DOCUMENTS_PENDING: "outline",
  IN_TRANSIT: "default",
  CUSTOMS_HOLD: "destructive",
  OUT_FOR_DELIVERY: "default",
  DELIVERED: "default",
  CANCELLED: "destructive",
  ON_HOLD: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_PAYMENT: "Pending payment",
  BOOKED: "Booked",
  PROCESSING: "Processing",
  DOCUMENTS_PENDING: "Docs pending",
  IN_TRANSIT: "In transit",
  CUSTOMS_HOLD: "Customs hold",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  ON_HOLD: "On hold",
};

function formatAmount(
  value: { toNumber(): number } | null | undefined,
  currency = "INR"
) {
  if (value == null) return "—";
  return `${currency} ${value.toNumber().toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RecentShipmentsTable({
  shipments,
}: {
  shipments: Shipment[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent shipments</CardTitle>
        <CardDescription>
          The 5 most recently created shipments for this organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {shipments.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No shipments yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Shipment #</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((shipment) => (
                <TableRow key={shipment.id}>
                  <TableCell className="pl-6 font-mono text-xs">
                    {shipment.shipmentNumber}
                  </TableCell>
                  <TableCell>
                    {shipment.selectedVendorName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {shipment.selectedProductName && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {shipment.selectedProductName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(shipment.quotedTotal, shipment.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[shipment.status] ?? "outline"}
                    >
                      {STATUS_LABEL[shipment.status] ?? shipment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-muted-foreground">
                    {formatDate(shipment.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}