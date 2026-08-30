/**
 * lib/invoices/manual/queries.ts
 *
 * The read side of manual invoicing. One place builds the Prisma `where`, so
 * the list, the summary and the counts can never drift apart in how they
 * interpret a status filter or a search box.
 */

import "server-only";

import {
  BillingPartyKind,
  ManualInvoiceStatus,
  Prisma,
  ShipmentMode,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";

import {
  coerceBillingPartyFilter,
  coerceBillingPartyPageSize,
  coerceBillingPartySortField,
  driftBetween,
  coerceManualPage,
  coerceManualPageSize,
  coerceManualSortField,
  coerceManualStatusFilter,
  deriveManualInvoiceView,
  forwarderKey,
  DEFAULT_CURRENCY,
  type BillingPartyDefaults,
  type BillingPartyDetail,
  type BillingPartyFilter,
  type BillingPartyLink,
  type BillingPartyListParams,
  type BillingPartyOption,
  type BillingPartyPage,
  type BillingPartyRow,
  type BillingPartySortField,
  type BillingPartyStats,
  type ChargePresetOption,
  type ChargeTypeOption,
  type CustomerSearchResult,
  type ManualInvoiceDetail,
  type ManualInvoiceListParams,
  type ManualInvoicePage,
  type ManualInvoiceRow,
  type ManualInvoiceSummary,
  type ManualSortField,
  type ManualStatusFilter,
  type PresetLine,
} from "./config";

export const MANUAL_INVOICES_TAG = "manual-invoices";

function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

// ---------------------------------------------------------------------------
// Where
// ---------------------------------------------------------------------------

/**
 * OVERDUE and ISSUED partition the unpaid set: an issued invoice is overdue or
 * it is not, and asking for one must never return the other. That is why
 * OVERDUE carries the `dueDate < now` clause and ISSUED carries its negation
 * rather than being left open.
 */
function buildWhere(opts: {
  statusFilter: ManualStatusFilter;
  search?: string;
  partyId?: string | null;
  mode?: ShipmentMode | null;
  /** Tenant scope. Never overridable by params. */
  forcedOrgId?: string;
}): Prisma.ManualInvoiceWhereInput {
  const where: Prisma.ManualInvoiceWhereInput = { deletedAt: null };

  if (opts.forcedOrgId) {
    where.orgId = opts.forcedOrgId;
    // A customer never sees a draft. It has no number, no PDF and nothing has
    // been claimed from them yet.
    where.status = { not: ManualInvoiceStatus.DRAFT };
  }

  const now = new Date();
  switch (opts.statusFilter) {
    case "DRAFT":
      where.status = ManualInvoiceStatus.DRAFT;
      break;
    case "ISSUED":
      where.status = ManualInvoiceStatus.ISSUED;
      where.OR = [{ dueDate: null }, { dueDate: { gte: now } }];
      break;
    case "OVERDUE":
      where.status = ManualInvoiceStatus.ISSUED;
      where.dueDate = { lt: now };
      break;
    case "PAID":
      where.status = ManualInvoiceStatus.PAID;
      break;
    case "CANCELLED":
      where.status = ManualInvoiceStatus.CANCELLED;
      break;
    default:
      break;
  }

  if (opts.partyId) where.billingPartyId = opts.partyId;
  if (opts.mode) where.mode = opts.mode;

  const search = opts.search?.trim();
  if (search) {
    // AND-ed rather than merged into the status OR above, which would widen the
    // status filter instead of narrowing the result.
    where.AND = [
      {
        OR: [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { reference: { contains: search, mode: "insensitive" } },
          { billingParty: { legalName: { contains: search, mode: "insensitive" } } },
          { billingParty: { gstin: { contains: search, mode: "insensitive" } } },
          {
            consignments: {
              some: {
                OR: [
                  { awbNumber: { contains: search, mode: "insensitive" } },
                  { mawbNumber: { contains: search, mode: "insensitive" } },
                  { jobNumber: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
    ];
  }

  return where;
}

function orderBy(
  field: ManualSortField,
  dir: "asc" | "desc",
): Prisma.ManualInvoiceOrderByWithRelationInput[] {
  // A stable secondary key, so two invoices issued in the same second do not
  // swap places between pages.
  return [{ [field]: dir } as Prisma.ManualInvoiceOrderByWithRelationInput, { id: "desc" }];
}

const listSelect = {
  id: true,
  invoiceNumber: true,
  docType: true,
  status: true,
  mode: true,
  csbCategory: true,
  currency: true,
  total: true,
  taxableValue: true,
  totalTax: true,
  issueDate: true,
  dueDate: true,
  paidAt: true,
  lastSentAt: true,
  fileUrl: true,
  fileName: true,
  createdByName: true,
  createdAt: true,
  billingPartyId: true,
  billingParty: { select: { legalName: true } },
  orgId: true,
  org: { select: { name: true, companyName: true } },
  consignments: {
    orderBy: { sortOrder: "asc" },
    take: 1,
    select: { awbNumber: true },
  },
  _count: { select: { consignments: true } },
} satisfies Prisma.ManualInvoiceSelect;

type ListRow = Prisma.ManualInvoiceGetPayload<{ select: typeof listSelect }>;

function toRow(row: ListRow): ManualInvoiceRow {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    docType: row.docType,
    status: row.status,
    view: deriveManualInvoiceView(row.status, row.dueDate),

    partyId: row.billingPartyId,
    partyName: row.billingParty.legalName,
    orgId: row.orgId,
    orgName: row.org?.companyName ?? row.org?.name ?? null,

    mode: row.mode,
    csbCategory: row.csbCategory,

    currency: row.currency,
    total: num(row.total),
    taxableValue: num(row.taxableValue),
    totalTax: num(row.totalTax),

    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,

    primaryAwb: row.consignments[0]?.awbNumber ?? null,
    consignmentCount: row._count.consignments,

    fileUrl: row.fileUrl,
    fileName: row.fileName,

    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Deliberately ignores the status filter and the search: the cards answer "where
 * does this stand overall", and a summary that moved every time a filter changed
 * would be answering a question nobody asked.
 *
 * Amounts are summed only within the dominant currency. Adding rupees to dollars
 * produces a number that is wrong in a way nobody notices, so a mixed set
 * reports `mixedCurrency` and the UI says so rather than printing a total that
 * means nothing.
 */
async function buildSummary(
  scope: Prisma.ManualInvoiceWhereInput,
): Promise<ManualInvoiceSummary> {
  const grouped = await prisma.manualInvoice.groupBy({
    by: ["status", "currency"],
    where: scope,
    _count: { _all: true },
    _sum: { total: true },
  });

  const currencies = [...new Set(grouped.map((g) => g.currency))];
  const dominant =
    grouped
      .slice()
      .sort((a, b) => b._count._all - a._count._all)[0]?.currency ??
    DEFAULT_CURRENCY;

  const inScope = grouped.filter((g) => g.currency === dominant);
  const pick = (status: ManualInvoiceStatus) =>
    inScope.find((g) => g.status === status);

  const draft = pick(ManualInvoiceStatus.DRAFT);
  const issued = pick(ManualInvoiceStatus.ISSUED);
  const paid = pick(ManualInvoiceStatus.PAID);

  // Overdue needs its own query: it is a date comparison, not a status, and
  // groupBy cannot express it.
  const overdue = await prisma.manualInvoice.aggregate({
    where: {
      ...scope,
      status: ManualInvoiceStatus.ISSUED,
      dueDate: { lt: new Date() },
      currency: dominant,
    },
    _count: { _all: true },
    _sum: { total: true },
  });

  return {
    draftCount: draft?._count._all ?? 0,
    outstandingCount: issued?._count._all ?? 0,
    outstandingAmount: num(issued?._sum.total),
    overdueCount: overdue._count._all,
    overdueAmount: num(overdue._sum.total),
    paidCount: paid?._count._all ?? 0,
    paidAmount: num(paid?._sum.total),
    currency: dominant,
    mixedCurrency: currencies.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export async function getManualInvoicesPage(
  params: ManualInvoiceListParams,
): Promise<ManualInvoicePage> {
  const page = coerceManualPage(params.page);
  const pageSize = coerceManualPageSize(params.pageSize);
  const sortField = coerceManualSortField(params.sortField);
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";
  const statusFilter = coerceManualStatusFilter(params.statusFilter);

  const where = buildWhere({
    statusFilter,
    search: params.search,
    partyId: params.partyId,
    mode: params.mode,
  });

  const [total, rows, summary] = await Promise.all([
    prisma.manualInvoice.count({ where }),
    prisma.manualInvoice.findMany({
      where,
      orderBy: orderBy(sortField, sortDir),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: listSelect,
    }),
    buildSummary({ deletedAt: null }),
  ]);

  return {
    rows: rows.map(toRow),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    summary,
  };
}

/** Tenant: the caller org's own manual invoices. Drafts are never included. */
export async function getOrgManualInvoicesPage(
  orgId: string,
  params: ManualInvoiceListParams,
): Promise<ManualInvoicePage> {
  const page = coerceManualPage(params.page);
  const pageSize = coerceManualPageSize(params.pageSize);
  const sortField = coerceManualSortField(params.sortField);
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";
  const statusFilter = coerceManualStatusFilter(params.statusFilter);

  const where = buildWhere({
    statusFilter,
    search: params.search,
    forcedOrgId: orgId,
  });

  const [total, rows, summary] = await Promise.all([
    prisma.manualInvoice.count({ where }),
    prisma.manualInvoice.findMany({
      where,
      orderBy: orderBy(sortField, sortDir),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: listSelect,
    }),
    buildSummary({
      deletedAt: null,
      orgId,
      status: { not: ManualInvoiceStatus.DRAFT },
    }),
  ]);

  return {
    rows: rows.map(toRow),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Billing parties
// ---------------------------------------------------------------------------

const partySelect = {
  id: true,
  kind: true,
  legalName: true,
  tradeName: true,
  gstin: true,
  city: true,
  state: true,
  stateCode: true,
  email: true,
  orgId: true,
  org: { select: { name: true, companyName: true } },
} satisfies Prisma.BillingPartySelect;

function toPartyOption(
  row: Prisma.BillingPartyGetPayload<{ select: typeof partySelect }>,
): BillingPartyOption {
  return {
    id: row.id,
    kind: row.kind,
    legalName: row.legalName,
    tradeName: row.tradeName,
    gstin: row.gstin,
    city: row.city,
    state: row.state,
    stateCode: row.stateCode,
    email: row.email,
    orgId: row.orgId,
    orgName: row.org?.companyName ?? row.org?.name ?? null,
  };
}

/**
 * The party picker. Ordered by most recently invoiced rather than
 * alphabetically: with no search typed, the customers billed last week are the
 * ones about to be billed again, and putting them first is most of what makes
 * the repeat case fast.
 */
export async function searchBillingParties(
  query?: string,
  limit = 20,
): Promise<BillingPartyOption[]> {
  const q = query?.trim();

  const rows = await prisma.billingParty.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { legalName: { contains: q, mode: "insensitive" } },
              { tradeName: { contains: q, mode: "insensitive" } },
              { gstin: { contains: q, mode: "insensitive" } },
              { customerCode: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: q ? { legalName: "asc" } : { updatedAt: "desc" },
    take: limit,
    select: partySelect,
  });

  return rows.map(toPartyOption);
}

/**
 * The picker's real search: billing parties, signed-up orgs, and business
 * associates' clients, in one list.
 *
 * ── WHY ALL THREE ───────────────────────────────────────────────────────────
 * Most companies Arena bills off-platform are already in the database under one
 * of the other two headings. Making the admin retype a name, GSTIN and address
 * that already exist is both slower and worse: it creates a second copy of one
 * company that then drifts from the first. So an Org or Client can be billed
 * directly, and adopting it (see adoptCustomerAction) copies its details into a
 * BillingParty ONCE and links the two.
 *
 * Ordering is by source, not by relevance: parties already on the billing list
 * come first, because a party that has been invoiced before is more likely to
 * be the intended one than a namesake org that has never been billed.
 *
 * `alreadyLinked` is resolved in one pass over the parties, so an org that has
 * been adopted is shown as such rather than being offered twice.
 */
export async function searchInvoiceCustomers(
  query?: string,
  limit = 8,
): Promise<CustomerSearchResult[]> {
  const q = query?.trim();

  const contains = q
    ? ({ contains: q, mode: "insensitive" } as const)
    : undefined;

  const [parties, orgs, clients] = await Promise.all([
    prisma.billingParty.findMany({
      where: {
        deletedAt: null,
        ...(contains
          ? {
              OR: [
                { legalName: contains },
                { tradeName: contains },
                { gstin: contains },
                { customerCode: contains },
                { email: contains },
              ],
            }
          : {}),
      },
      orderBy: q ? { legalName: "asc" } : { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        kind: true,
        legalName: true,
        gstin: true,
        city: true,
        state: true,
        email: true,
        phone: true,
        orgId: true,
        clientId: true,
      },
    }),
    prisma.org.findMany({
      where: {
        deletedAt: null,
        ...(contains
          ? {
              OR: [
                { name: contains },
                { companyName: contains },
                { gstin: contains },
                { email: contains },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        name: true,
        companyName: true,
        gstin: true,
        city: true,
        state: true,
        email: true,
      },
    }),
    prisma.client.findMany({
      where: {
        deletedAt: null,
        ...(contains
          ? {
              OR: [
                { companyName: contains },
                { gstin: contains },
                { email: contains },
                { contactName: contains },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        companyName: true,
        gstin: true,
        city: true,
        state: true,
        email: true,
        org: { select: { name: true, companyName: true } },
      },
    }),
  ]);

  const linkedOrgIds = new Set(
    parties.map((p) => p.orgId).filter((v): v is string => !!v),
  );
  const linkedClientIds = new Set(
    parties.map((p) => p.clientId).filter((v): v is string => !!v),
  );

  // An org or client already adopted by one of the parties above is dropped
  // rather than flagged: showing the same company twice, once billable and once
  // not, is a choice the admin should never have to make.
  return [
    ...parties.map(
      (p): CustomerSearchResult => ({
        source: "PARTY",
        id: p.id,
        kind: p.kind,
        legalName: p.legalName,
        gstin: p.gstin,
        city: p.city,
        state: p.state,
        email: p.email,
        ownerName: null,
        alreadyLinked: false,
      }),
    ),
    ...orgs
      .filter((o) => !linkedOrgIds.has(o.id))
      .map(
        (o): CustomerSearchResult => ({
          source: "ORG",
          id: o.id,
          // An account on the platform is always a company: signing up asks
          // for one. Only the billing list can hold a person.
          kind: BillingPartyKind.BUSINESS,
          legalName: o.companyName ?? o.name,
          gstin: o.gstin,
          city: o.city,
          state: o.state,
          email: o.email,
          ownerName: null,
          alreadyLinked: false,
        }),
      ),
    ...clients
      .filter((c) => !linkedClientIds.has(c.id))
      .map(
        (c): CustomerSearchResult => ({
          source: "CLIENT",
          id: c.id,
          kind: BillingPartyKind.BUSINESS,
          legalName: c.companyName,
          gstin: c.gstin,
          city: c.city,
          state: c.state,
          email: c.email,
          ownerName: c.org?.companyName ?? c.org?.name ?? null,
          alreadyLinked: false,
        }),
      ),
  ];
}

export async function getBillingParty(
  id: string,
): Promise<BillingPartyDetail | null> {
  const row = await prisma.billingParty.findFirst({
    where: { id, deletedAt: null },
    include: { org: { select: { name: true, companyName: true } } },
  });
  if (!row) return null;

  return {
    ...toPartyOption(row),
    customerCode: row.customerCode,
    pan: row.pan,
    cin: row.cin,
    contactName: row.contactName,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    postalCode: row.postalCode,
    country: row.country,
    notes: row.notes,
    clientId: row.clientId,
    defaults: (row.defaults as BillingPartyDefaults | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Every active charge type. Returned whole rather than searched server-side:
 * sixty rows is a few kilobytes, the picker filters instantly in the browser
 * with no round trip, and typing is the slow part of this form.
 */
export async function listChargeTypes(): Promise<ChargeTypeOption[]> {
  const rows = await prisma.chargeType.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    sacCode: row.sacCode,
    defaultRatePercent: num(row.defaultRatePercent),
    defaultReimbursement: row.defaultReimbursement,
    applicability: row.applicability,
    sortOrder: row.sortOrder,
  }));
}

export async function listChargePresets(): Promise<ChargePresetOption[]> {
  const rows = await prisma.chargePreset.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    mode: row.mode,
    lines: (row.lines as unknown as PresetLine[]) ?? [],
  }));
}

/**
 * Every service description an invoice has actually used, most used first.
 *
 * There is no ServiceType table and deliberately will not be one. A service is a
 * line of text on a document, not a priced catalog row with a SAC and a rate
 * behind it, so the list worth offering is the one this office has already
 * typed. Reading it back off the consignments means a service typed once is
 * offered on every invoice after it, with no settings screen to visit first and
 * nothing to keep tidy later.
 *
 * Not filtered by mode, because nothing records which mode a past service was
 * typed on. The curated list in config.ts carries the mode hints; this one
 * carries the evidence.
 */
export async function listServiceTypes(): Promise<string[]> {
  const rows = await prisma.manualInvoiceConsignment.groupBy({
    by: ["serviceType"],
    where: { serviceType: { not: null }, invoice: { deletedAt: null } },
    _count: { serviceType: true },
    orderBy: { _count: { serviceType: "desc" } },
    take: 40,
  });

  return rows
    .map((row) => row.serviceType?.trim() ?? "")
    .filter((label) => label.length > 0);
}

/**
 * Every forwarder an invoice has actually used, most used first.
 *
 * Same argument as listServiceTypes: no Forwarder table, and deliberately not
 * one. A forwarder on a manual invoice is a name on a document, not a priced
 * relationship with credentials behind it. Typing it once is what puts it in
 * the list.
 */
export async function listForwarders(): Promise<string[]> {
  const rows = await prisma.manualInvoiceConsignment.groupBy({
    by: ["forwarderName"],
    where: { forwarderName: { not: null }, invoice: { deletedAt: null } },
    _count: { forwarderName: true },
    orderBy: { _count: { forwarderName: "desc" } },
    take: 40,
  });

  return rows
    .map((row) => row.forwarderName?.trim() ?? "")
    .filter((label) => label.length > 0);
}

/**
 * Products used before, grouped by the forwarder they were used under.
 *
 * ── WHY GROUPED AND NOT FLAT ────────────────────────────────────────────────
 * The product names belong to the carrier: "Saver" is a UPS word, "Express
 * Worldwide" is a DHL one. Offering every carrier's vocabulary under every
 * carrier is how an invoice ends up saying FedEx sold a DHL product. So the
 * picker only offers what has been typed under THIS forwarder, plus the seeded
 * list for it from config.ts.
 *
 * The empty-string key holds products typed with no forwarder set, which is a
 * real case: a consignment can carry a product name before anyone has decided
 * who is flying it.
 *
 * `forwarderKey` is shared with the picker so both sides group on the same
 * string. If they ever drift, products typed against "UPS " stop coming back
 * for "UPS" and the feature quietly does nothing.
 */
export async function listForwarderProducts(): Promise<
  Record<string, string[]>
> {
  const rows = await prisma.manualInvoiceConsignment.groupBy({
    by: ["forwarderName", "productType"],
    where: { productType: { not: null }, invoice: { deletedAt: null } },
    _count: { productType: true },
    orderBy: { _count: { productType: "desc" } },
    take: 200,
  });

  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const product = row.productType?.trim();
    if (!product) continue;
    const key = forwarderKey(row.forwarderName);
    const list = (out[key] ??= []);
    // groupBy already ordered by use, so first seen is most used. The guard is
    // for case variants of one product landing in the same bucket.
    if (!list.some((p) => p.toLowerCase() === product.toLowerCase())) {
      list.push(product);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// One invoice, in the shape the builder edits
// ---------------------------------------------------------------------------

const detailInclude = {
  billingParty: { include: { org: { select: { name: true, companyName: true } } } },
  relatedInvoice: { select: { invoiceNumber: true } },
  consignments: {
    orderBy: { sortOrder: "asc" },
    include: { charges: { orderBy: { sortOrder: "asc" } } },
  },
} satisfies Prisma.ManualInvoiceInclude;

/**
 * Loads an invoice for the builder form. Field names match what
 * manualInvoiceSchema parses, so loading and saving is a round trip rather than
 * two mappings that have to be kept in step.
 */
export async function getManualInvoiceDetail(
  id: string,
): Promise<ManualInvoiceDetail | null> {
  const row = await prisma.manualInvoice.findFirst({
    where: { id, deletedAt: null },
    include: detailInclude,
  });
  if (!row) return null;

  const party = row.billingParty;

  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    view: deriveManualInvoiceView(row.status, row.dueDate),
    docType: row.docType,
    relatedInvoiceId: row.relatedInvoiceId,
    relatedInvoiceNumber: row.relatedInvoice?.invoiceNumber ?? null,

    billingPartyId: row.billingPartyId,
    party: {
      id: party.id,
      kind: party.kind,
      legalName: party.legalName,
      tradeName: party.tradeName,
      gstin: party.gstin,
      city: party.city,
      state: party.state,
      stateCode: party.stateCode,
      email: party.email,
      orgId: party.orgId,
      orgName: party.org?.companyName ?? party.org?.name ?? null,
      customerCode: party.customerCode,
      pan: party.pan,
      cin: party.cin,
      contactName: party.contactName,
      phone: party.phone,
      addressLine1: party.addressLine1,
      addressLine2: party.addressLine2,
      postalCode: party.postalCode,
      country: party.country,
      notes: party.notes,
      clientId: party.clientId,
      defaults: (party.defaults as BillingPartyDefaults | null) ?? null,
    },

    mode: row.mode,
    csbCategory: row.csbCategory,

    issueDate: row.issueDate.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    paymentTerms: row.paymentTerms,
    reference: row.reference,

    currency: row.currency,
    taxMode: row.taxMode,
    reverseCharge: row.reverseCharge,
    placeOfSupplyCode: row.placeOfSupplyCode,
    placeOfSupplyName: row.placeOfSupplyName,

    irn: row.irn,
    irnAckNo: row.irnAckNo,
    irnAckDate: row.irnAckDate?.toISOString() ?? null,
    irnQrData: row.irnQrData,

    notes: row.notes,
    termsOverride: row.termsOverride,

    consignments: row.consignments.map((c) => ({
      id: c.id,
      awbNumber: c.awbNumber,
      mawbNumber: c.mawbNumber,
      trackingNumber: c.trackingNumber,
      bookingDate: c.bookingDate?.toISOString() ?? null,
      pickupDate: c.pickupDate?.toISOString() ?? null,
      origin: c.origin,
      originPostalCode: c.originPostalCode,
      originCity: c.originCity,
      originState: c.originState,
      originCountry: c.originCountry,
      destination: c.destination,
      destinationPostalCode: c.destinationPostalCode,
      destinationCity: c.destinationCity,
      destinationState: c.destinationState,
      destinationCountry: c.destinationCountry,
      serviceType: c.serviceType,
      productType: c.productType,
      parcelType: c.parcelType,
      shipMode: c.shipMode,
      originPort: c.originPort,
      destinationPort: c.destinationPort,
      flightNumber: c.flightNumber,
      airlineName: c.airlineName,
      forwarderName: c.forwarderName,
      subAgent: c.subAgent,
      pieces: c.pieces,
      grossWeightKg: c.grossWeightKg === null ? null : num(c.grossWeightKg),
      chargeableWeightKg:
        c.chargeableWeightKg === null ? null : num(c.chargeableWeightKg),
      boxCount: c.boxCount,
      palletCount: c.palletCount,
      cartonCount: c.cartonCount,
      goodsDescription: c.goodsDescription,
      hsnCode: c.hsnCode,
      particulars: c.particulars,
      exportInvoiceNo: c.exportInvoiceNo,
      referenceNo: c.referenceNo,
      shipperName: c.shipperName,
      consigneeName: c.consigneeName,
      containerNumber: c.containerNumber,
      jobNumber: c.jobNumber,
      notes: c.notes,
      charges: c.charges.map((charge) => ({
        id: charge.id,
        chargeTypeId: charge.chargeTypeId,
        label: charge.label,
        sacCode: charge.sacCode,
        rate: num(charge.rate),
        quantity: num(charge.quantity),
        amount: num(charge.amount),
        discount: num(charge.discount),
        ratePercent: num(charge.ratePercent),
        reimbursement: charge.reimbursement,
        notes: charge.notes,
      })),
    })),

    fileUrl: row.fileUrl,
    fileName: row.fileName,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    lastSentTo: row.lastSentTo,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelledReason: row.cancelledReason,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Issued invoices, for the credit-note picker. Never drafts. */
export async function searchIssuedInvoices(
  query?: string,
  limit = 20,
): Promise<Array<{ id: string; invoiceNumber: string; partyName: string; total: number; currency: string }>> {
  const q = query?.trim();

  const rows = await prisma.manualInvoice.findMany({
    where: {
      deletedAt: null,
      docType: "TAX_INVOICE",
      invoiceNumber: { not: null },
      ...(q
        ? {
            OR: [
              { invoiceNumber: { contains: q, mode: "insensitive" } },
              { billingParty: { legalName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { issueDate: "desc" },
    take: limit,
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      currency: true,
      billingParty: { select: { legalName: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber as string,
    partyName: row.billingParty.legalName,
    total: num(row.total),
    currency: row.currency,
  }));
}

// ---------------------------------------------------------------------------
// The customer list
// ---------------------------------------------------------------------------
//
// Everything below serves /arena-dashboard/invoices/customers. Before it
// existed a BillingParty was only ever reachable through the invoice form's
// picker, which meant a wrong GSTIN could not be corrected without starting an
// invoice, and a company entered twice under two spellings could not be seen at
// all.
//
// MONEY IS NEVER STORED ON A PARTY. What a customer owes is the sum of the
// invoices raised to them; a balance column would be a second copy of that,
// wrong from the first time one was marked paid. So the totals here are summed
// per request, and only over the parties on the page being rendered.

/**
 * Which parties the list is asking for.
 *
 * BILLED and NEVER_BILLED are expressed as `some`/`none` on the relation rather
 * than a count, so the filter is a semi-join the database can answer from the
 * index instead of a subquery per row. OWES is deliberately ISSUED only:
 * an unpaid invoice is money owed, a draft is not money at all, and a cancelled
 * one is money nobody will ever collect.
 */
function partyWhere(opts: {
  search?: string;
  kind?: BillingPartyKind | null;
  filter: BillingPartyFilter;
}): Prisma.BillingPartyWhereInput {
  const where: Prisma.BillingPartyWhereInput = { deletedAt: null };

  if (opts.kind) where.kind = opts.kind;

  const live: Prisma.ManualInvoiceWhereInput = { deletedAt: null };

  switch (opts.filter) {
    case "BILLED":
      where.invoices = { some: live };
      break;
    case "NEVER_BILLED":
      where.invoices = { none: live };
      break;
    case "OWES":
      where.invoices = {
        some: { ...live, status: ManualInvoiceStatus.ISSUED },
      };
      break;
    case "LINKED":
      where.OR = [{ orgId: { not: null } }, { clientId: { not: null } }];
      break;
    case "UNLINKED":
      where.orgId = null;
      where.clientId = null;
      break;
    default:
      break;
  }

  const search = opts.search?.trim();
  if (search) {
    const contains = { contains: search, mode: "insensitive" } as const;
    // AND-ed rather than merged into the OR that LINKED sets above, which would
    // widen the filter instead of narrowing the result.
    where.AND = [
      {
        OR: [
          { legalName: contains },
          { tradeName: contains },
          { customerCode: contains },
          { gstin: contains },
          { pan: contains },
          { email: contains },
          { phone: contains },
          { city: contains },
          { contactName: contains },
        ],
      },
    ];
  }

  return where;
}

function partyOrderBy(
  field: BillingPartySortField,
  dir: "asc" | "desc",
): Prisma.BillingPartyOrderByWithRelationInput[] {
  // A stable secondary key, so two parties created in the same second do not
  // swap places between pages.
  const primary: Prisma.BillingPartyOrderByWithRelationInput =
    field === "invoiceCount"
      ? { invoices: { _count: dir } }
      : ({ [field]: dir } as Prisma.BillingPartyOrderByWithRelationInput);

  return [primary, { id: "desc" }];
}

const partyListSelect = {
  id: true,
  kind: true,
  legalName: true,
  tradeName: true,
  customerCode: true,
  gstin: true,
  city: true,
  state: true,
  email: true,
  phone: true,
  createdAt: true,
  orgId: true,
  org: { select: { name: true, companyName: true } },
  clientId: true,
  client: { select: { companyName: true } },
} satisfies Prisma.BillingPartySelect;

type PartyListRow = Prisma.BillingPartyGetPayload<{
  select: typeof partyListSelect;
}>;

/**
 * Per-party invoice figures for one page of parties.
 *
 * Two grouped queries over the page's ids rather than a per-row aggregate. The
 * page is at most fifty parties, so this is two round trips no matter how many
 * customers exist, and the `IN` is on an indexed foreign key.
 *
 * Overdue needs the second query because it is a date comparison rather than a
 * status, and groupBy cannot express one.
 */
async function partyTotals(
  ids: string[],
): Promise<Map<string, Omit<BillingPartyRow, keyof PartyIdentity>>> {
  const totals = new Map<string, Omit<BillingPartyRow, keyof PartyIdentity>>();
  if (ids.length === 0) return totals;

  const scope: Prisma.ManualInvoiceWhereInput = {
    deletedAt: null,
    billingPartyId: { in: ids },
  };

  const [grouped, overdue] = await Promise.all([
    prisma.manualInvoice.groupBy({
      by: ["billingPartyId", "status", "currency"],
      where: scope,
      _count: { _all: true },
      _sum: { total: true },
      _max: { issueDate: true },
    }),
    prisma.manualInvoice.groupBy({
      by: ["billingPartyId"],
      where: {
        ...scope,
        status: ManualInvoiceStatus.ISSUED,
        dueDate: { lt: new Date() },
      },
      _count: { _all: true },
    }),
  ]);

  const overdueBy = new Map(
    overdue.map((row) => [row.billingPartyId, row._count._all]),
  );

  for (const id of ids) {
    const mine = grouped.filter((g) => g.billingPartyId === id);

    const currencies = [...new Set(mine.map((g) => g.currency))];
    // Adding rupees to dollars produces a number that is wrong in a way nobody
    // notices. The dominant currency is reported and the mix is declared.
    const currency =
      mine
        .slice()
        .sort((a, b) => b._count._all - a._count._all)[0]?.currency ??
      DEFAULT_CURRENCY;

    const inCurrency = mine.filter((g) => g.currency === currency);
    const sumOf = (status: ManualInvoiceStatus) =>
      inCurrency
        .filter((g) => g.status === status)
        .reduce((sum, g) => sum + num(g._sum.total), 0);

    const draftCount = mine
      .filter((g) => g.status === ManualInvoiceStatus.DRAFT)
      .reduce((sum, g) => sum + g._count._all, 0);
    const invoiceCount = mine.reduce((sum, g) => sum + g._count._all, 0);

    const lastIssue = mine
      .map((g) => g._max.issueDate)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    totals.set(id, {
      invoiceCount,
      draftCount,
      issuedCount: invoiceCount - draftCount,

      currency,
      mixedCurrency: currencies.length > 1,
      // What has actually been billed: a draft has claimed nothing and a
      // cancelled invoice has un-claimed it.
      billedAmount:
        sumOf(ManualInvoiceStatus.ISSUED) + sumOf(ManualInvoiceStatus.PAID),
      outstandingAmount: sumOf(ManualInvoiceStatus.ISSUED),
      overdueCount: overdueBy.get(id) ?? 0,

      lastInvoicedAt: lastIssue?.toISOString() ?? null,
    });
  }

  return totals;
}

/** The half of a row that comes from the party record rather than its invoices. */
type PartyIdentity = Pick<
  BillingPartyRow,
  | "id"
  | "kind"
  | "legalName"
  | "tradeName"
  | "customerCode"
  | "gstin"
  | "city"
  | "state"
  | "email"
  | "phone"
  | "linkKind"
  | "linkName"
  | "createdAt"
>;

function partyIdentity(row: PartyListRow): PartyIdentity {
  return {
    id: row.id,
    kind: row.kind,
    legalName: row.legalName,
    tradeName: row.tradeName,
    customerCode: row.customerCode,
    gstin: row.gstin,
    city: row.city,
    state: row.state,
    email: row.email,
    phone: row.phone,
    // An org link is reported ahead of a client link when a row somehow has
    // both: the org is the one that puts the invoice in a customer's dashboard,
    // so it is the link with a consequence.
    linkKind: row.orgId ? "ORG" : row.clientId ? "CLIENT" : null,
    linkName: row.orgId
      ? row.org?.companyName ?? row.org?.name ?? null
      : row.client?.companyName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The tiles above the list.
 *
 * Deliberately ignores the search box and the filter chips, so they stay a
 * steady overview of the whole customer base while the list below is sliced.
 */
async function partySummary() {
  const live: Prisma.ManualInvoiceWhereInput = { deletedAt: null };
  const base: Prisma.BillingPartyWhereInput = { deletedAt: null };

  const [total, billed, linked] = await Promise.all([
    prisma.billingParty.count({ where: base }),
    prisma.billingParty.count({ where: { ...base, invoices: { some: live } } }),
    prisma.billingParty.count({
      where: {
        ...base,
        OR: [{ orgId: { not: null } }, { clientId: { not: null } }],
      },
    }),
  ]);

  return { total, billed, neverBilled: total - billed, linked };
}

export async function getBillingPartiesPage(
  params: BillingPartyListParams,
): Promise<BillingPartyPage> {
  const page = coerceManualPage(params.page);
  const pageSize = coerceBillingPartyPageSize(params.pageSize);
  const sortField = coerceBillingPartySortField(params.sortField);
  // Alphabetical reads ascending; every other column reads newest or biggest
  // first, which is the direction a person means when they click it.
  const sortDir =
    params.sortDir ?? (sortField === "legalName" ? "asc" : "desc");
  const filter = coerceBillingPartyFilter(params.filter);

  const where = partyWhere({
    search: params.search,
    kind: params.kind,
    filter,
  });

  const [total, rows, summary] = await Promise.all([
    prisma.billingParty.count({ where }),
    prisma.billingParty.findMany({
      where,
      orderBy: partyOrderBy(sortField, sortDir === "asc" ? "asc" : "desc"),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: partyListSelect,
    }),
    partySummary(),
  ]);

  const totals = await partyTotals(rows.map((r) => r.id));

  return {
    rows: rows.map((row): BillingPartyRow => {
      const identity = partyIdentity(row);
      const money = totals.get(row.id);
      return {
        ...identity,
        invoiceCount: money?.invoiceCount ?? 0,
        draftCount: money?.draftCount ?? 0,
        issuedCount: money?.issuedCount ?? 0,
        currency: money?.currency ?? DEFAULT_CURRENCY,
        mixedCurrency: money?.mixedCurrency ?? false,
        billedAmount: money?.billedAmount ?? 0,
        outstandingAmount: money?.outstandingAmount ?? 0,
        overdueCount: money?.overdueCount ?? 0,
        lastInvoicedAt: money?.lastInvoicedAt ?? null,
      };
    }),
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
    summary,
  };
}

/**
 * One party's billing history, in totals.
 *
 * Manual invoices only, with the linked org's booking invoices reported as a
 * count beside them rather than folded in. They are a different debt: raised by
 * the platform against a shipment and settled from a wallet, not chased on a
 * due date. Adding them into "outstanding" would say a customer owes money that
 * was taken from their balance at the moment of booking.
 */
export async function getBillingPartyStats(
  id: string,
): Promise<BillingPartyStats> {
  const scope: Prisma.ManualInvoiceWhereInput = {
    deletedAt: null,
    billingPartyId: id,
  };

  const party = await prisma.billingParty.findUnique({
    where: { id },
    select: { orgId: true },
  });

  const [grouped, overdue, bounds, bookingInvoiceCount] = await Promise.all([
    prisma.manualInvoice.groupBy({
      by: ["status", "currency"],
      where: scope,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.manualInvoice.aggregate({
      where: {
        ...scope,
        status: ManualInvoiceStatus.ISSUED,
        dueDate: { lt: new Date() },
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.manualInvoice.aggregate({
      where: { ...scope, status: { not: ManualInvoiceStatus.DRAFT } },
      _min: { issueDate: true },
      _max: { issueDate: true },
    }),
    party?.orgId
      ? prisma.shipmentInvoice.count({ where: { orgId: party.orgId } })
      : Promise.resolve(null),
  ]);

  const currencies = [...new Set(grouped.map((g) => g.currency))];
  const currency =
    grouped
      .slice()
      .sort((a, b) => b._count._all - a._count._all)[0]?.currency ??
    DEFAULT_CURRENCY;

  const inCurrency = grouped.filter((g) => g.currency === currency);
  const pick = (status: ManualInvoiceStatus) =>
    inCurrency.find((g) => g.status === status);

  const issued = pick(ManualInvoiceStatus.ISSUED);
  const paid = pick(ManualInvoiceStatus.PAID);

  const invoiceCount = grouped.reduce((sum, g) => sum + g._count._all, 0);
  const draftCount = grouped
    .filter((g) => g.status === ManualInvoiceStatus.DRAFT)
    .reduce((sum, g) => sum + g._count._all, 0);
  const cancelledCount = grouped
    .filter((g) => g.status === ManualInvoiceStatus.CANCELLED)
    .reduce((sum, g) => sum + g._count._all, 0);

  return {
    invoiceCount,
    draftCount,
    issuedCount: invoiceCount - draftCount,
    cancelledCount,

    currency,
    mixedCurrency: currencies.length > 1,
    billedAmount: num(issued?._sum.total) + num(paid?._sum.total),
    paidAmount: num(paid?._sum.total),
    outstandingAmount: num(issued?._sum.total),
    overdueAmount: num(overdue._sum.total),
    overdueCount: overdue._count._all,

    firstInvoicedAt: bounds._min.issueDate?.toISOString() ?? null,
    lastInvoicedAt: bounds._max.issueDate?.toISOString() ?? null,

    bookingInvoiceCount,
  };
}

// ---------------------------------------------------------------------------
// Drift against the linked record
// ---------------------------------------------------------------------------

/**
 * What the org or client this party was adopted from says about itself today.
 *
 * Returns null for a party that was typed in by hand, which is most of them.
 * A link whose source row has since been deleted comes back `present: false`
 * with no drift: the history is still worth showing, and there is nothing left
 * to compare against.
 */
export async function getBillingPartyLink(
  id: string,
): Promise<BillingPartyLink | null> {
  const party = await prisma.billingParty.findUnique({
    where: { id },
    select: {
      legalName: true,
      gstin: true,
      email: true,
      phone: true,
      contactName: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      orgId: true,
      clientId: true,
    },
  });
  if (!party) return null;

  const ours = {
    legalName: party.legalName,
    gstin: party.gstin,
    email: party.email,
    phone: party.phone,
    contactName: party.contactName,
    addressLine1: party.addressLine1,
    city: party.city,
    state: party.state,
    postalCode: party.postalCode,
  };

  if (party.orgId) {
    const org = await prisma.org.findUnique({
      where: { id: party.orgId },
      select: {
        name: true,
        companyName: true,
        gstin: true,
        email: true,
        phone: true,
        contactName: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        deletedAt: true,
      },
    });

    const name = org?.companyName ?? org?.name ?? "This account";
    if (!org || org.deletedAt) {
      return {
        source: "ORG",
        id: party.orgId,
        name,
        ownerName: null,
        present: false,
        drift: [],
      };
    }

    return {
      source: "ORG",
      id: party.orgId,
      name,
      ownerName: null,
      present: true,
      drift: driftBetween(ours, {
        legalName: org.companyName ?? org.name,
        gstin: org.gstin,
        email: org.email,
        phone: org.phone,
        contactName: org.contactName,
        addressLine1: org.addressLine1,
        city: org.city,
        state: org.state,
        postalCode: org.postalCode,
      }),
    };
  }

  if (party.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: party.clientId },
      select: {
        companyName: true,
        gstin: true,
        email: true,
        phone: true,
        contactName: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        deletedAt: true,
        org: { select: { name: true, companyName: true } },
      },
    });

    if (!client || client.deletedAt) {
      return {
        source: "CLIENT",
        id: party.clientId,
        name: client?.companyName ?? "This client",
        ownerName: null,
        present: false,
        drift: [],
      };
    }

    return {
      source: "CLIENT",
      id: party.clientId,
      name: client.companyName,
      ownerName: client.org?.companyName ?? client.org?.name ?? null,
      present: true,
      drift: driftBetween(ours, {
        legalName: client.companyName,
        gstin: client.gstin,
        email: client.email,
        phone: client.phone,
        contactName: client.contactName,
        addressLine1: client.addressLine1,
        city: client.city,
        state: client.state,
        postalCode: client.postalCode,
      }),
    };
  }

  return null;
}
