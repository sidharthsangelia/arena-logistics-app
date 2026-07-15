// import { auth } from "@clerk/nextjs/server";
// import { prisma } from "@/utils/db";
// import { redirect } from "next/navigation";
// import { Package, ArrowRight, PackageX } from "lucide-react";
// import { Badge } from "@/components/ui/badge";
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import { Separator } from "@/components/ui/separator";
// import Link from "next/link";
// import { STATUS_CONFIG } from "@/utils/statusConfigColors";
// import { formatDate, formatMoney, formatWeight } from "@/utils/format";

// // ---------------------------------------------------------------------------
// // Data fetch — server-side, org-scoped
// // ---------------------------------------------------------------------------

// async function getShipments() {
//   const { orgId: clerkOrgId } = await auth();
//   if (!clerkOrgId) redirect("/sign-in");

//   const org = await prisma.org.findUnique({
//     where: { clerkOrgId },
//     select: { id: true },
//   });
//   if (!org) redirect("/sign-in");

//   const shipments = await prisma.shipment.findMany({
//     where: { orgId: org.id },
//     orderBy: { createdAt: "desc" },
//     take: 100,
//     select: {
//       id: true,
//       shipmentNumber: true,
//       status: true,
//       createdAt: true,
//       selectedVendorName: true,
//       totalActualWeightKg: true,
//       quotedTotal: true,
//       currency: true,
//       client: {
//         select: { companyName: true },
//       },
//       pickupAddress: {
//         select: { city: true, country: true },
//       },
//       deliveryAddress: {
//         select: { city: true, country: true },
//       },
//       _count: {
//         select: { packages: true },
//       },
//     },
//   });

//   return { shipments, orgId: org.id };
// }

// // ---------------------------------------------------------------------------
// // Empty state
// // ---------------------------------------------------------------------------

// function EmptyState() {
//   return (
//     <div className="flex flex-col items-center justify-center py-20 text-center">
//       <div className="rounded-full border-2 border-dashed border-muted p-6 mb-4">
//         <PackageX className="h-8 w-8 text-muted-foreground/50" />
//       </div>
//       <p className="text-sm font-medium text-foreground">No shipments yet</p>
//       <p className="mt-1 text-xs text-muted-foreground">
//         Shipments you book will appear here.
//       </p>
//     </div>
//   );
// }

// // ---------------------------------------------------------------------------
// // Table headers
// // ---------------------------------------------------------------------------

// const HEADERS = [
//   "Shipment No.",
//   "Route",
//   "Carrier",
//   "Packages",
//   "Weight",
//   "Value",
//   "Status",
//   "Booked On",
// ];

// // ---------------------------------------------------------------------------
// // Page (RSC)
// // ---------------------------------------------------------------------------

// export default async function ShipmentsPage() {
//   const { shipments } = await getShipments();

//   return (
//     <div className="mx-auto max-w-7xl px-6 py-8">
//       {/* Page header */}
//       <div className="mb-8 flex items-start justify-between">
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight text-foreground">
//             Shipments
//           </h1>
//           <p className="mt-1 text-sm text-muted-foreground">
//             All shipments booked under your organisation.
//           </p>
//         </div>
//         <Badge variant="secondary" className="mt-1">
//           {shipments.length} total
//         </Badge>
//       </div>

//       <Card className="shadow-sm">
//         <CardHeader className="pb-3">
//           <div className="flex items-center gap-2">
//             <Package className="h-4 w-4 text-muted-foreground" />
//             <CardTitle className="text-base">All Shipments</CardTitle>
//           </div>
//           <CardDescription>Sorted by most recent first</CardDescription>
//         </CardHeader>
//         <Separator />

//         <CardContent className="p-0">
//           {shipments.length === 0 ? (
//             <EmptyState />
//           ) : (
//             <div className="overflow-x-auto">
//               <table className="w-full text-sm">
//                 <thead>
//                   <tr className="border-b bg-muted/40">
//                     {HEADERS.map((h) => (
//                       <th
//                         key={h}
//                         className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
//                       >
//                         {h}
//                       </th>
//                     ))}
//                   </tr>
//                 </thead>

//                 <tbody>
//                   {shipments.map((s, i) => {
//                     const statusCfg = STATUS_CONFIG[s.status] ?? {
//                       label: s.status,
//                       className: "bg-slate-50 text-slate-500 border-slate-200",
//                     };

//                     const originCity = [
//                       s.pickupAddress.city,
//                       s.pickupAddress.country,
//                     ]
//                       .filter(Boolean)
//                       .join(", ");

//                     const destCity = [
//                       s.deliveryAddress.city,
//                       s.deliveryAddress.country,
//                     ]
//                       .filter(Boolean)
//                       .join(", ");

//                     return (
//                       <tr
//                         key={s.id}
//                         className={`border-b last:border-0 transition-colors hover:bg-muted/30 ${
//                           i % 2 !== 0 ? "bg-muted/10" : ""
//                         }`}
//                       >
//                         {/* Shipment number */}
//                         <td className="px-4 py-3">
//                           <Link href={`/shipments/${s.id}`} className="block">
//                             <div className="space-y-0.5">
//                               <p className="font-mono text-xs font-medium text-foreground">
//                                 {s.shipmentNumber}
//                               </p>

//                               {s.client && (
//                                 <p className="text-[10px] text-muted-foreground">
//                                   {s.client.companyName}
//                                 </p>
//                               )}
//                             </div>
//                           </Link>
//                         </td>

//                         {/* Route */}
//                         <td className="px-4 py-3">
//                           <div className="flex items-center gap-1.5 text-xs">
//                             <span className="text-foreground">
//                               {originCity || "—"}
//                             </span>
//                             <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
//                             <span className="text-muted-foreground">
//                               {destCity || "—"}
//                             </span>
//                           </div>
//                         </td>

//                         {/* Carrier */}
//                         <td className="px-4 py-3 text-xs text-foreground">
//                           {s.selectedVendorName ?? "—"}
//                         </td>

//                         {/* Packages */}
//                         <td className="px-4 py-3 text-xs text-foreground">
//                           {s._count.packages}{" "}
//                           <span className="text-muted-foreground">
//                             pkg{s._count.packages !== 1 ? "s" : ""}
//                           </span>
//                         </td>

//                         {/* Weight */}
//                         <td className="px-4 py-3 text-xs text-foreground">
//                           {formatWeight(s.totalActualWeightKg)}
//                         </td>

//                         {/* Value */}
//                         <td className="px-4 py-3 text-xs text-foreground">
//                           {s.quotedTotal
//                             ? formatMoney(s.quotedTotal, s.currency)
//                             : "—"}
//                         </td>

//                         {/* Status */}
//                         <td className="px-4 py-3">
//                           <Badge
//                             variant="outline"
//                             className={`text-xs font-medium ${statusCfg.className}`}
//                           >
//                             {statusCfg.label}
//                           </Badge>
//                         </td>

//                         {/* Date */}
//                         <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
//                           {formatDate(s.createdAt)}
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
























import {
  AlertCircle,
  Clock,
  Package,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShipmentStatus } from "@/generated/prisma";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SORTABLE_FIELDS,
  getShipmentStatusCounts,
  getShipmentsPage,
  type ShipmentSortField,
} from "@/queries/shipments";
 
import StatCard from "@/components/StatCard";
import { ShipmentsTable } from "@/components/shipments/ShipmentsTable";

 

 

// ---------------------------------------------------------------------------
// Search params → typed, validated query params. Anything malformed silently
// falls back to a sane default rather than throwing.
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;

function parseSearchParams(sp: RawSearchParams) {
  const pageRaw = Number(sp.page);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(sp.pageSize);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE;

  const sortField: ShipmentSortField = SORTABLE_FIELDS.includes(sp.sort as ShipmentSortField)
    ? (sp.sort as ShipmentSortField)
    : "createdAt";

  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const validStatuses = new Set(Object.values(ShipmentStatus));
  const statuses =
    typeof sp.status === "string" && sp.status.length > 0
      ? (sp.status.split(",").filter((s) => validStatuses.has(s as ShipmentStatus)) as ShipmentStatus[])
      : undefined;

  const query = typeof sp.q === "string" ? sp.q : undefined;

  return { page, pageSize, sortField, sortDir, statuses, query };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ClientAllShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

const [{ rows, totalRows, pageCount }, statusCounts] = await Promise.all([
  getShipmentsPage({
    ...params,
    client: true,
  }),
  getShipmentStatusCounts(true),
]);

  const totalAll = Object.values(statusCounts).reduce((sum, n) => sum + (n ?? 0), 0);
  const totalBooked = statusCounts.BOOKED ?? 0;
  const totalProcessing = statusCounts.PROCESSING ?? 0;
  const totalInTransit = statusCounts.IN_TRANSIT ?? 0;
  const needsAttention =
    (statusCounts.DOCUMENTS_PENDING ?? 0) +
    (statusCounts.CUSTOMS_HOLD ?? 0) +
    (statusCounts.ON_HOLD ?? 0);

  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All shipments submitted by clients, across every business associate.
          </p>
        </div>
        <Badge variant="outline" className="mt-1 font-mono">
          {totalAll} total
        </Badge>
      </div>

      {/* ── Summary stats (unfiltered — always the full picture) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Awaiting ops" value={totalBooked} icon={Clock} sub="Newly booked" />
        <StatCard label="Processing" value={totalProcessing} icon={TrendingUp} />
        <StatCard label="In transit" value={totalInTransit} icon={Package} />
        <StatCard
          label="Needs attention"
          value={needsAttention}
          icon={AlertCircle}
          sub="Hold / docs / customs"
        />
      </div>

      {/* ── Table ── */}
      <ShipmentsTable
        data={rows}
        page={params.page}
        pageSize={params.pageSize}
        totalRows={totalRows}
        pageCount={pageCount}
        sortField={params.sortField}
        sortDir={params.sortDir}
        statuses={params.statuses ?? []}
        query={params.query ?? ""}
        statusCounts={statusCounts}
      />
    </div>
  );
}
