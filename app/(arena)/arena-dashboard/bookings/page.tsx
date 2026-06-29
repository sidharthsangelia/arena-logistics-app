import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { redirect } from "next/navigation";
import { ShipmentStatus } from "@/generated/prisma";
import Link from "next/link";

import {
  Package,
  ArrowRight,
  PackageX,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShipmentRow = Awaited<ReturnType<typeof getShipments>>["shipments"][number];

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function getShipments(statusFilter?: string) {
  const where =
    statusFilter && statusFilter !== "ALL"
      ? { status: statusFilter as ShipmentStatus }
      : {};

  const [shipments, counts] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        shipmentNumber: true,
        status: true,
        createdAt: true,
        bookedAt: true,
        selectedVendorName: true,
        selectedProductName: true,
        totalActualWeightKg: true,
        quotedTotal: true,
        currency: true,
        internalNotes: true,
        org: {
          select: { name: true, slug: true },
        },
        client: {
          select: { companyName: true },
        },
        pickupAddress: {
          select: { city: true, country: true },
        },
        deliveryAddress: {
          select: { city: true, country: true },
        },
        _count: {
          select: { packages: true, documents: true },
        },
      },
    }),
    prisma.shipment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countMap = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  ) as Record<string, number>;

  return { shipments, countMap };
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

export const STATUS_CONFIG: Record<
  ShipmentStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className: "bg-secondary text-secondary-foreground border-border",
  },
  PENDING_PAYMENT: {
    label: "Pending Payment",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
  },
  BOOKED: {
    label: "Booked",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  PROCESSING: {
    label: "Processing",
    className:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800",
  },
  DOCUMENTS_PENDING: {
    label: "Docs Pending",
    className:
      "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800",
  },
  IN_TRANSIT: {
    label: "In Transit",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800",
  },
  CUSTOMS_HOLD: {
    label: "Customs Hold",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    className:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800",
  },
  DELIVERED: {
    label: "Delivered",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-secondary text-muted-foreground border-border",
  },
  ON_HOLD: {
    label: "On Hold",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
  },
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDate(d: Date) {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMoney(amount: unknown, currency: string) {
  if (amount == null) return "—";
  const n =
    typeof amount === "object" && amount !== null && "toNumber" in amount
      ? (amount as { toNumber(): number }).toNumber()
      : Number(amount);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatWeight(kg: unknown) {
  if (kg == null) return "—";
  const n =
    typeof kg === "object" && kg !== null && "toNumber" in kg
      ? (kg as { toNumber(): number }).toNumber()
      : Number(kg);
  return isNaN(n) ? "—" : `${n.toFixed(2)} kg`;
}

// ---------------------------------------------------------------------------
// Summary stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {label}
            </p>
            <p className="mt-1.5 text-2xl font-bold text-foreground tabular-nums">
              {value}
            </p>
            {sub && (
              <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
            )}
          </div>
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-6 mb-4">
        <PackageX className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {filtered ? "No shipments match this filter" : "No shipments yet"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {filtered
          ? "Try a different status filter."
          : "Tenant bookings will appear here once submitted."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABLE_HEADERS = [
  { label: "Shipment", width: "w-48" },
  { label: "Org / Client", width: "w-44" },
  { label: "Route", width: "" },
  { label: "Carrier", width: "w-36" },
  { label: "Pkgs", width: "w-16" },
  { label: "Weight", width: "w-24" },
  { label: "Value", width: "w-28" },
  { label: "Status", width: "w-36" },
  { label: "Booked", width: "w-32" },
  { label: "", width: "w-12" },
];

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All Statuses" },
  { value: "BOOKED", label: "Booked" },
  { value: "PROCESSING", label: "Processing" },
  { value: "DOCUMENTS_PENDING", label: "Docs Pending" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "CUSTOMS_HOLD", label: "Customs Hold" },
  { value: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "PENDING_PAYMENT", label: "Pending Payment" },
  { value: "DRAFT", label: "Draft" },
];

export default async function ArenaBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status: statusFilter, q: query } = await searchParams;

  const { shipments: allShipments, countMap } = await getShipments(
    statusFilter
  );

  // client-side search (simple — for server-side add DB where clause)
  const shipments = query
    ? allShipments.filter(
        (s) =>
          s.shipmentNumber.toLowerCase().includes(query.toLowerCase()) ||
          s.org.name.toLowerCase().includes(query.toLowerCase()) ||
          s.client?.companyName?.toLowerCase().includes(query.toLowerCase()) ||
          s.pickupAddress.city?.toLowerCase().includes(query.toLowerCase()) ||
          s.deliveryAddress.city?.toLowerCase().includes(query.toLowerCase())
      )
    : allShipments;

  const totalBooked = countMap["BOOKED"] ?? 0;
  const totalProcessing = countMap["PROCESSING"] ?? 0;
  const totalInTransit = countMap["IN_TRANSIT"] ?? 0;
  const totalDelivered = countMap["DELIVERED"] ?? 0;
  const needsAttention =
    (countMap["DOCUMENTS_PENDING"] ?? 0) + (countMap["CUSTOMS_HOLD"] ?? 0) + (countMap["ON_HOLD"] ?? 0);

  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Bookings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All shipments submitted by tenants, across every organisation.
          </p>
        </div>
        <Badge variant="outline" className="mt-1 font-mono">
          {allShipments.length} total
        </Badge>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Awaiting ops"
          value={totalBooked}
          icon={Clock}
          sub="Newly booked"
        />
        <StatCard
          label="Processing"
          value={totalProcessing}
          icon={TrendingUp}
        />
        <StatCard
          label="In transit"
          value={totalInTransit}
          icon={Package}
        />
        <StatCard
          label="Needs attention"
          value={needsAttention}
          icon={AlertCircle}
          sub="Hold / docs / customs"
        />
      </div>

      {/* ── Table card ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">All Shipments</CardTitle>
              <CardDescription className="ml-1">
                Sorted by most recent first
              </CardDescription>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <form method="GET" className="flex items-center gap-2">
                <Input
                  name="q"
                  defaultValue={query ?? ""}
                  placeholder="Search by number, org, city…"
                  className="h-8 w-56 text-sm"
                />
                {statusFilter && (
                  <input type="hidden" name="status" value={statusFilter} />
                )}
                <Button type="submit" variant="secondary" size="sm">
                  Search
                </Button>
              </form>

              <form method="GET">
                {query && <input type="hidden" name="q" value={query} />}
                <Select
                  name="status"
                  defaultValue={statusFilter ?? "ALL"}
                  onValueChange={undefined}
                >
                  <SelectTrigger className="h-8 w-44 text-sm">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                        {countMap[opt.value] !== undefined && (
                          <span className="ml-1.5 text-muted-foreground">
                            ({countMap[opt.value]})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button type="submit" className="sr-only">
                  Apply
                </button>
              </form>
            </div>
          </div>
        </CardHeader>

        <Separator className="mt-4" />

        <CardContent className="p-0">
          {shipments.length === 0 ? (
            <EmptyState filtered={!!(statusFilter && statusFilter !== "ALL") || !!query} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {TABLE_HEADERS.map((h) => (
                      <th
                        key={h.label}
                        className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${h.width}`}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {shipments.map((s, i) => {
                    const cfg = STATUS_CONFIG[s.status] ?? {
                      label: s.status,
                      className: "bg-secondary text-secondary-foreground border-border",
                    };

                    const origin = [s.pickupAddress.city, s.pickupAddress.country]
                      .filter(Boolean)
                      .join(", ");
                    const dest = [
                      s.deliveryAddress.city,
                      s.deliveryAddress.country,
                    ]
                      .filter(Boolean)
                      .join(", ");

                    return (
                      <tr
                        key={s.id}
                        className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
                          i % 2 !== 0 ? "bg-muted/10" : ""
                        }`}
                      >
                        {/* Shipment no. */}
                        <td className="px-4 py-3">
                          <Link href={`/arena-dashboard/bookings/${s.id}`}>
                            <p className="font-mono text-xs font-semibold text-foreground hover:underline">
                              {s.shipmentNumber}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {formatDate(s.createdAt)}
                            </p>
                          </Link>
                        </td>

                        {/* Org / client */}
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-foreground">
                            {s.org.name}
                          </p>
                          {s.client && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              for {s.client.companyName}
                            </p>
                          )}
                        </td>

                        {/* Route */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-foreground font-medium">
                              {origin || "—"}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {dest || "—"}
                            </span>
                          </div>
                        </td>

                        {/* Carrier */}
                        <td className="px-4 py-3">
                          <p className="text-xs text-foreground">
                            {s.selectedVendorName ?? "—"}
                          </p>
                          {s.selectedProductName && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground truncate max-w-[130px]">
                              {s.selectedProductName}
                            </p>
                          )}
                        </td>

                        {/* Pkgs */}
                        <td className="px-4 py-3 text-xs text-center text-foreground tabular-nums">
                          {s._count.packages}
                        </td>

                        {/* Weight */}
                        <td className="px-4 py-3 text-xs text-foreground tabular-nums">
                          {formatWeight(s.totalActualWeightKg)}
                        </td>

                        {/* Value */}
                        <td className="px-4 py-3 text-xs text-foreground tabular-nums">
                          {s.quotedTotal
                            ? formatMoney(s.quotedTotal, s.currency)
                            : "—"}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={`text-[11px] font-medium ${cfg.className}`}
                          >
                            {cfg.label}
                          </Badge>
                        </td>

                        {/* Booked at */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {s.bookedAt ? (
                            <>
                              <p>{formatDate(s.bookedAt)}</p>
                              <p className="text-[10px]">{formatTime(s.bookedAt)}</p>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3">
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                          >
                            <Link href={`/arena-dashboard/bookings/${s.id}`}>
                              View
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}