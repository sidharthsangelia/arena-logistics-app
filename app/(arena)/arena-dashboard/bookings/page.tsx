import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, SlidersHorizontal, PackageCheck, Clock, Truck, CheckCheck } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Dummy data
// ─────────────────────────────────────────────────────────────────────────────

const BOOKINGS = [
  {
    id: "BK-001",
    org: "Tata Exports Pvt Ltd",
    client: "Ramesh Traders",
    origin: "BOM",
    destination: "DXB",
    vendor: "Aramex",
    weight: "142 kg",
    amount: "₹18,400",
    status: "CONFIRMED",
    createdAt: "19 Jun 2026",
  },
  {
    id: "BK-002",
    org: "Mahindra Logistics",
    client: "Gulf Connect LLC",
    origin: "DEL",
    destination: "LHR",
    vendor: "DHL",
    weight: "88 kg",
    amount: "₹24,200",
    status: "PROCESSING",
    createdAt: "19 Jun 2026",
  },
  {
    id: "BK-003",
    org: "Zenith Freight Co.",
    client: "Nexport GmbH",
    origin: "MAA",
    destination: "FRA",
    vendor: "FedEx",
    weight: "210 kg",
    amount: "₹41,750",
    status: "DISPATCHED",
    createdAt: "18 Jun 2026",
  },
  {
    id: "BK-004",
    org: "BlueStar Cargo",
    client: "Apex Textiles",
    origin: "BLR",
    destination: "SIN",
    vendor: "Skynet",
    weight: "55 kg",
    amount: "₹9,800",
    status: "CONFIRMED",
    createdAt: "18 Jun 2026",
  },
  {
    id: "BK-005",
    org: "Tata Exports Pvt Ltd",
    client: "Orient Impex",
    origin: "BOM",
    destination: "JFK",
    vendor: "UPS",
    weight: "320 kg",
    amount: "₹68,000",
    status: "DELIVERED",
    createdAt: "17 Jun 2026",
  },
  {
    id: "BK-006",
    org: "Mahindra Logistics",
    client: "SkyBridge Trading",
    origin: "DEL",
    destination: "CDG",
    vendor: "Aramex",
    weight: "76 kg",
    amount: "₹15,300",
    status: "PROCESSING",
    createdAt: "17 Jun 2026",
  },
  {
    id: "BK-007",
    org: "Zenith Freight Co.",
    client: "FastMove Ltd",
    origin: "HYD",
    destination: "AMS",
    vendor: "DHL",
    weight: "190 kg",
    amount: "₹38,500",
    status: "CONFIRMED",
    createdAt: "16 Jun 2026",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  CONFIRMED:  { label: "Confirmed",  variant: "default" },
  PROCESSING: { label: "Processing", variant: "secondary" },
  DISPATCHED: { label: "Dispatched", variant: "outline" },
  DELIVERED:  { label: "Delivered",  variant: "outline" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "outline" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  return (
    <div className="p-6 space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bookings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          All confirmed shipment bookings across clients.
        </p>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Bookings"  value={7}   icon={PackageCheck} />
        <StatCard label="Pending Action"  value={3}   icon={Clock}        />
        <StatCard label="In Transit"      value={2}   icon={Truck}        />
        <StatCard label="Delivered"       value={1}   icon={CheckCheck}   />
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search bookings, clients, orgs..."
            className="pl-8 h-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select defaultValue="all">
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="DISPATCHED">Dispatched</SelectItem>
              <SelectItem value="DELIVERED">Delivered</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="all">
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              <SelectItem value="aramex">Aramex</SelectItem>
              <SelectItem value="dhl">DHL</SelectItem>
              <SelectItem value="fedex">FedEx</SelectItem>
              <SelectItem value="ups">UPS</SelectItem>
              <SelectItem value="skynet">Skynet</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </Button>
        </div>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">ID</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {BOOKINGS.map((booking) => (
              <TableRow key={booking.id} className="cursor-pointer">
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {booking.id}
                </TableCell>
                <TableCell className="font-medium text-sm">
                  {booking.org}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {booking.client}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs">
                    {booking.origin}
                  </span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-mono text-xs">
                    {booking.destination}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{booking.vendor}</TableCell>
                <TableCell className="text-sm tabular-nums">
                  {booking.weight}
                </TableCell>
                <TableCell className="text-sm tabular-nums font-medium">
                  {booking.amount}
                </TableCell>
                <TableCell>
                  <StatusBadge status={booking.status} />
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {booking.createdAt}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <p>Showing 7 of 7 bookings</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>Previous</Button>
          <Button variant="outline" size="sm" disabled>Next</Button>
        </div>
      </div>

    </div>
  );
}