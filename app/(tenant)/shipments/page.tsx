import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { redirect } from "next/navigation";
import { ShipmentStatus } from "@/generated/prisma";

import { Package, ArrowRight, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Data fetch — server-side, org-scoped
// ---------------------------------------------------------------------------

async function getShipments() {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/sign-in");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) redirect("/sign-in");

  const shipments = await prisma.shipment.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      shipmentNumber: true,
      status: true,
      createdAt: true,
      selectedVendorName: true,
      totalActualWeightKg: true,
      quotedTotal: true,
      currency: true,
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
        select: { packages: true },
      },
    },
  });

  return { shipments, orgId: org.id };
}

// ---------------------------------------------------------------------------
// Status config — label + Tailwind badge classes for every ShipmentStatus
// ---------------------------------------------------------------------------

type StatusConfig = { label: string; className: string };

const STATUS_CONFIG: Record<ShipmentStatus, StatusConfig> = {
  DRAFT: {
    label: "Draft",
    className: "bg-slate-50   text-slate-500   border-slate-200",
  },
  PENDING_PAYMENT: {
    label: "Pending Payment",
    className: "bg-amber-50   text-amber-700   border-amber-200",
  },
  BOOKED: {
    label: "Booked",
    className: "bg-blue-50    text-blue-700    border-blue-200",
  },
  PROCESSING: {
    label: "Processing",
    className: "bg-indigo-50  text-indigo-700  border-indigo-200",
  },
  DOCUMENTS_PENDING: {
    label: "Docs Pending",
    className: "bg-orange-50  text-orange-700  border-orange-200",
  },
  IN_TRANSIT: {
    label: "In Transit",
    className: "bg-sky-50     text-sky-700     border-sky-200",
  },
  CUSTOMS_HOLD: {
    label: "Customs Hold",
    className: "bg-red-50     text-red-700     border-red-200",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    className: "bg-violet-50  text-violet-700  border-violet-200",
  },
  DELIVERED: {
    label: "Delivered",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-slate-50   text-slate-400   border-slate-200",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-yellow-50  text-yellow-700  border-yellow-200",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatWeight(kg: unknown): string {
  if (kg == null) return "—";
  const n =
    typeof kg === "object" && "toNumber" in (kg as object)
      ? (kg as { toNumber(): number }).toNumber()
      : Number(kg);
  return isNaN(n) ? "—" : `${n.toFixed(2)} kg`;
}

function formatMoney(amount: unknown, currency: string): string {
  if (amount == null) return "—";
  const n =
    typeof amount === "object" && "toNumber" in (amount as object)
      ? (amount as { toNumber(): number }).toNumber()
      : Number(amount);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-full border-2 border-dashed border-muted p-6 mb-4">
        <PackageX className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-foreground">No shipments yet</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Shipments you book will appear here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table headers
// ---------------------------------------------------------------------------

const HEADERS = [
  "Shipment No.",
  "Route",
  "Carrier",
  "Packages",
  "Weight",
  "Value",
  "Status",
  "Booked On",
];

// ---------------------------------------------------------------------------
// Page (RSC)
// ---------------------------------------------------------------------------

export default async function ShipmentsPage() {
  const { shipments } = await getShipments();

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Shipments
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All shipments booked under your organisation.
          </p>
        </div>
        <Badge variant="secondary" className="mt-1">
          {shipments.length} total
        </Badge>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">All Shipments</CardTitle>
          </div>
          <CardDescription>Sorted by most recent first</CardDescription>
        </CardHeader>
        <Separator />

        <CardContent className="p-0">
          {shipments.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {HEADERS.map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {shipments.map((s, i) => {
                    const statusCfg = STATUS_CONFIG[s.status] ?? {
                      label: s.status,
                      className: "bg-slate-50 text-slate-500 border-slate-200",
                    };

                    const originCity = [
                      s.pickupAddress.city,
                      s.pickupAddress.country,
                    ]
                      .filter(Boolean)
                      .join(", ");

                    const destCity = [
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
                        {/* Shipment number */}
                        <td className="px-4 py-3">
                          <Link href={`/shipments/${s.id}`} className="block">
                            <div className="space-y-0.5">
                              <p className="font-mono text-xs font-medium text-foreground">
                                {s.shipmentNumber}
                              </p>

                              {s.client && (
                                <p className="text-[10px] text-muted-foreground">
                                  {s.client.companyName}
                                </p>
                              )}
                            </div>
                          </Link>
                        </td>

                        {/* Route */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-foreground">
                              {originCity || "—"}
                            </span>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              {destCity || "—"}
                            </span>
                          </div>
                        </td>

                        {/* Carrier */}
                        <td className="px-4 py-3 text-xs text-foreground">
                          {s.selectedVendorName ?? "—"}
                        </td>

                        {/* Packages */}
                        <td className="px-4 py-3 text-xs text-foreground">
                          {s._count.packages}{" "}
                          <span className="text-muted-foreground">
                            pkg{s._count.packages !== 1 ? "s" : ""}
                          </span>
                        </td>

                        {/* Weight */}
                        <td className="px-4 py-3 text-xs text-foreground">
                          {formatWeight(s.totalActualWeightKg)}
                        </td>

                        {/* Value */}
                        <td className="px-4 py-3 text-xs text-foreground">
                          {s.quotedTotal
                            ? formatMoney(s.quotedTotal, s.currency)
                            : "—"}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${statusCfg.className}`}
                          >
                            {statusCfg.label}
                          </Badge>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(s.createdAt)}
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
