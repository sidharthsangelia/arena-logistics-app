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
  coerceManualPage,
  coerceManualPageSize,
  coerceManualSortField,
  coerceManualStatusFilter,
  deriveManualInvoiceView,
  DEFAULT_CURRENCY,
  type BillingPartyDefaults,
  type BillingPartyDetail,
  type BillingPartyOption,
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
      bookingDate: c.bookingDate?.toISOString() ?? null,
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
