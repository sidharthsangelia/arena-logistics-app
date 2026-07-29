// queries/accounts.ts
//
// ACCOUNTS = every organisation that has signed up, business associate or not.
//
// A note on the vocabulary, because it has caused confusion before:
//
//   Org     an account on the platform. One signup, one Org row. The flag
//           `isBusinessAssociate` splits them into partner firms who book for
//           their own customers, and standard accounts who ship for themselves.
//   Client  a customer record belonging to an Org. In practice only business
//           associates create these.
//
// So "everyone who signed up" is a list of Orgs, and it can never be answered
// from the Client table. That is what this module is for. The Business
// Associates list is the same data narrowed to `isBusinessAssociate: true`.
//
// MONEY
// Markup percentage and wallet balance are Arena's own commercial position, and
// utils/arena-auth.ts reserves those for admins. Rather than leaving it to each
// table cell to remember, every read here takes an explicit `canSeeMoney` and
// returns null for those fields when it is false. A caller that forgets cannot
// leak a number it never received.

import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import type { OrgPlan, Prisma } from "@/generated/prisma";
import type {
  AccountFilters,
  AccountHealthFilter,
  AccountSortField,
  SortDirection,
} from "@/lib/accounts/filters";

// ─────────────────────────────────────────────────────────────────────────────
// Row shape
// ─────────────────────────────────────────────────────────────────────────────

export type AccountRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: OrgPlan;
  isBusinessAssociate: boolean;
  skipPayment: boolean;

  contactName: string | null;
  email: string | null;
  phone: string | null;

  /** Set once onboarding is finished. Null means the signup never completed. */
  profileCompletedAt: Date | null;
  createdAt: Date;

  clientCount: number;
  shipmentCount: number;
  quoteCount: number;
  /** Documents ops has actually checked, not merely uploaded. */
  verifiedKycCount: number;

  /** Null when the viewer may not see money. Never merely hidden in the UI. */
  markupPercent: number | null;
  /** Null when the viewer may not see money, or when no wallet exists yet. */
  walletBalance: number | null;
};

/**
 * One select shared by the list and the count, so the two can never disagree
 * about what an account is. Money columns are always read, then dropped in
 * `toAccountRow` when the viewer is not an admin.
 */
const accountSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  plan: true,
  isBusinessAssociate: true,
  skipPayment: true,
  contactName: true,
  email: true,
  phone: true,
  profileCompletedAt: true,
  createdAt: true,
  markupPercent: true,
  wallet: { select: { balance: true } },
  _count: {
    select: {
      clients: { where: { deletedAt: null } },
      shipments: true,
      quotes: true,
      kycDocuments: { where: { verifiedAt: { not: null } } },
    },
  },
} satisfies Prisma.OrgSelect;

type AccountRecord = Prisma.OrgGetPayload<{ select: typeof accountSelect }>;

function toAccountRow(org: AccountRecord, canSeeMoney: boolean): AccountRow {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    plan: org.plan,
    isBusinessAssociate: org.isBusinessAssociate,
    skipPayment: org.skipPayment,
    contactName: org.contactName,
    email: org.email,
    phone: org.phone,
    profileCompletedAt: org.profileCompletedAt,
    createdAt: org.createdAt,
    clientCount: org._count.clients,
    shipmentCount: org._count.shipments,
    quoteCount: org._count.quotes,
    verifiedKycCount: org._count.kycDocuments,
    markupPercent: canSeeMoney ? org.markupPercent.toNumber() : null,
    walletBalance: canSeeMoney ? (org.wallet?.balance.toNumber() ?? 0) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters → Prisma
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_CONDITIONS: Record<
  Exclude<AccountHealthFilter, "all">,
  Prisma.OrgWhereInput
> = {
  "profile-incomplete": { profileCompletedAt: null },
  // `none` rather than a count of zero: an account can hold ten uploads and
  // still be unverified, which is the state ops cares about.
  "kyc-pending": { kycDocuments: { none: { verifiedAt: { not: null } } } },
  "never-booked": { shipments: { none: {} } },
};

/**
 * `includeType` exists so the summary strip can count business associates and
 * standard accounts within the *same* search, rather than the counts collapsing
 * to zero the moment someone picks a type.
 */
function buildWhere(
  filters: AccountFilters,
  { includeType = true }: { includeType?: boolean } = {},
): Prisma.OrgWhereInput {
  const where: Prisma.OrgWhereInput = { deletedAt: null };

  if (filters.query) {
    const contains = { contains: filters.query, mode: "insensitive" as const };
    where.OR = [
      { name: contains },
      { slug: contains },
      { companyName: contains },
      { contactName: contains },
      { email: contains },
    ];
  }

  if (includeType && filters.type !== "all") {
    where.isBusinessAssociate = filters.type === "ba";
  }

  if (filters.health !== "all") {
    Object.assign(where, HEALTH_CONDITIONS[filters.health]);
  }

  return where;
}

function buildOrderBy(
  sort: AccountSortField,
  dir: SortDirection,
): Prisma.OrgOrderByWithRelationInput[] {
  const primary: Prisma.OrgOrderByWithRelationInput =
    sort === "name"
      ? { name: dir }
      : sort === "shipments"
        ? { shipments: { _count: dir } }
        : { createdAt: dir };

  // A stable tiebreak keeps rows from swapping places between pages when the
  // primary key is not unique, which it is not for any of these three.
  return [primary, { id: "desc" }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export type AccountsPage = {
  rows: AccountRow[];
  totalRows: number;
  pageCount: number;
  /** Clamped: a bookmarked page past the end renders the last real page. */
  page: number;
};

export async function getAccountsPage(
  filters: AccountFilters,
  canSeeMoney: boolean,
): Promise<AccountsPage> {
  const where = buildWhere(filters);
  const orderBy = buildOrderBy(filters.sort, filters.dir);

  const findPage = (page: number) =>
    prisma.org.findMany({
      where,
      select: accountSelect,
      orderBy,
      skip: (page - 1) * filters.pageSize,
      take: filters.pageSize,
    });

  // Count and rows go out together rather than count-then-fetch, so the page
  // costs one round trip instead of two.
  const [totalRows, firstAttempt] = await Promise.all([
    prisma.org.count({ where }),
    findPage(filters.page),
  ]);

  const pageCount = Math.max(1, Math.ceil(totalRows / filters.pageSize));
  const page = Math.min(filters.page, pageCount);

  // Only a page number past the end costs a second query, which happens when a
  // link is stale or hand-edited. Anything else is served by what we already have.
  const records =
    page === filters.page ? firstAttempt : await findPage(page);

  return {
    rows: records.map((record) => toAccountRow(record, canSeeMoney)),
    totalRows,
    pageCount,
    page,
  };
}

export type AccountsSummary = {
  total: number;
  businessAssociates: number;
  standard: number;
};

/**
 * Counts for the strip above the table. Deliberately ignores the type filter so
 * the numbers read as "your search matched 40 accounts, 12 of them associates"
 * rather than restating the filter back at you.
 *
 * One groupBy rather than three counts.
 */
export async function getAccountsSummary(
  filters: AccountFilters,
): Promise<AccountsSummary> {
  const groups = await prisma.org.groupBy({
    by: ["isBusinessAssociate"],
    where: buildWhere(filters, { includeType: false }),
    _count: { _all: true },
  });

  const businessAssociates =
    groups.find((g) => g.isBusinessAssociate)?._count._all ?? 0;
  const standard = groups.find((g) => !g.isBusinessAssociate)?._count._all ?? 0;

  return { total: businessAssociates + standard, businessAssociates, standard };
}

// ─────────────────────────────────────────────────────────────────────────────
// A single account
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the list shows, plus the fields only the detail page needs. */
const accountDetailSelect = {
  ...accountSelect,
  clerkOrgId: true,
  companyName: true,
  addressLine1: true,
  city: true,
  state: true,
  country: true,
  postalCode: true,
  notes: true,
  updatedAt: true,
} satisfies Prisma.OrgSelect;

type AccountDetailRecord = Prisma.OrgGetPayload<{
  select: typeof accountDetailSelect;
}>;

export type AccountDetail = AccountRow & {
  clerkOrgId: string;
  companyName: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  notes: string | null;
  updatedAt: Date;
};

export async function getAccountDetail(
  id: string,
  canSeeMoney: boolean,
): Promise<AccountDetail | null> {
  const record: AccountDetailRecord | null = await prisma.org.findFirst({
    where: { id, deletedAt: null },
    select: accountDetailSelect,
  });

  if (!record) return null;

  return {
    ...toAccountRow(record, canSeeMoney),
    clerkOrgId: record.clerkOrgId,
    companyName: record.companyName,
    addressLine1: record.addressLine1,
    city: record.city,
    state: record.state,
    country: record.country,
    postalCode: record.postalCode,
    notes: record.notes,
    updatedAt: record.updatedAt,
  };
}

const RECENT_LIMIT = 5;

/**
 * The three "recently" tables on the detail page. Grouped into one function
 * because they are always shown together and are the slowest part of that page,
 * which makes them a single Suspense boundary rather than three.
 */
export async function getAccountActivity(orgId: string) {
  const [clients, quotes, shipments] = await Promise.all([
    prisma.client.findMany({
      where: { orgId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
    prisma.quote.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
    prisma.shipment.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
    }),
  ]);

  return { clients, quotes, shipments };
}

// ─────────────────────────────────────────────────────────────────────────────
// The people behind an account
// ─────────────────────────────────────────────────────────────────────────────

export type OrgTeamMember = {
  id: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  /** Clerk's raw role, e.g. "org:admin". */
  role: string;
  joinedAt: Date;
};

const ROLE_LABELS: Record<string, string> = {
  "org:admin": "Admin",
  "org:member": "Member",
};

export function formatMemberRole(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/^org:/, "");
}

/**
 * The actual humans on an account. These live in Clerk, never in our database,
 * so this is a network call and belongs behind its own Suspense boundary rather
 * than in the query that renders the page.
 *
 * Returns null when Clerk cannot be reached: an unavailable member list is
 * worth saying plainly on the card, and is not a reason to fail the whole page
 * that surrounds it.
 */
export async function getOrgTeam(
  clerkOrgId: string,
): Promise<OrgTeamMember[] | null> {
  try {
    const client = await clerkClient();
    const { data } = await client.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId,
      limit: 50,
      orderBy: "created_at",
    });

    return data.map((membership) => {
      const user = membership.publicUserData;
      const name = [user?.firstName, user?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      return {
        id: membership.id,
        userId: user?.userId ?? null,
        name: name || null,
        // Clerk's identifier is the email for password and OAuth signups, which
        // is every route into this app.
        email: user?.identifier ?? null,
        imageUrl: user?.imageUrl ?? null,
        role: membership.role,
        joinedAt: new Date(membership.createdAt),
      };
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getOrgTeam" },
      extra: { clerkOrgId },
    });
    return null;
  }
}
