"use server";

/**
 * actions/invoices/invoices.action.ts
 *
 * Every read and write behind the invoice feature.
 *
 *   Reads   — the tenant list is hard-scoped to the caller's own org; the Arena
 *             list spans all orgs and is admin-only (it exposes what every org
 *             owes, which is money).
 *   Writes  — issuing, editing, marking paid/unpaid, voiding and deleting are
 *             all Arena-admin only, gated through requireArenaAdmin() so a raw
 *             POST can never bypass the page's route guard.
 *
 * Note: this file is "use server", so it exports functions only. Shared types
 * live in lib/invoices/config.ts.
 */

import { revalidatePath, updateTag } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";
import {
  ArenaForbiddenError,
  getActorName,
  requireArenaAdmin,
} from "@/utils/arena-auth";
import { InvoiceStatus } from "@/generated/prisma";
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  type InvoiceFeedPage,
  type InvoiceFeedParams,
  type InvoiceListParams,
  type InvoicePage,
} from "@/lib/invoices/config";
import {
  INVOICES_TAG,
  getAllInvoicesPage,
  getOrgInvoicesPage,
} from "@/lib/invoices/queries";
import { getOrgInvoiceFeed } from "@/lib/invoices/feed";

const TENANT_PATH = "/invoices";
const ARENA_PATH = "/arena-dashboard/invoices";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

// ===========================================================================
// READS
// ===========================================================================

/** Tenant: the caller org's own invoices. */
export async function listOrgInvoicesAction(
  params: InvoiceListParams,
): Promise<InvoicePage> {
  const orgId = await getDbOrgId();
  return getOrgInvoicesPage(orgId, params);
}

/**
 * Tenant: booking invoices and account bills in one list — what /invoices
 * renders. Same org lock as above: the id comes from the session, never the
 * params.
 */
export async function listOrgInvoiceFeedAction(
  params: InvoiceFeedParams,
): Promise<InvoiceFeedPage> {
  const orgId = await getDbOrgId();
  return getOrgInvoiceFeed(orgId, params);
}

/** Arena admin: every org's invoices, optionally filtered to one. */
export async function listAllInvoicesAction(
  params: InvoiceListParams,
): Promise<InvoicePage> {
  await requireArenaAdmin();
  return getAllInvoicesPage(params);
}

/** Arena admin: orgs to choose from when issuing an invoice. */
export async function listInvoiceOrgsAction(
  query?: string,
): Promise<{ id: string; label: string; sublabel: string | null }[]> {
  await requireArenaAdmin();

  const q = query?.trim();
  const orgs = await prisma.org.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { companyName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, companyName: true, email: true },
    orderBy: { name: "asc" },
    take: 20,
  });

  return orgs.map((o) => ({
    id: o.id,
    label: o.companyName?.trim() || o.name,
    sublabel: o.email ?? null,
  }));
}

/** Arena admin: shipments belonging to a chosen org, to attach an invoice to. */
export async function listOrgShipmentsForInvoiceAction(
  orgId: string,
  query?: string,
): Promise<{ id: string; label: string; sublabel: string | null }[]> {
  await requireArenaAdmin();
  if (!orgId) return [];

  const q = query?.trim();
  const shipments = await prisma.shipment.findMany({
    where: {
      orgId,
      status: { not: "DRAFT" },
      ...(q
        ? { shipmentNumber: { contains: q, mode: "insensitive" } }
        : {}),
    },
    select: {
      id: true,
      shipmentNumber: true,
      status: true,
      createdAt: true,
      deliveryAddress: { select: { city: true, country: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return shipments.map((s) => ({
    id: s.id,
    label: s.shipmentNumber,
    sublabel:
      [s.deliveryAddress?.city, s.deliveryAddress?.country]
        .filter(Boolean)
        .join(", ") || null,
  }));
}

// ===========================================================================
// WRITES (Arena admin only)
// ===========================================================================

function revalidateInvoiceViews() {
  revalidatePath(ARENA_PATH);
  revalidatePath(TENANT_PATH);
  // The invoice lists are also cached by unstable_cache, which revalidatePath
  // does not reach. Without this an issued invoice could sit invisible for the
  // cache's TTL even though the pages above were rebuilt.
  updateTag(INVOICES_TAG);
}

/** Issue a new invoice for an org (optionally attached to one of its shipments). */
export async function createInvoiceAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireArenaAdmin();

    const parsed = createInvoiceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const data = parsed.data;

    // The org must exist.
    const org = await prisma.org.findFirst({
      where: { id: data.orgId, deletedAt: null },
      select: { id: true },
    });
    if (!org) return { ok: false, error: "That organisation no longer exists." };

    // A shipment link, if given, must belong to that same org.
    if (data.shipmentId) {
      const shipment = await prisma.shipment.findFirst({
        where: { id: data.shipmentId, orgId: data.orgId },
        select: { id: true },
      });
      if (!shipment) {
        return {
          ok: false,
          error: "That shipment does not belong to the chosen organisation.",
        };
      }
    }

    // Invoice numbers are unique platform-wide, like a real accounting system.
    const clash = await prisma.invoice.findFirst({
      where: { invoiceNumber: data.invoiceNumber, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      return {
        ok: false,
        error: `Invoice number "${data.invoiceNumber}" is already in use.`,
      };
    }

    const actorName = await getActorName(admin.userId);

    const invoice = await prisma.invoice.create({
      data: {
        orgId: data.orgId,
        shipmentId: data.shipmentId ?? null,
        invoiceNumber: data.invoiceNumber,
        amount: data.amount,
        currency: data.currency || "INR",
        issueDate: new Date(data.issueDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes?.trim() || null,
        fileUrl: data.fileUrl,
        fileKey: data.fileKey,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        createdById: admin.userId,
        createdByName: actorName,
      },
      select: { id: true },
    });

    revalidateInvoiceViews();
    return { ok: true, data: { id: invoice.id } };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };
    Sentry.captureException(error, { tags: { location: "createInvoiceAction" } });
    return { ok: false, error: "Could not create the invoice. Please try again." };
  }
}

/** Edit an existing invoice's billing fields (not the PDF). */
export async function updateInvoiceAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    await requireArenaAdmin();

    const parsed = updateInvoiceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const data = parsed.data;

    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "That invoice no longer exists." };

    // Guard the unique invoice number against collisions with OTHER rows.
    const clash = await prisma.invoice.findFirst({
      where: {
        invoiceNumber: data.invoiceNumber,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (clash) {
      return {
        ok: false,
        error: `Invoice number "${data.invoiceNumber}" is already in use.`,
      };
    }

    await prisma.invoice.update({
      where: { id },
      data: {
        invoiceNumber: data.invoiceNumber,
        amount: data.amount,
        currency: data.currency || "INR",
        issueDate: new Date(data.issueDate),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes?.trim() || null,
      },
    });

    revalidateInvoiceViews();
    return { ok: true };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };
    Sentry.captureException(error, { tags: { location: "updateInvoiceAction" } });
    return { ok: false, error: "Could not update the invoice. Please try again." };
  }
}

/** Move an invoice between UNPAID / PAID / CANCELLED. */
export async function setInvoiceStatusAction(
  id: string,
  status: InvoiceStatus,
): Promise<ActionResult> {
  try {
    const admin = await requireArenaAdmin();

    if (
      status !== InvoiceStatus.UNPAID &&
      status !== InvoiceStatus.PAID &&
      status !== InvoiceStatus.CANCELLED
    ) {
      return { ok: false, error: "Unknown invoice status." };
    }

    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!existing) return { ok: false, error: "That invoice no longer exists." };
    if (existing.status === status) {
      revalidateInvoiceViews();
      return { ok: true };
    }

    const markingPaid = status === InvoiceStatus.PAID;
    const actorName = markingPaid ? await getActorName(admin.userId) : null;

    await prisma.invoice.update({
      where: { id },
      data: {
        status,
        // Stamp who/when on payment; clear it when moved back off PAID.
        paidAt: markingPaid ? new Date() : null,
        paidById: markingPaid ? admin.userId : null,
        paidByName: markingPaid ? actorName : null,
      },
    });

    revalidateInvoiceViews();
    return { ok: true };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };
    Sentry.captureException(error, { tags: { location: "setInvoiceStatusAction" } });
    return { ok: false, error: "Could not update the invoice status. Please try again." };
  }
}

/** Soft-delete an invoice. The PDF is left in storage; the row is hidden. */
export async function deleteInvoiceAction(id: string): Promise<ActionResult> {
  try {
    await requireArenaAdmin();

    const existing = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "That invoice no longer exists." };

    await prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    revalidateInvoiceViews();
    return { ok: true };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) return { ok: false, error: error.message };
    Sentry.captureException(error, { tags: { location: "deleteInvoiceAction" } });
    return { ok: false, error: "Could not delete the invoice. Please try again." };
  }
}
