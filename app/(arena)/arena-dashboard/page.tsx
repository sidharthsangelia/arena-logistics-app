import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  PackageCheck,
  Clock,
  Truck,
  Building2,
  TrendingUp,
  ArrowRight,
  Upload,
  BarChart3,
  AlertCircle,
  CheckCheck,
} from "lucide-react";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────────────────────
// Dummy data
// ─────────────────────────────────────────────────────────────────────────────

const RECENT_BOOKINGS = [
  {
    id: "BK-001",
    org: "Tata Exports Pvt Ltd",
    client: "Ramesh Traders",
    route: "BOM → DXB",
    vendor: "Aramex",
    amount: "₹18,400",
    status: "CONFIRMED",
  },
  {
    id: "BK-002",
    org: "Mahindra Logistics",
    client: "Gulf Connect LLC",
    route: "DEL → LHR",
    vendor: "DHL",
    amount: "₹24,200",
    status: "PROCESSING",
  },
  {
    id: "BK-003",
    org: "Zenith Freight Co.",
    client: "Nexport GmbH",
    route: "MAA → FRA",
    vendor: "FedEx",
    amount: "₹41,750",
    status: "DISPATCHED",
  },
  {
    id: "BK-004",
    org: "BlueStar Cargo",
    client: "Apex Textiles",
    route: "BLR → SIN",
    vendor: "Skynet",
    amount: "₹9,800",
    status: "CONFIRMED",
  },
  {
    id: "BK-005",
    org: "Tata Exports Pvt Ltd",
    client: "Orient Impex",
    route: "BOM → JFK",
    vendor: "UPS",
    amount: "₹68,000",
    status: "DELIVERED",
  },
];

const ACTIVE_ORGS = [
  { name: "Tata Exports Pvt Ltd",  plan: "GROWTH",     bookings: 12, markup: "28%" },
  { name: "Mahindra Logistics",    plan: "ENTERPRISE",  bookings: 31, markup: "22%" },
  { name: "Zenith Freight Co.",    plan: "STARTER",     bookings: 7,  markup: "30%" },
  { name: "BlueStar Cargo",        plan: "FREE",        bookings: 3,  markup: "30%" },
];

const RATE_VERSIONS = [
  { vendor: "EDS",       version: "v4",  effective: "01 Jun 2026", status: "ACTIVE" },
  { vendor: "IndiGo",    version: "v7",  effective: "15 May 2026", status: "ACTIVE" },
  { vendor: "Air India", version: "v3",  effective: "10 Jun 2026", status: "STAGED" },
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
  ACTIVE:     { label: "Active",     variant: "default" },
  STAGED:     { label: "Staged",     variant: "secondary" },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const PLAN_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  ENTERPRISE: "default",
  GROWTH:     "secondary",
  STARTER:    "outline",
  FREE:       "outline",
};

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
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
        {sub && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ArenaDashboardPage() {
  return (
    <div className="p-6 space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Friday, 19 June 2026
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/arena-dashboard/rate-cards/upload">
              <Upload className="h-3.5 w-3.5" />
              Upload Rates
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" asChild>
            <Link href="/arena-dashboard/bookings">
              <PackageCheck className="h-3.5 w-3.5" />
              View Bookings
            </Link>
          </Button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Bookings"
          value={53}
          sub="↑ 8 from last week"
          icon={PackageCheck}
        />
        <StatCard
          label="Pending Action"
          value={6}
          sub="Needs ops assignment"
          icon={Clock}
        />
        <StatCard
          label="In Transit"
          value={14}
          sub="Across 5 vendors"
          icon={Truck}
        />
        <StatCard
          label="Active Orgs"
          value={4}
          sub="1 on Enterprise plan"
          icon={Building2}
        />
      </div>

      {/* ── Middle row: Recent bookings + Rate versions ──────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Recent bookings — takes 2/3 width */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">Recent Bookings</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Latest confirmed shipments across all orgs
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
              <Link href="/arena-dashboard/bookings">
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6 w-[80px]">ID</TableHead>
                  <TableHead>Org / Client</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RECENT_BOOKINGS.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer">
                    <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                      {b.id}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-tight">{b.org}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{b.client}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{b.route}</TableCell>
                    <TableCell className="text-sm tabular-nums font-medium">
                      {b.amount}
                    </TableCell>
                    <TableCell className="pr-6">
                      <StatusBadge status={b.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Rate card versions — takes 1/3 width */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Rate Versions</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Active domestic rate cards
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
                <Link href="/arena-dashboard/rate-cards">
                  <BarChart3 className="h-3 w-3" />
                  Manage
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {RATE_VERSIONS.map((rv, i) => (
              <div key={rv.vendor}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{rv.vendor}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rv.version} · Effective {rv.effective}
                    </p>
                  </div>
                  <StatusBadge status={rv.status} />
                </div>
                {i < RATE_VERSIONS.length - 1 && (
                  <Separator className="mt-3" />
                )}
              </div>
            ))}

            <Separator />

            {/* Staged alert */}
            <div className="flex items-start gap-2 rounded-md border px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium">Air India v3 is staged</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review and activate before 25 Jun.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom row: Active orgs ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Active Organisations</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Tenants with bookings in the last 30 days
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
            <Link href="/arena-dashboard/clients">
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Organisation</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Bookings (30d)</TableHead>
                <TableHead className="pr-6">Markup</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ACTIVE_ORGS.map((org) => (
                <TableRow key={org.name} className="cursor-pointer">
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md border flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">{org.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={PLAN_VARIANTS[org.plan] ?? "outline"}>
                      {org.plan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm tabular-nums">{org.bookings}</span>
                    </div>
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm tabular-nums">{org.markup}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}