import Link from "next/link";
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Calculator,
  PackagePlus,
  MapPin,
  TrendingUp,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ── Mock data ─────────────────────────────────────────────────────────────────

const KPI_CARDS = [
  {
    title:    "Total Shipments",
    value:    "1,284",
    delta:    "+12%",
    positive: true,
    icon:     Package,
    iconBg:   "bg-blue-50",
    iconColor:"text-blue-600",
    sub:      "This month",
  },
  {
    title:    "In Transit",
    value:    "38",
    delta:    "+3",
    positive: true,
    icon:     Truck,
    iconBg:   "bg-amber-50",
    iconColor:"text-amber-600",
    sub:      "Active shipments",
  },
  {
    title:    "Delivered",
    value:    "1,201",
    delta:    "93.5%",
    positive: true,
    icon:     CheckCircle2,
    iconBg:   "bg-emerald-50",
    iconColor:"text-emerald-600",
    sub:      "Success rate",
  },
  {
    title:    "Avg. Transit Time",
    value:    "4.2 days",
    delta:    "-0.3d",
    positive: true,
    icon:     Clock,
    iconBg:   "bg-purple-50",
    iconColor:"text-purple-600",
    sub:      "vs last month",
  },
];

const QUICK_ACTIONS = [
  {
    label: "Get Rates",
    description: "Compare live carrier rates",
    href:  "/rates",
    icon:  Calculator,
    color: "bg-blue-600 hover:bg-blue-700",
  },
  {
    label: "Book Shipment",
    description: "Create a new booking",
    href:  "/book",
    icon:  PackagePlus,
    color: "bg-emerald-600 hover:bg-emerald-700",
  },
  {
    label: "Track Package",
    description: "Live shipment tracking",
    href:  "/track",
    icon:  MapPin,
    color: "bg-amber-600 hover:bg-amber-700",
  },
];

type ShipmentStatus = "In Transit" | "Delivered" | "Pending" | "Delayed";

const RECENT_SHIPMENTS: {
  id: string;
  origin: string;
  destination: string;
  carrier: string;
  status: ShipmentStatus;
  date: string;
  weight: string;
}[] = [
  {
    id:          "AWB-20240512-001",
    origin:      "New Delhi, IN",
    destination: "Sydney, AU",
    carrier:     "Aramex",
    status:      "In Transit",
    date:        "12 May 2025",
    weight:      "3.2 kg",
  },
  {
    id:          "AWB-20240511-004",
    origin:      "Mumbai, IN",
    destination: "Dubai, UAE",
    carrier:     "Skart",
    status:      "Delivered",
    date:        "11 May 2025",
    weight:      "1.8 kg",
  },
  {
    id:          "AWB-20240510-002",
    origin:      "Bangalore, IN",
    destination: "London, UK",
    carrier:     "Aramex",
    status:      "Delivered",
    date:        "10 May 2025",
    weight:      "5.0 kg",
  },
  {
    id:          "AWB-20240509-007",
    origin:      "Chennai, IN",
    destination: "Singapore, SG",
    carrier:     "Skart",
    status:      "Delayed",
    date:        "9 May 2025",
    weight:      "2.1 kg",
  },
  {
    id:          "AWB-20240508-003",
    origin:      "New Delhi, IN",
    destination: "New York, US",
    carrier:     "Aramex",
    status:      "Pending",
    date:        "8 May 2025",
    weight:      "0.9 kg",
  },
];

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ShipmentStatus, string> = {
  "In Transit": "bg-blue-50  text-blue-700  border-blue-200",
  "Delivered":  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Pending":    "bg-slate-50 text-slate-600 border-slate-200",
  "Delayed":    "bg-red-50   text-red-700   border-red-200",
};

function StatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <Badge variant="outline" className={`text-xs ${STATUS_STYLES[status]}`}>
      {status}
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">

      {/* ── Page heading ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Good morning, Admin 👋
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here&apos;s what&apos;s happening with your shipments today.
        </p>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((card) => (
          <Card key={card.title} className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {card.value}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    {card.positive ? (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span
                      className={`text-xs font-medium ${
                        card.positive ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {card.delta}
                    </span>
                    <span className="text-xs text-slate-400">{card.sub}</span>
                  </div>
                </div>
                <div className={`rounded-lg p-2 ${card.iconBg}`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-4">
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center ${action.color} transition-colors shrink-0`}
                  >
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {action.label}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {action.description}
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 ml-auto shrink-0 group-hover:text-blue-500 transition-colors" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Recent Shipments ───────────────────────────────────────────────── */}
      <section>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Shipments</CardTitle>
                <CardDescription>Your latest 5 shipments</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/shipments" className="flex items-center gap-1 text-xs">
                  View all
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/60">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      AWB / ID
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Route
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Carrier
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Weight
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Status
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RECENT_SHIPMENTS.map((s, i) => (
                    <tr
                      key={s.id}
                      className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${
                        i % 2 === 0 ? "" : "bg-slate-50/30"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {s.id}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-slate-900 text-xs">{s.origin}</span>
                          <span className="text-slate-400 text-xs">→ {s.destination}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 text-xs">{s.carrier}</td>
                      <td className="px-4 py-3 text-slate-700 text-xs">{s.weight}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {s.date}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      <section>
        <Card className="shadow-sm border-amber-200 bg-amber-50/40">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                1 shipment is delayed
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                AWB-20240509-007 (Chennai → Singapore) is running behind schedule.{" "}
                <Link href="/track" className="underline font-medium">
                  Track it now
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}