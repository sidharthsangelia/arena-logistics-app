import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

 
import type { ShipmentStatus, OrgPlan } from "@/generated/prisma";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Building2,
  Upload,
  ClipboardCheck,
  ArrowRight,
  Info,
  AlertTriangle,
  ShieldCheck,
  FileWarning,
  PauseCircle,
  BadgeIndianRupee,
  Inbox,
} from "lucide-react";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { prisma } from "@/utils/db";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMoney(amount: number | string, currency = "INR") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(date: Date) {
  return dateFormatter.format(date);
}

// Estimates platform markup revenue: quotedTotal already has markup baked in,
// so back out the vendor cost using the markup % that was actually applied.
function estimateRevenueByCurrency(
  shipments: { quotedTotal: unknown; markupPercentApplied: unknown; currency: string }[]
) {
  const totals = new Map<string, number>();
  for (const s of shipments) {
    if (s.quotedTotal == null || s.markupPercentApplied == null) continue;
    const quoted = Number(s.quotedTotal as any);
    const markup = Number(s.markupPercentApplied as any);
    if (!Number.isFinite(quoted) || !Number.isFinite(markup)) continue;
    const vendorCost = quoted / (1 + markup / 100);
    const revenue = quoted - vendorCost;
    totals.set(s.currency, (totals.get(s.currency) ?? 0) + revenue);
  }
  return totals;
}

const PLAN_VARIANTS: Record<OrgPlan, "default" | "secondary" | "outline"> = {
  ENTERPRISE: "default",
  GROWTH: "secondary",
  STARTER: "outline",
  FREE: "outline",
};

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tooltip,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tooltip?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function QuickAction({
  href,
  label,
  description,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  badge?: number;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-sm transition-shadow cursor-pointer">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md border bg-muted flex items-center justify-center shrink-0">
            <Icon className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{label}</p>
              {!!badge && (
                <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                  {badge}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function ArenaDashboardPage() {
  const { orgId } = await auth();
  if (orgId !== process.env.ARENA_ORG_ID) redirect("/");

  const now = new Date();
  const last30 = new Date(now);
  last30.setDate(last30.getDate() - 30);
  const last90 = new Date(now);
  last90.setDate(last90.getDate() - 90);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    statusGroups,
    totalOrgsCount,
    activeOrgShipments,
    recentShipments,
    topOrgGroups,
    activeRateVersions,
    stagedRateVersions,
    pendingBaApplications,
    pendingBaCount,
    lowWalletOrgsCount,
    stuckShipmentsCount,
    unverifiedKycCount,
    deliveredThisMonth,
    revenueEligibleShipments,
    deliveredEvents,
  ] = await Promise.all([
    prisma.shipment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.org.count({ where: { deletedAt: null } }),
    prisma.shipment.findMany({
      where: { createdAt: { gte: last30 } },
      distinct: ["orgId"],
      select: { orgId: true },
    }),
    prisma.shipment.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        shipmentNumber: true,
        status: true,
        quotedTotal: true,
        currency: true,
        createdAt: true,
        selectedVendorName: true,
        org: { select: { name: true, companyName: true } },
        client: { select: { companyName: true } },
        pickupAddress: { select: { city: true } },
        deliveryAddress: { select: { city: true } },
      },
    }),
    prisma.shipment.groupBy({
      by: ["orgId"],
      where: { createdAt: { gte: last30 } },
      _count: { orgId: true },
      orderBy: { _count: { orgId: "desc" } },
      take: 5,
    }),
    prisma.rateVersion.findMany({
      where: { isActive: true },
      orderBy: { activatedAt: "desc" },
    }),
    prisma.rateVersion.findMany({
      where: { isStaged: true, isActive: false },
      orderBy: { uploadedAt: "desc" },
      take: 5,
    }),
    prisma.baApplication.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5,
      include: { org: { select: { name: true, companyName: true } } },
    }),
    prisma.baApplication.count({ where: { status: "PENDING" } }),
    prisma.wallet.count({ where: { balance: { lt: 5000 } } }),
    prisma.shipment.count({ where: { status: { in: ["CUSTOMS_HOLD", "ON_HOLD"] } } }),
    prisma.kycDocument.count({ where: { verifiedAt: null } }),
    prisma.shipment.count({
      where: { status: "DELIVERED", updatedAt: { gte: startOfMonth } },
    }),
    prisma.shipment.findMany({
      where: {
        createdAt: { gte: startOfMonth },
        status: { notIn: ["DRAFT", "CANCELLED"] },
        quotedTotal: { not: null },
        markupPercentApplied: { not: null },
      },
      select: { quotedTotal: true, markupPercentApplied: true, currency: true },
    }),
    prisma.shipmentStatusEvent.findMany({
      where: { toStatus: "DELIVERED", createdAt: { gte: last90 } },
      select: { createdAt: true, shipment: { select: { bookedAt: true } } },
    }),
  ]);

  // ── Shipment status breakdown ──
  const statusCountMap = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all])
  ) as Partial<Record<ShipmentStatus, number>>;
  const sumStatuses = (statuses: ShipmentStatus[]) =>
    statuses.reduce((total, s) => total + (statusCountMap[s] ?? 0), 0);

  const totalShipments = Object.values(statusCountMap).reduce((a, b) => a + (b ?? 0), 0);
  const activeShipmentsCount = sumStatuses([
    "BOOKED",
    "PROCESSING",
    "DOCUMENTS_PENDING",
    "IN_TRANSIT",
    "CUSTOMS_HOLD",
    "OUT_FOR_DELIVERY",
  ]);
  const deliveredAllTime = statusCountMap.DELIVERED ?? 0;
  const successRate = totalShipments > 0 ? (deliveredAllTime / totalShipments) * 100 : 0;

  // ── Orgs ──
  const activeOrgCount = new Set(activeOrgShipments.map((s) => s.orgId)).size;

  // ── Top organisations (last 30 days) ──
  const topOrgIds = topOrgGroups.map((g) => g.orgId);
  const topOrgDetails = topOrgIds.length
    ? await prisma.org.findMany({
        where: { id: { in: topOrgIds } },
        select: {
          id: true,
          name: true,
          companyName: true,
          plan: true,
          markupPercent: true,
          isBusinessAssociate: true,
        },
      })
    : [];
  const topOrgs = topOrgGroups
    .map((g) => {
      const org = topOrgDetails.find((o) => o.id === g.orgId);
      if (!org) return null;
      return { ...org, bookings30d: g._count.orgId };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  // ── Avg transit time (booked → delivered, last 90 days) ──
  const transitDurations = deliveredEvents
    .filter((e) => e.shipment.bookedAt)
    .map((e) => (e.createdAt.getTime() - e.shipment.bookedAt!.getTime()) / 86_400_000);
  const avgTransitDays =
    transitDurations.length > 0
      ? transitDurations.reduce((a, b) => a + b, 0) / transitDurations.length
      : null;

  // ── Estimated MTD revenue ──
  const revenueByCurrency = estimateRevenueByCurrency(revenueEligibleShipments);
  const revenueDisplay =
    revenueByCurrency.size === 0
      ? formatMoney(0)
      : Array.from(revenueByCurrency.entries())
          .map(([currency, amount]) => formatMoney(amount, currency))
          .join(" + ");

  const needsReviewCount =
    pendingBaCount + stuckShipmentsCount + unverifiedKycCount + stagedRateVersions.length;

  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-6">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{todayLabel}</p>
        </div>

        {/* ── Alerts ──────────────────────────────────────────────────── */}
        {(pendingBaCount > 0 || stuckShipmentsCount > 0 || stagedRateVersions.length > 0) && (
          <div className="space-y-3">
            {stuckShipmentsCount > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>
                  {stuckShipmentsCount} shipment{stuckShipmentsCount === 1 ? "" : "s"} on hold
                </AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>Customs holds and manual holds need ops attention.</span>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/arena-dashboard/bookings?status=ON_HOLD">Review</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {pendingBaCount > 0 && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>
                  {pendingBaCount} Business Associate application{pendingBaCount === 1 ? "" : "s"}{" "}
                  awaiting review
                </AlertTitle>
                <AlertDescription>
                  {pendingBaApplications
                    .slice(0, 3)
                    .map((a) => a.org.companyName || a.org.name)
                    .join(", ")}
                  {pendingBaCount > 3 ? ` and ${pendingBaCount - 3} more` : ""}.{" "}
                  <Link
                    href="/arena-dashboard/business-associates"
                    className="underline underline-offset-2"
                  >
                    Review applications
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {stagedRateVersions.length > 0 && (
              <Alert>
                <FileWarning className="h-4 w-4" />
                <AlertTitle>
                  {stagedRateVersions.length} rate card{stagedRateVersions.length === 1 ? "" : "s"}{" "}
                  staged, not yet active
                </AlertTitle>
                <AlertDescription>
                  {stagedRateVersions.map((v) => `${v.vendor} v${v.id.slice(-4)}`).join(", ")}.{" "}
                  <Link href="/arena-dashboard/rate-cards" className="underline underline-offset-2">
                    Review and activate
                  </Link>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            label="Total Shipments"
            value={totalShipments}
            sub={`${activeShipmentsCount} active`}
            icon={Package}
          />
          <StatCard
            label="Delivered (MTD)"
            value={deliveredThisMonth}
            sub={`${successRate.toFixed(1)}% overall success rate`}
            icon={CheckCircle2}
          />
          <StatCard
            label="Avg. Transit Time"
            value={avgTransitDays != null ? `${avgTransitDays.toFixed(1)}d` : "—"}
            sub="Booked → delivered, 90d"
            icon={Clock}
          />
          <StatCard
            label="Active Orgs"
            value={activeOrgCount}
            sub={`of ${totalOrgsCount} total`}
            icon={Building2}
          />
          <StatCard
            label="Est. Revenue (MTD)"
            value={revenueDisplay}
            sub={`From ${revenueEligibleShipments.length} bookings`}
            icon={BadgeIndianRupee}
            tooltip="Estimated markup earned this month, backed out from each shipment's quoted total using the markup % applied at booking."
          />
        </div>

        {/* ── Quick actions ───────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction
            href="/arena-dashboard/rate-cards/upload"
            label="Upload Rates"
            description="Add or stage a new rate card"
            icon={Upload}
          />
          <QuickAction
            href="/arena-dashboard/business-associates"
            label="Review Applications"
            description="Business Associate requests"
            icon={ClipboardCheck}
            badge={pendingBaCount}
          />
          <QuickAction
            href="/arena-dashboard/orgs"
            label="Manage Organisations"
            description="All tenant accounts"
            icon={Building2}
          />
        </div>

        {/* ── Middle row: Recent shipments + Needs review / Rate cards ──── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent shipments across all orgs — 2/3 width */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">Recent Bookings</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Latest shipments across all organisations
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
              {recentShipments.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No bookings yet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Org / Client</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="pr-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentShipments.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer">
                        <TableCell className="pl-6">
                          <p className="text-sm font-medium leading-tight">
                            {s.org.companyName || s.org.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.client?.companyName ?? "Own shipment"}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.pickupAddress.city} → {s.deliveryAddress.city}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.selectedVendorName ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums font-medium">
                          {s.quotedTotal ? formatMoney(s.quotedTotal.toString(), s.currency) : "—"}
                        </TableCell>
                        <TableCell className="pr-6">
                          <ShipmentStatusBadge status={s.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Right column — Needs review + Rate versions */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Needs Review</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {needsReviewCount} item{needsReviewCount === 1 ? "" : "s"} across the platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ReviewRow
                  icon={ShieldCheck}
                  label="BA applications pending"
                  count={pendingBaCount}
                  href="/arena-dashboard/business-associates"
                />
                <Separator />
                <ReviewRow
                  icon={PauseCircle}
                  label="Shipments on hold"
                  count={stuckShipmentsCount}
                  href="/arena-dashboard/bookings?status=ON_HOLD"
                />
                <Separator />
                <ReviewRow
                  icon={FileWarning}
                  label="KYC docs unverified"
                  count={unverifiedKycCount}
                  href="/arena-dashboard/kyc"
                />
                <Separator />
                <ReviewRow
                  icon={Upload}
                  label="Rate cards staged"
                  count={stagedRateVersions.length}
                  href="/arena-dashboard/rate-cards"
                />
                <Separator />
                <ReviewRow
                  icon={AlertTriangle}
                  label="Orgs low on wallet balance"
                  count={lowWalletOrgsCount}
                  href="/arena-dashboard/orgs?filter=low-balance"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Active Rate Cards</CardTitle>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
                    <Link href="/arena-dashboard/rate-cards">Manage</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeRateVersions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active rate cards yet.</p>
                ) : (
                  activeRateVersions.map((rv, i) => (
                    <div key={rv.id}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{rv.vendor}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Effective {formatDate(rv.effectiveFrom)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                        >
                          Active
                        </Badge>
                      </div>
                      {i < activeRateVersions.length - 1 && <Separator className="mt-3" />}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Bottom row: Top organisations ───────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">Top Organisations</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Ranked by bookings in the last 30 days
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
              <Link href="/arena-dashboard/orgs">
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            {topOrgs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No bookings in the last 30 days.</p>
              </div>
            ) : (
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
                  {topOrgs.map((org) => (
                    <TableRow key={org.id} className="cursor-pointer">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-md border flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <span className="text-sm font-medium">
                              {org.companyName || org.name}
                            </span>
                            {org.isBusinessAssociate && (
                              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 h-4">
                                BA
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PLAN_VARIANTS[org.plan]}>{org.plan}</Badge>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{org.bookings30d}</TableCell>
                      <TableCell className="pr-6 text-sm tabular-nums">
                        {Number(org.markupPercent).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helper row for the "Needs Review" card
// ─────────────────────────────────────────────────────────────────────────────

function ReviewRow({
  icon: Icon,
  label,
  count,
  href,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 -mx-1 px-1 py-0.5 rounded hover:bg-muted/60 transition-colors"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm truncate">{label}</span>
      </div>
      <Badge variant={count > 0 ? "secondary" : "outline"} className="tabular-nums shrink-0">
        {count}
      </Badge>
    </Link>
  );
}