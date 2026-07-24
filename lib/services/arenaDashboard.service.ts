/**
 * lib/services/arenaDashboard.service.ts
 *
 * Aggregates the Arena ops overview stats (15 parallel queries across
 * Shipment/Org/RateVersion/BaApplication/Wallet/KycDocument) behind a short
 * TTL cache.
 *
 * This is a platform-wide, ops-only aggregate — it was previously
 * re-computed from scratch on every single dashboard load with no caching
 * at all. A 30s TTL is imperceptible for an "Overview" page (nobody needs
 * per-second precision on MTD revenue or top-organisation rankings) but
 * collapses N concurrent staff refreshes into a single DB round trip.
 *
 * The returned shape is deliberately flattened to plain strings/numbers —
 * unstable_cache serializes its return value, which turns Prisma Decimal
 * and Date instances into plain strings on a cache hit. Doing the
 * conversion explicitly here (once, on a miss) avoids relying on that
 * implicit behavior and keeps the page component free of Decimal/Date
 * handling.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "@/utils/db";
import type { ShipmentStatus, OrgPlan } from "@/generated/prisma";
import { resolveLowBalanceThreshold } from "@/utils/wallet/config";

const ARENA_DASHBOARD_TTL_SECONDS = 30;

export interface ArenaDashboardStats {
  totalShipments: number;
  activeShipmentsCount: number;
  deliveredAllTime: number;
  successRate: number;
  deliveredThisMonth: number;
  avgTransitDays: number | null;

  activeOrgCount: number;
  totalOrgsCount: number;

  revenueByCurrency: [string, number][];
  revenueEligibleCount: number;

  pendingBaCount: number;
  pendingBaNames: string[];

  stuckShipmentsCount: number;
  unverifiedKycCount: number;
  lowWalletOrgsCount: number;

  stagedRateVersionsCount: number;
  stagedRateVersionsLabel: string;
  activeRateVersions: { id: string; vendor: string; effectiveFromIso: string }[];

  needsReviewCount: number;

  recentShipments: {
    id: string;
    shipmentNumber: string;
    status: ShipmentStatus;
    quotedTotal: number | null;
    currency: string;
    selectedVendorName: string | null;
    orgName: string;
    clientName: string | null;
    pickupCity: string | null;
    deliveryCity: string | null;
  }[];

  topOrgs: {
    id: string;
    name: string;
    plan: OrgPlan;
    markupPercent: number;
    isBusinessAssociate: boolean;
    bookings30d: number;
  }[];
}

async function computeArenaDashboardStats(): Promise<ArenaDashboardStats> {
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
    recentShipmentsRaw,
    topOrgGroups,
    activeRateVersionsRaw,
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
    // Must match the "Running low" filter on /arena-dashboard/wallets exactly, or
    // the overview promises a count the wallets screen then contradicts. Two
    // rules to keep in step: the shared threshold, and skipping orgs that book
    // without paying up front, for whom a low balance is not a problem.
    prisma.wallet.count({
      where: {
        balance: { lte: resolveLowBalanceThreshold() },
        org: { deletedAt: null, skipPayment: false },
      },
    }),
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
    statusGroups.map((g) => [g.status, g._count._all]),
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
      return {
        id: org.id,
        name: org.companyName || org.name,
        plan: org.plan,
        markupPercent: Number(org.markupPercent),
        isBusinessAssociate: org.isBusinessAssociate,
        bookings30d: g._count.orgId,
      };
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
  const revenueTotals = new Map<string, number>();
  for (const s of revenueEligibleShipments) {
    if (s.quotedTotal == null || s.markupPercentApplied == null) continue;
    const quoted = Number(s.quotedTotal);
    const markup = Number(s.markupPercentApplied);
    if (!Number.isFinite(quoted) || !Number.isFinite(markup)) continue;
    const vendorCost = quoted / (1 + markup / 100);
    const revenue = quoted - vendorCost;
    revenueTotals.set(s.currency, (revenueTotals.get(s.currency) ?? 0) + revenue);
  }

  const needsReviewCount =
    pendingBaCount + stuckShipmentsCount + unverifiedKycCount + stagedRateVersions.length;

  return {
    totalShipments,
    activeShipmentsCount,
    deliveredAllTime,
    successRate,
    deliveredThisMonth,
    avgTransitDays,

    activeOrgCount,
    totalOrgsCount,

    revenueByCurrency: Array.from(revenueTotals.entries()),
    revenueEligibleCount: revenueEligibleShipments.length,

    pendingBaCount,
    pendingBaNames: pendingBaApplications
      .slice(0, 3)
      .map((a) => a.org.companyName || a.org.name),

    stuckShipmentsCount,
    unverifiedKycCount,
    lowWalletOrgsCount,

    stagedRateVersionsCount: stagedRateVersions.length,
    stagedRateVersionsLabel: stagedRateVersions
      .map((v) => `${v.vendor} v${v.id.slice(-4)}`)
      .join(", "),
    activeRateVersions: activeRateVersionsRaw.map((rv) => ({
      id: rv.id,
      vendor: rv.vendor,
      effectiveFromIso: rv.effectiveFrom.toISOString(),
    })),

    needsReviewCount,

    recentShipments: recentShipmentsRaw.map((s) => ({
      id: s.id,
      shipmentNumber: s.shipmentNumber,
      status: s.status,
      quotedTotal: s.quotedTotal != null ? Number(s.quotedTotal) : null,
      currency: s.currency,
      selectedVendorName: s.selectedVendorName,
      orgName: s.org.companyName || s.org.name,
      clientName: s.client?.companyName ?? null,
      pickupCity: s.pickupAddress.city,
      deliveryCity: s.deliveryAddress.city,
    })),

    topOrgs,
  };
}

/**
 * Cached entry point — call this from the Arena dashboard page.
 * Not per-org (Arena staff see the whole platform), so a single cache key
 * covers everyone; a 30s TTL is the only invalidation mechanism since this
 * rolls up ~10 different tables and tagging every write path that touches
 * any of them would add more risk than the cache saves.
 */
export const getArenaDashboardStats = unstable_cache(
  computeArenaDashboardStats,
  ["arena-dashboard-stats"],
  { revalidate: ARENA_DASHBOARD_TTL_SECONDS },
);
