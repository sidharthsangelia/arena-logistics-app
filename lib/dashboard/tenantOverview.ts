/**
 * lib/dashboard/tenantOverview.ts
 *
 * The tenant dashboard's reads, one cached fetcher per card.
 *
 * The page used to run these queries inline. Each card was already streamed
 * behind its own Suspense boundary, so nothing blocked the shell — but every
 * single dashboard load still went to Postgres nine times, and the dashboard is
 * the most-revisited route in the app. These caches collapse a reload, a
 * back-navigation, and every concurrent member of the same org into one round
 * trip per card.
 *
 * ─── TTLs ──────────────────────────────────────────────────────────────────
 * Chosen per card by how fast the underlying data actually moves, not uniformly:
 *
 *   alerts           60s  BA application status and document expiry dates move
 *                         on the order of days. A minute is generous.
 *   shipment stats   10s  Tagged, so a booking updates them instantly; the TTL
 *   recent shipments 10s  only covers changes made outside this app (ops moving
 *                         a status straight in the DB).
 *   wallet activity  15s  Tagged with the same per-org wallet tag every balance
 *                         writer already invalidates, so a top-up shows at once.
 *   quotes            15s  A preview of the two newest. Quote mutations
 *                         revalidatePath("/quotes") rather than a tag, so this
 *                         one rides its TTL alone — fine for a summary card.
 *   onboarding        30s  A checklist of one-time setup steps. Ticking an item
 *                         is a deliberate act the user then navigates away from.
 *
 * Nothing here caches a wallet *balance*: that number has its own permanently
 * cached, invalidate-on-write fetcher in lib/wallet/queries.ts, and this module
 * defers to it rather than keeping a second copy on a timer.
 *
 * ─── SERIALISATION ─────────────────────────────────────────────────────────
 * unstable_cache round-trips its return value as JSON, so Prisma Decimal and
 * Date do not survive a cache hit intact. Every fetcher below flattens them to
 * strings explicitly on the miss, so callers never have to know whether they got
 * a hit or a miss. Same convention as lib/services/arenaDashboard.service.ts.
 */

import "server-only";

import { unstable_cache } from "next/cache";

import { prisma } from "@/utils/db";
import type { QuoteStatus, ShipmentStatus, WalletTxnType } from "@/generated/prisma";
import { SHIPMENTS_COUNTS_TAG, SHIPMENTS_LIST_TAG } from "@/queries/shipments";
import { walletBalanceTag } from "@/lib/wallet/queries";

// ---------------------------------------------------------------------------
// Alerts — BA application in review, plus documents expiring within 30 days
// ---------------------------------------------------------------------------

export interface DashboardAlertsDTO {
  pendingBaApplicationAt: string | null;
  expiringDocs: { id: string; label: string }[];
}

export function getDashboardAlerts(orgId: string) {
  return unstable_cache(
    async (): Promise<DashboardAlertsDTO> => {
      const thirtyDaysOut = new Date();
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

      const [latestBaApplication, expiringDocs] = await Promise.all([
        prisma.baApplication.findFirst({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          select: { status: true, createdAt: true },
        }),
        prisma.kycDocument.findMany({
          where: {
            orgId,
            partyType: "ORG",
            expiresAt: { not: null, lte: thirtyDaysOut },
          },
          orderBy: { expiresAt: "asc" },
          take: 3,
          select: { id: true, label: true },
        }),
      ]);

      return {
        pendingBaApplicationAt:
          latestBaApplication?.status === "PENDING"
            ? latestBaApplication.createdAt.toISOString()
            : null,
        expiringDocs,
      };
    },
    [`dashboard-alerts:${orgId}`],
    { revalidate: 60 },
  )();
}

// ---------------------------------------------------------------------------
// Shipment stat cards
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: ShipmentStatus[] = [
  "BOOKED",
  "PROCESSING",
  "IN_TRANSIT",
  "CUSTOMS_HOLD",
  "OUT_FOR_DELIVERY",
];

const NEEDS_ATTENTION_STATUSES: ShipmentStatus[] = [
  "DRAFT",
  "PENDING_PAYMENT",
  "DOCUMENTS_PENDING",
];

export interface ShipmentStatsDTO {
  activeCount: number;
  needsAttentionCount: number;
  deliveredThisMonth: number;
  totalCount: number;
}

export function getShipmentStats(orgId: string) {
  return unstable_cache(
    async (): Promise<ShipmentStatsDTO> => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [statusGroups, deliveredThisMonth] = await Promise.all([
        prisma.shipment.groupBy({
          by: ["status"],
          where: { orgId },
          _count: { _all: true },
        }),
        prisma.shipment.count({
          where: { orgId, status: "DELIVERED", updatedAt: { gte: startOfMonth } },
        }),
      ]);

      const countByStatus = Object.fromEntries(
        statusGroups.map((g) => [g.status, g._count._all]),
      ) as Partial<Record<ShipmentStatus, number>>;

      const sum = (statuses: ShipmentStatus[]) =>
        statuses.reduce((total, s) => total + (countByStatus[s] ?? 0), 0);

      return {
        activeCount: sum(ACTIVE_STATUSES),
        needsAttentionCount: sum(NEEDS_ATTENTION_STATUSES),
        deliveredThisMonth,
        totalCount: Object.values(countByStatus).reduce(
          (a, b) => a + (b ?? 0),
          0,
        ),
      };
    },
    [`dashboard-shipment-stats:${orgId}`],
    { revalidate: 10, tags: [SHIPMENTS_COUNTS_TAG] },
  )();
}

// ---------------------------------------------------------------------------
// Recent shipments table
// ---------------------------------------------------------------------------

export interface RecentShipmentDTO {
  id: string;
  shipmentNumber: string;
  status: ShipmentStatus;
  /** Decimal → string. Null when ops has not priced the shipment yet. */
  quotedTotal: string | null;
  currency: string;
  createdAt: string;
  hawbNumber: string | null;
  carrierAirline: string | null;
  clientName: string | null;
  fromCity: string;
  toCity: string;
}

export function getRecentShipments(orgId: string) {
  return unstable_cache(
    async (): Promise<RecentShipmentDTO[]> => {
      const rows = await prisma.shipment.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          shipmentNumber: true,
          status: true,
          quotedTotal: true,
          currency: true,
          createdAt: true,
          hawbNumber: true,
          carrierAirline: true,
          client: { select: { companyName: true } },
          pickupAddress: { select: { city: true } },
          deliveryAddress: { select: { city: true } },
        },
      });

      return rows.map((s) => ({
        id: s.id,
        shipmentNumber: s.shipmentNumber,
        status: s.status,
        quotedTotal: s.quotedTotal?.toString() ?? null,
        currency: s.currency,
        createdAt: s.createdAt.toISOString(),
        hawbNumber: s.hawbNumber,
        carrierAirline: s.carrierAirline,
        clientName: s.client?.companyName ?? null,
        fromCity: s.pickupAddress.city,
        toCity: s.deliveryAddress.city,
      }));
    },
    [`dashboard-recent-shipments:${orgId}`],
    { revalidate: 10, tags: [SHIPMENTS_LIST_TAG] },
  )();
}

// ---------------------------------------------------------------------------
// Wallet activity
//
// Keyed and tagged by orgId rather than walletId so it shares the invalidation
// every balance writer already performs (see the CONTRACT note in
// lib/wallet/queries.ts). A top-up that refreshes the header chip refreshes this
// list in the same breath.
// ---------------------------------------------------------------------------

export interface WalletActivityDTO {
  id: string;
  type: WalletTxnType;
  /** Decimal → string. */
  amount: string;
  currency: string;
  createdAt: string;
}

export function getRecentWalletActivity(orgId: string) {
  return unstable_cache(
    async (): Promise<WalletActivityDTO[]> => {
      const wallet = await prisma.wallet.findUnique({
        where: { orgId },
        select: { id: true },
      });
      if (!wallet) return [];

      const rows = await prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          createdAt: true,
        },
      });

      return rows.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount.toString(),
        currency: t.currency,
        createdAt: t.createdAt.toISOString(),
      }));
    },
    [`dashboard-wallet-activity:${orgId}`],
    { revalidate: 15, tags: [walletBalanceTag(orgId)] },
  )();
}

// ---------------------------------------------------------------------------
// Quotes card (Business Associates only)
// ---------------------------------------------------------------------------

export interface RecentQuoteDTO {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  /** Decimal → string. */
  quotedTotal: string;
  currency: string;
  validUntil: string;
  pdfUrl: string | null;
  clientName: string | null;
}

export interface QuotesSummaryDTO {
  openCount: number;
  recent: RecentQuoteDTO[];
}

export function getQuotesSummary(orgId: string) {
  return unstable_cache(
    async (): Promise<QuotesSummaryDTO> => {
      const [quoteGroups, recentQuotes] = await Promise.all([
        prisma.quote.groupBy({
          by: ["status"],
          where: { orgId },
          _count: { _all: true },
        }),
        prisma.quote.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            quoteNumber: true,
            status: true,
            quotedTotal: true,
            currency: true,
            validUntil: true,
            pdfUrl: true,
            client: { select: { companyName: true } },
          },
        }),
      ]);

      const countByStatus = Object.fromEntries(
        quoteGroups.map((g) => [g.status, g._count._all]),
      ) as Partial<Record<QuoteStatus, number>>;

      return {
        openCount: (countByStatus.DRAFT ?? 0) + (countByStatus.SENT ?? 0),
        recent: recentQuotes.map((q) => ({
          id: q.id,
          quoteNumber: q.quoteNumber,
          status: q.status,
          quotedTotal: q.quotedTotal.toString(),
          currency: q.currency,
          validUntil: q.validUntil.toISOString(),
          pdfUrl: q.pdfUrl,
          clientName: q.client?.companyName ?? null,
        })),
      };
    },
    [`dashboard-quotes:${orgId}`],
    { revalidate: 15 },
  )();
}

// ---------------------------------------------------------------------------
// Onboarding checklist counts
//
// The org's own fields (address, skipPayment) are not cached here — they come
// from the org row the caller already holds. Only the counts, which are the part
// that costs queries.
// ---------------------------------------------------------------------------

export interface OnboardingCountsDTO {
  savedAddressCount: number;
  clientCount: number;
  /**
   * Decimal → string. Null when the org has no wallet row, and also when
   * skipPayment is set — those orgs never top up, so the checklist has no wallet
   * item and the query is not run at all.
   */
  walletBalance: string | null;
}

export function getOnboardingCounts(
  orgId: string,
  isBusinessAssociate: boolean,
  skipPayment: boolean,
) {
  return unstable_cache(
    async (): Promise<OnboardingCountsDTO> => {
      const [savedAddressCount, clientCount, wallet] = await Promise.all([
        // BAs keep addresses per client (no org-wide book), so count those instead.
        isBusinessAssociate
          ? prisma.address.count({
              where: { deletedAt: null, client: { orgId } },
            })
          : prisma.address.count({ where: { orgId, deletedAt: null } }),
        isBusinessAssociate
          ? prisma.client.count({ where: { orgId, deletedAt: null } })
          : Promise.resolve(0),
        skipPayment
          ? Promise.resolve(null)
          : prisma.wallet.findUnique({
              where: { orgId },
              select: { balance: true },
            }),
      ]);

      return {
        savedAddressCount,
        clientCount,
        walletBalance: wallet ? wallet.balance.toString() : null,
      };
    },
    [`dashboard-onboarding:${orgId}:${isBusinessAssociate}:${skipPayment}`],
    { revalidate: 30 },
  )();
}
