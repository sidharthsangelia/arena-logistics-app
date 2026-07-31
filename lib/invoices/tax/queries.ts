/**
 * lib/invoices/tax/queries.ts
 *
 * The read side of the tax invoice feature.
 *
 * Kept apart from lib/invoices/queries.ts, which reads the admin-uploaded
 * Invoice model. The two are different documents with different rules, and one
 * query layer trying to serve both would spend every function branching on
 * which it was holding.
 *
 * NOT CACHED. The admin invoice list uses unstable_cache because those rows are
 * written by hand and rarely change. These are written by a background job
 * seconds after a booking, and a customer who books and immediately opens
 * /invoices must not be told their invoice does not exist because a cache entry
 * was warmed a moment too early.
 */

import "server-only";

import {
  InvoiceGenerationStatus,
  Prisma,
  ShipmentInvoiceStatus,
  TaxDocType,
} from "@/generated/prisma";
import { prisma } from "@/utils/db";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface TaxInvoiceRow {
  id: string;
  /** Null while the job has not numbered it yet. */
  invoiceNumber: string | null;
  docType: TaxDocType;
  issueDate: string;
  status: ShipmentInvoiceStatus;
  generationStatus: InvoiceGenerationStatus;

  total: number;
  taxableValue: number;
  totalTax: number;
  currency: string;

  shipmentId: string;
  shipmentNumber: string;

  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;

  /** Arena view only. Null in the tenant scope. */
  orgName: string | null;
  generationError: string | null;
  generationAttempts: number;
}

const ROW_SELECT = {
  id: true,
  invoiceNumber: true,
  docType: true,
  issueDate: true,
  status: true,
  generationStatus: true,
  generationError: true,
  generationAttempts: true,
  total: true,
  taxableValue: true,
  totalTax: true,
  currency: true,
  fileUrl: true,
  fileName: true,
  fileSize: true,
  shipmentId: true,
  shipment: { select: { shipmentNumber: true } },
  org: { select: { name: true, companyName: true } },
} satisfies Prisma.ShipmentInvoiceSelect;

type RawRow = Prisma.ShipmentInvoiceGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(row: RawRow, includeOrg: boolean): TaxInvoiceRow {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    docType: row.docType,
    issueDate: row.issueDate.toISOString(),
    status: row.status,
    generationStatus: row.generationStatus,
    total: Number(row.total),
    taxableValue: Number(row.taxableValue),
    totalTax: Number(row.totalTax),
    currency: row.currency,
    shipmentId: row.shipmentId,
    shipmentNumber: row.shipment.shipmentNumber,
    fileUrl: row.fileUrl,
    fileName: row.fileName,
    fileSize: row.fileSize,
    orgName: includeOrg ? (row.org.companyName?.trim() || row.org.name) : null,
    // The error text is an internal diagnostic. It names files and constraint
    // violations, so it never leaves the Arena scope.
    generationError: includeOrg ? row.generationError : null,
    generationAttempts: row.generationAttempts,
  };
}

// ---------------------------------------------------------------------------
// Tenant scope
// ---------------------------------------------------------------------------

/**
 * Every tax invoice for one org, newest first.
 *
 * orgId is forced by the caller from the session, never taken from a parameter
 * the browser can influence, which is the same rule the rest of the tenant
 * query layer follows.
 */
export async function getOrgTaxInvoices(
  orgId: string,
  options: { limit?: number } = {},
): Promise<TaxInvoiceRow[]> {
  const rows = await prisma.shipmentInvoice.findMany({
    where: { orgId },
    select: ROW_SELECT,
    orderBy: { issueDate: "desc" },
    take: options.limit ?? 100,
  });

  return rows.map((row) => toRow(row, false));
}

/** The invoice for one shipment, for the download button on its detail page. */
export async function getShipmentTaxInvoice(
  shipmentId: string,
  orgId: string,
): Promise<TaxInvoiceRow | null> {
  const row = await prisma.shipmentInvoice.findFirst({
    // orgId in the where clause, not checked afterwards: a shipment id from
    // another org must return nothing rather than something we then discard.
    where: { shipmentId, orgId, docType: TaxDocType.TAX_INVOICE },
    select: ROW_SELECT,
  });

  return row ? toRow(row, false) : null;
}

// ---------------------------------------------------------------------------
// Arena scope
// ---------------------------------------------------------------------------

/** Every tax invoice across all orgs. Arena admins only. */
export async function getAllTaxInvoices(
  options: { limit?: number; orgId?: string | null } = {},
): Promise<TaxInvoiceRow[]> {
  const rows = await prisma.shipmentInvoice.findMany({
    where: options.orgId ? { orgId: options.orgId } : undefined,
    select: ROW_SELECT,
    orderBy: { issueDate: "desc" },
    take: options.limit ?? 200,
  });

  return rows.map((row) => toRow(row, true));
}

/**
 * Invoices whose generation did not finish.
 *
 * This is the operational view that makes the background job safe to rely on.
 * A job that silently fails and leaves nothing behind is the failure mode worth
 * fearing; a row sitting here with its error attached is one somebody can act
 * on. PENDING rows older than a few minutes belong here too: they mean the
 * event never arrived or the job never ran.
 */
export async function getStuckTaxInvoices(
  staleAfterMinutes = 15,
): Promise<TaxInvoiceRow[]> {
  const staleBefore = new Date(Date.now() - staleAfterMinutes * 60_000);

  const rows = await prisma.shipmentInvoice.findMany({
    where: {
      OR: [
        { generationStatus: InvoiceGenerationStatus.FAILED },
        {
          generationStatus: InvoiceGenerationStatus.PENDING,
          createdAt: { lt: staleBefore },
        },
      ],
    },
    select: ROW_SELECT,
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return rows.map((row) => toRow(row, true));
}

/**
 * Booked shipments with no invoice row at all.
 *
 * The other half of the same question. getStuckTaxInvoices finds invoices that
 * failed; this finds bookings where staging the row AND the job both failed, so
 * there is nothing to find. Rare, and precisely why it is worth being able to
 * ask.
 */
export async function getShipmentsMissingInvoices(
  staleAfterMinutes = 15,
): Promise<Array<{ id: string; shipmentNumber: string; bookedAt: Date | null }>> {
  const staleBefore = new Date(Date.now() - staleAfterMinutes * 60_000);

  return prisma.shipment.findMany({
    where: {
      bookedAt: { not: null, lt: staleBefore },
      taxInvoices: { none: {} },
    },
    select: { id: true, shipmentNumber: true, bookedAt: true },
    orderBy: { bookedAt: "desc" },
    take: 100,
  });
}
