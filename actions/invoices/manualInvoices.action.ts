"use server";

/**
 * actions/invoices/manualInvoices.action.ts
 *
 * Every read and write behind manual invoicing.
 *
 * ARENA ADMINS ONLY, without exception. Manual invoicing states what a customer
 * owes and creates a numbered tax document in Arena's name, which is money in
 * the sense utils/arena-auth.ts means it. Every function here calls
 * requireArenaAdmin() for itself rather than relying on the route gate, because
 * proxy.ts is an optimistic redirect and a direct POST to a server action never
 * passes through it.
 *
 * The one exception is listOrgManualInvoicesAction, the tenant read, which is
 * hard-scoped to the caller's own org from the session and can never be pointed
 * at another one.
 *
 * Note: this file is "use server", so it exports functions only. Shared types
 * live in lib/invoices/manual/config.ts.
 */

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";
import {
  ArenaForbiddenError,
  getActorName,
  requireArenaAdmin,
} from "@/utils/arena-auth";
import {
  ManualInvoiceDocType,
  ManualInvoiceStatus,
  Prisma,
} from "@/generated/prisma";
import { getInvoiceIssuer, issuerIsConfigured } from "@/lib/invoices/tax/config";
import { resolvePlaceOfSupply } from "@/lib/invoices/tax/gst";
import { allocateSeriesNumber } from "@/lib/invoices/tax/numbering";
import {
  billingPartySchema,
  chargePresetSchema,
  chargeTypeSchema,
  dueDateFor,
  DRAFT_NUMBER_PLACEHOLDER,
  manualInvoiceSchema,
  manualSeriesFor,
  type BillingPartyDefaults,
  type BillingPartyDetail,
  type BillingPartyOption,
  type ChargePresetOption,
  type ChargeTypeOption,
  type CustomerSearchResult,
  type CustomerSource,
  type ManualInvoiceDetail,
  type ManualInvoiceListParams,
  type ManualInvoicePage,
} from "@/lib/invoices/manual/config";
import {
  buildManualInvoiceDocument,
  computeManualMoney,
  manualInvoiceInclude,
  ManualInvoiceBuildError,
} from "@/lib/invoices/manual/build";
import {
  getBillingParty,
  getManualInvoiceDetail,
  getManualInvoicesPage,
  getOrgManualInvoicesPage,
  listChargePresets,
  listChargeTypes,
  searchBillingParties,
  searchInvoiceCustomers,
  searchIssuedInvoices,
} from "@/lib/invoices/manual/queries";
import {
  renderManualInvoicePdf,
  uploadManualInvoicePdf,
} from "@/lib/invoices/manual/pdf/render";
import { sendManualInvoiceEmail } from "@/lib/invoices/manual/email";

const ARENA_PATH = "/arena-dashboard/invoices";
const TENANT_PATH = "/invoices";

type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

/**
 * One place turns a thrown error into something a person can read. A
 * ManualInvoiceBuildError names a real, actionable problem with the invoice and
 * is safe to show; anything else is a bug and goes to Sentry with a generic
 * message, because leaking a Prisma error into a toast tells the admin nothing
 * and tells everyone else too much.
 */
function toMessage(error: unknown, location: string, fallback: string): string {
  if (error instanceof ArenaForbiddenError) return error.message;
  if (error instanceof ManualInvoiceBuildError) return error.message;
  Sentry.captureException(error, { tags: { location } });
  return fallback;
}

function revalidateBoth() {
  revalidatePath(ARENA_PATH);
  revalidatePath(TENANT_PATH);
}

// ===========================================================================
// READS
// ===========================================================================

export async function listManualInvoicesAction(
  params: ManualInvoiceListParams,
): Promise<ManualInvoicePage> {
  await requireArenaAdmin();
  return getManualInvoicesPage(params);
}

/** Tenant: the caller org's own manual invoices. Org id comes from the session. */
export async function listOrgManualInvoicesAction(
  params: ManualInvoiceListParams,
): Promise<ManualInvoicePage> {
  const orgId = await getDbOrgId();
  return getOrgManualInvoicesPage(orgId, params);
}

export async function getManualInvoiceAction(
  id: string,
): Promise<ManualInvoiceDetail | null> {
  await requireArenaAdmin();
  return getManualInvoiceDetail(id);
}

export async function searchBillingPartiesAction(
  query?: string,
): Promise<BillingPartyOption[]> {
  await requireArenaAdmin();
  return searchBillingParties(query);
}

/** Billing parties, signed-up orgs and BAs' clients, in one list. */
export async function searchInvoiceCustomersAction(
  query?: string,
): Promise<CustomerSearchResult[]> {
  await requireArenaAdmin();
  return searchInvoiceCustomers(query);
}

/**
 * Turn a signed-up org or a business associate's client into a billing party.
 *
 * Copies their details ONCE and records the link, so the same company is never
 * on the billing list twice. Idempotent: adopting an org that has already been
 * adopted returns the existing party rather than making a second one, which is
 * what makes it safe to call straight from the picker without checking first.
 *
 * The copy is deliberate rather than a live join. A tax invoice is a statement
 * about a moment, and an org that corrects its address next month must not
 * silently change what an invoice already issued to them says. The link is kept
 * for reporting and so the invoice reaches their dashboard; it is not a source
 * the document reads through.
 */
export async function adoptCustomerAction(
  source: CustomerSource,
  id: string,
): Promise<ActionResult<BillingPartyOption>> {
  try {
    const { userId } = await requireArenaAdmin();

    if (source === "PARTY") {
      const existing = await getBillingParty(id);
      if (!existing) return { ok: false, error: "That customer no longer exists." };
      return { ok: true, data: existing };
    }

    const already = await prisma.billingParty.findFirst({
      where: {
        deletedAt: null,
        ...(source === "ORG" ? { orgId: id } : { clientId: id }),
      },
      include: { org: { select: { name: true, companyName: true } } },
    });
    if (already) return { ok: true, data: toOption(already) };

    const issuer = getInvoiceIssuer();

    const draft =
      source === "ORG"
        ? await orgAsParty(id, issuer.stateCode)
        : await clientAsParty(id, issuer.stateCode);

    if (!draft) return { ok: false, error: "That customer no longer exists." };

    const created = await prisma.billingParty.create({
      data: {
        ...draft,
        createdById: userId,
        createdByName: await getActorName(userId),
      },
      include: { org: { select: { name: true, companyName: true } } },
    });

    revalidatePath(ARENA_PATH);
    return { ok: true, data: toOption(created) };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "adoptCustomerAction",
        "Could not add that customer. Try again.",
      ),
    };
  }
}

type PartyWithOrg = Prisma.BillingPartyGetPayload<{
  include: { org: { select: { name: true; companyName: true } } };
}>;

function toOption(row: PartyWithOrg): BillingPartyOption {
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
 * The state code comes from the GSTIN where there is one, because the GSTIN
 * carries the registered state and cannot be a typo that survives the checksum.
 * The seller fallback is NOT stored: it is a rendering decision, not a fact
 * about this customer, and persisting it would make a guess look certain.
 */
function resolveStoredStateCode(
  gstin: string | null,
  state: string | null,
  sellerStateCode: string,
): string | null {
  const place = resolvePlaceOfSupply({
    gstin,
    stateName: state,
    sellerStateCode,
  });
  return place.source === "sellerFallback" ? null : place.code;
}

async function orgAsParty(id: string, sellerStateCode: string) {
  const org = await prisma.org.findFirst({
    where: { id, deletedAt: null },
  });
  if (!org) return null;

  return {
    legalName: org.companyName ?? org.name,
    tradeName: org.companyName && org.companyName !== org.name ? org.name : null,
    gstin: org.gstin,
    contactName: org.contactName,
    email: org.email,
    phone: org.phone,
    addressLine1: org.addressLine1,
    city: org.city,
    state: org.state,
    stateCode: resolveStoredStateCode(org.gstin, org.state, sellerStateCode),
    postalCode: org.postalCode,
    country: org.country ?? "India",
    orgId: org.id,
  };
}

async function clientAsParty(id: string, sellerStateCode: string) {
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
  });
  if (!client) return null;

  return {
    legalName: client.companyName,
    gstin: client.gstin,
    contactName: client.contactName,
    email: client.email,
    phone: client.phone,
    addressLine1: client.addressLine1,
    city: client.city,
    state: client.state,
    stateCode: resolveStoredStateCode(client.gstin, client.state, sellerStateCode),
    postalCode: client.postalCode,
    country: client.country ?? "India",
    clientId: client.id,
    // Deliberately NOT linked to the BA's org. The client is the party being
    // billed; linking them to their business associate's org would put this
    // invoice in the BA's dashboard, which is somebody else's bill.
  };
}

export async function getBillingPartyAction(
  id: string,
): Promise<BillingPartyDetail | null> {
  await requireArenaAdmin();
  return getBillingParty(id);
}

export async function listChargeTypesAction(): Promise<ChargeTypeOption[]> {
  await requireArenaAdmin();
  return listChargeTypes();
}

export async function listChargePresetsAction(): Promise<ChargePresetOption[]> {
  await requireArenaAdmin();
  return listChargePresets();
}

export async function searchIssuedInvoicesAction(query?: string) {
  await requireArenaAdmin();
  return searchIssuedInvoices(query);
}

/**
 * Existing orgs and clients, so a new billing party can be linked to one rather
 * than duplicating a customer who is already on the platform.
 */
export async function searchLinkTargetsAction(query?: string): Promise<{
  orgs: Array<{ id: string; label: string; sublabel: string | null }>;
  clients: Array<{ id: string; label: string; sublabel: string | null }>;
}> {
  await requireArenaAdmin();
  const q = query?.trim();

  const [orgs, clients] = await Promise.all([
    prisma.org.findMany({
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
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, companyName: true, email: true },
    }),
    prisma.client.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { companyName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        companyName: true,
        email: true,
        org: { select: { name: true, companyName: true } },
      },
    }),
  ]);

  return {
    orgs: orgs.map((o) => ({
      id: o.id,
      label: o.companyName ?? o.name,
      sublabel: o.email,
    })),
    clients: clients.map((c) => ({
      id: c.id,
      label: c.companyName,
      sublabel: c.org?.companyName ?? c.org?.name ?? null,
    })),
  };
}

// ===========================================================================
// BILLING PARTIES
// ===========================================================================

/**
 * Create a party from inside the invoice form, without leaving it.
 *
 * The state code is resolved from the GSTIN when one is given, because the GSTIN
 * carries the registered state and cannot be a typo that survives the checksum,
 * whereas a hand-picked state can. See resolvePlaceOfSupply.
 */
export async function createBillingPartyAction(
  input: unknown,
): Promise<ActionResult<BillingPartyOption>> {
  try {
    const { userId } = await requireArenaAdmin();
    const parsed = billingPartySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const v = parsed.data;
    const issuer = getInvoiceIssuer();
    const place = resolvePlaceOfSupply({
      gstin: v.gstin,
      stateCode: v.stateCode,
      stateName: v.state,
      sellerStateCode: issuer.stateCode,
    });

    const created = await prisma.billingParty.create({
      data: {
        ...v,
        // Only stamp a resolved code when it came from something the customer
        // actually told us. The seller fallback is a rendering decision, not a
        // fact about this party, and storing it would make a guess look certain.
        stateCode:
          place.source === "sellerFallback" ? v.stateCode ?? null : place.code,
        createdById: userId,
        createdByName: await getActorName(userId),
      },
      include: { org: { select: { name: true, companyName: true } } },
    });

    revalidatePath(ARENA_PATH);
    return { ok: true, data: toOption(created) };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "createBillingPartyAction",
        "Could not save the customer. Try again.",
      ),
    };
  }
}

export async function updateBillingPartyAction(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    await requireArenaAdmin();
    const parsed = billingPartySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    await prisma.billingParty.update({
      where: { id },
      data: parsed.data,
    });

    revalidatePath(ARENA_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "updateBillingPartyAction",
        "Could not update the customer. Try again.",
      ),
    };
  }
}

// ===========================================================================
// CATALOG
// ===========================================================================

/** Add a charge type from inside the picker, when nothing matches what was typed. */
export async function createChargeTypeAction(
  input: unknown,
): Promise<ActionResult<ChargeTypeOption>> {
  try {
    await requireArenaAdmin();
    const parsed = chargeTypeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const existing = await prisma.chargeType.findUnique({
      where: { code: parsed.data.code },
      select: { id: true },
    });
    if (existing) {
      return { ok: false, error: "A charge with that code already exists." };
    }

    const created = await prisma.chargeType.create({
      data: { ...parsed.data, isSystem: false },
    });

    revalidatePath(ARENA_PATH);

    return {
      ok: true,
      data: {
        id: created.id,
        code: created.code,
        label: created.label,
        description: created.description,
        sacCode: created.sacCode,
        defaultRatePercent: created.defaultRatePercent.toNumber(),
        defaultReimbursement: created.defaultReimbursement,
        applicability: created.applicability,
        sortOrder: created.sortOrder,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "createChargeTypeAction",
        "Could not add the charge. Try again.",
      ),
    };
  }
}

export async function saveChargePresetAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await requireArenaAdmin();
    const parsed = chargePresetSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const { name, description, mode, lines } = parsed.data;

    // Upsert on the name: saving a preset twice under one name means "replace
    // it", which is what an admin refining a bundle expects.
    const saved = await prisma.chargePreset.upsert({
      where: { name },
      create: {
        name,
        description: description ?? null,
        mode: mode ?? null,
        lines: lines as unknown as Prisma.InputJsonValue,
        createdById: userId,
        createdByName: await getActorName(userId),
      },
      update: {
        description: description ?? null,
        mode: mode ?? null,
        lines: lines as unknown as Prisma.InputJsonValue,
        deletedAt: null,
      },
      select: { id: true },
    });

    revalidatePath(ARENA_PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "saveChargePresetAction",
        "Could not save the preset. Try again.",
      ),
    };
  }
}

export async function deleteChargePresetAction(
  id: string,
): Promise<ActionResult> {
  try {
    await requireArenaAdmin();
    await prisma.chargePreset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    revalidatePath(ARENA_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "deleteChargePresetAction",
        "Could not delete the preset. Try again.",
      ),
    };
  }
}

// ===========================================================================
// THE INVOICE
// ===========================================================================

/**
 * Create or replace a draft.
 *
 * Consignments and charges are DELETED AND REWRITTEN rather than diffed. The
 * form is a single editable document where rows are added, removed and
 * reordered freely, and a diff would need stable client-side ids for rows that
 * do not exist server-side yet. Rewriting is correct by construction and the
 * row counts here are tiny. Cascades handle the children.
 *
 * Refuses to touch anything that is not a DRAFT. An issued invoice is frozen,
 * and this is the check that makes that true rather than merely intended.
 */
export async function saveManualInvoiceAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await requireArenaAdmin();
    const parsed = manualInvoiceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const v = parsed.data;

    if (id) {
      const existing = await prisma.manualInvoice.findFirst({
        where: { id, deletedAt: null },
        select: { status: true },
      });
      if (!existing) return { ok: false, error: "That invoice no longer exists." };
      if (existing.status !== ManualInvoiceStatus.DRAFT) {
        return {
          ok: false,
          error:
            "This invoice has been issued and cannot be edited. Raise a credit note instead.",
        };
      }
    }

    const party = await prisma.billingParty.findFirst({
      where: { id: v.billingPartyId, deletedAt: null },
      select: { id: true, orgId: true, gstin: true, stateCode: true, state: true },
    });
    if (!party) return { ok: false, error: "Choose a customer for this invoice." };

    const issueDate = new Date(v.issueDate);
    const dueDate = v.dueDate
      ? new Date(v.dueDate)
      : dueDateFor(v.paymentTerms, issueDate);

    const issuer = getInvoiceIssuer();
    const place = v.placeOfSupplyCode
      ? { code: v.placeOfSupplyCode, name: null as string | null }
      : (() => {
          const r = resolvePlaceOfSupply({
            gstin: party.gstin,
            stateCode: party.stateCode,
            stateName: party.state,
            sellerStateCode: issuer.stateCode,
          });
          return { code: r.code, name: r.name };
        })();

    const scalar = {
      billingPartyId: party.id,
      // Denormalised so the tenant list can be scoped without walking through
      // the party, and so unlinking a party from its org later does not
      // retroactively hide invoices that org has already seen.
      orgId: party.orgId,
      docType: v.docType,
      relatedInvoiceId: v.relatedInvoiceId ?? null,
      mode: v.mode,
      csbCategory: v.csbCategory ?? null,
      issueDate,
      dueDate,
      paymentTerms: v.paymentTerms ?? null,
      reference: v.reference ?? null,
      currency: v.currency,
      taxMode: v.taxMode,
      reverseCharge: v.reverseCharge,
      placeOfSupplyCode: place.code,
      placeOfSupplyName: place.name,
      irn: v.irn ?? null,
      irnAckNo: v.irnAckNo ?? null,
      irnAckDate: v.irnAckDate ? new Date(v.irnAckDate) : null,
      irnQrData: v.irnQrData ?? null,
      notes: v.notes ?? null,
      termsOverride: v.termsOverride ?? null,
    };

    const children = {
      create: v.consignments.map((c, index) => ({
        sortOrder: index,
        awbNumber: c.awbNumber ?? null,
        mawbNumber: c.mawbNumber ?? null,
        bookingDate: c.bookingDate ? new Date(c.bookingDate) : null,
        origin: c.origin ?? null,
        originPostalCode: c.originPostalCode ?? null,
        originCity: c.originCity ?? null,
        originState: c.originState ?? null,
        originCountry: c.originCountry ?? null,
        destination: c.destination ?? null,
        destinationPostalCode: c.destinationPostalCode ?? null,
        destinationCity: c.destinationCity ?? null,
        destinationState: c.destinationState ?? null,
        destinationCountry: c.destinationCountry ?? null,
        serviceType: c.serviceType ?? null,
        originPort: c.originPort ?? null,
        destinationPort: c.destinationPort ?? null,
        flightNumber: c.flightNumber ?? null,
        airlineName: c.airlineName ?? null,
        forwarderName: c.forwarderName ?? null,
        subAgent: c.subAgent ?? null,
        pieces: c.pieces ?? null,
        grossWeightKg: c.grossWeightKg ?? null,
        chargeableWeightKg: c.chargeableWeightKg ?? null,
        boxCount: c.boxCount ?? null,
        palletCount: c.palletCount ?? null,
        cartonCount: c.cartonCount ?? null,
        goodsDescription: c.goodsDescription ?? null,
        particulars: c.particulars ?? null,
        exportInvoiceNo: c.exportInvoiceNo ?? null,
        referenceNo: c.referenceNo ?? null,
        shipperName: c.shipperName ?? null,
        consigneeName: c.consigneeName ?? null,
        containerNumber: c.containerNumber ?? null,
        jobNumber: c.jobNumber ?? null,
        notes: c.notes ?? null,
        charges: {
          create: c.charges.map((charge, chargeIndex) => ({
            sortOrder: chargeIndex,
            chargeTypeId: charge.chargeTypeId ?? null,
            label: charge.label,
            sacCode: charge.sacCode,
            rate: charge.rate,
            quantity: charge.quantity,
            amount: charge.amount,
            discount: charge.discount,
            ratePercent: charge.ratePercent,
            reimbursement: charge.reimbursement,
            notes: charge.notes ?? null,
          })),
        },
      })),
    };

    const savedId = await prisma.$transaction(async (tx) => {
      const invoiceId = id
        ? (
            await tx.manualInvoice.update({
              where: { id },
              data: { ...scalar, consignments: { deleteMany: {} } },
              select: { id: true },
            })
          ).id
        : (
            await tx.manualInvoice.create({
              data: {
                ...scalar,
                createdById: userId,
                createdByName: await getActorName(userId),
              },
              select: { id: true },
            })
          ).id;

      await tx.manualInvoice.update({
        where: { id: invoiceId },
        data: { consignments: children },
      });

      // Running totals for the list. Not authoritative: the issue path and the
      // PDF both recompute from the rows. A cache that disagreed with the
      // document would only ever be visible in the list, which is the least
      // harmful place for it and still worth keeping honest.
      const fresh = await tx.manualInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: manualInvoiceInclude,
      });
      const { money } = computeManualMoney(fresh, issuer.stateCode);

      await tx.manualInvoice.update({
        where: { id: invoiceId },
        data: {
          taxableValue: money.taxableValue,
          cgstAmount: money.cgstAmount,
          sgstAmount: money.sgstAmount,
          igstAmount: money.igstAmount,
          totalTax: money.totalTax,
          reimbursements: money.reimbursements,
          total: money.total,
        },
      });

      return invoiceId;
    });

    // Remember what this customer was billed with, so the next invoice to them
    // opens most of the way filled in.
    await rememberPartyDefaults(party.id, v);

    revalidatePath(ARENA_PATH);
    return { ok: true, data: { id: savedId } };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "saveManualInvoiceAction",
        "Could not save the invoice. Try again.",
      ),
    };
  }
}

/**
 * Best-effort. A failure here costs the next invoice a few pre-filled fields
 * and nothing else, so it must never fail the save that just succeeded.
 */
async function rememberPartyDefaults(
  partyId: string,
  v: {
    currency: string;
    taxMode: BillingPartyDefaults["taxMode"];
    paymentTerms?: string | null;
    mode: BillingPartyDefaults["mode"];
    csbCategory?: string | null;
    consignments: Array<{ charges: Array<{ label: string }> }>;
  },
): Promise<void> {
  try {
    const labels = [
      ...new Set(v.consignments.flatMap((c) => c.charges.map((ch) => ch.label))),
    ].slice(0, 20);

    const defaults: BillingPartyDefaults = {
      currency: v.currency,
      taxMode: v.taxMode,
      paymentTerms: v.paymentTerms ?? undefined,
      mode: v.mode,
      csbCategory: v.csbCategory ?? null,
      chargeTypeCodes: labels,
    };

    await prisma.billingParty.update({
      where: { id: partyId },
      data: { defaults: defaults as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "rememberPartyDefaults" },
      extra: { partyId },
    });
  }
}

/**
 * Render a draft to a PDF and hand it back, without numbering or storing it.
 *
 * ── WHY THIS RENDERS THE REAL TEMPLATE ──────────────────────────────────────
 * The point of a preview is to answer "is this what the customer will get",
 * and an HTML approximation of the document answers a different, easier
 * question. So this calls buildManualInvoiceDocument and the same renderer the
 * issue path calls, with two differences and only two: the number is a
 * placeholder, and `draft` marks the page. Everything else, including the
 * money, the roll-up and the layout, is byte-for-byte what issuing produces.
 *
 * ── WHY IT PREVIEWS A SAVED ROW RATHER THAN THE FORM ────────────────────────
 * The caller saves the draft first, exactly as issuing does. Rendering
 * unsaved form state would mean a second path from payload to document that
 * could drift from the stored one, and the whole reason the money engine is a
 * single pure module is to not have two of anything.
 *
 * Nothing is uploaded and no counter is touched, so this is free to call as
 * often as anybody likes.
 */
export async function previewManualInvoiceAction(
  id: string,
): Promise<ActionResult<{ pdf: string; fileName: string }>> {
  try {
    await requireArenaAdmin();

    const invoice = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      include: manualInvoiceInclude,
    });
    if (!invoice) return { ok: false, error: "That invoice no longer exists." };

    // An issued invoice previews under its real number: at that point the
    // document is the document, and pretending otherwise would be a lie in the
    // other direction.
    const issued = !!invoice.invoiceNumber;

    const { data } = buildManualInvoiceDocument(invoice, {
      invoiceNumber: invoice.invoiceNumber ?? DRAFT_NUMBER_PLACEHOLDER,
      cancelled: invoice.status === ManualInvoiceStatus.CANCELLED,
      draft: !issued,
    });

    const rendered = await renderManualInvoicePdf(data);

    return {
      ok: true,
      data: {
        // Base64 rather than a stored file. A preview that leaves a URL behind
        // is a preview somebody can forward, and this one is explicitly not an
        // invoice yet.
        pdf: rendered.buffer.toString("base64"),
        fileName: rendered.fileName,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "previewManualInvoiceAction",
        "Could not build the preview. Try again.",
      ),
    };
  }
}

/**
 * Issue a draft: allocate the serial, freeze the snapshots, render the PDF,
 * upload it, and make the row immutable.
 *
 * ── WHY THE RENDER IS INSIDE THE TRANSACTION ────────────────────────────────
 * The counter row is locked from the moment the number is taken until this
 * transaction commits, so holding it across a render is normally exactly the
 * wrong thing to do. The booking invoice job splits them for that reason.
 *
 * It is right here, and only here, because the alternative is worse: a render
 * that fails after the number is committed leaves a permanent hole in a series
 * whose whole purpose is not having holes. The contention that buys is nil.
 * Manual invoices are issued by a handful of admins at human speed, and the ARM
 * counter is a different row from the booking series, so this lock cannot
 * delay a single customer booking.
 *
 * The money is verified BEFORE the transaction opens, so an invoice that does
 * not add up fails without ever reaching the counter.
 *
 * One thing this does leak: an upload that succeeds and is then rolled back
 * leaves an orphaned file on UploadThing. That is garbage, not corruption, and
 * it is the right side of the trade against a gap in the series.
 */
export async function issueManualInvoiceAction(
  id: string,
): Promise<ActionResult<{ invoiceNumber: string; fileUrl: string }>> {
  try {
    await requireArenaAdmin();

    if (!issuerIsConfigured()) {
      return {
        ok: false,
        error:
          "Arena's own invoice details are not filled in yet. Set the INVOICE_ISSUER_* variables before issuing anything.",
      };
    }

    const invoice = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      include: manualInvoiceInclude,
    });
    if (!invoice) return { ok: false, error: "That invoice no longer exists." };
    if (invoice.status !== ManualInvoiceStatus.DRAFT) {
      return { ok: false, error: "This invoice has already been issued." };
    }
    if (!invoice.consignments.some((c) => c.charges.length > 0)) {
      return {
        ok: false,
        error: "Add at least one charge before issuing this invoice.",
      };
    }

    // Dry run: proves the money adds up and the document builds, before the
    // counter is touched. buildManualInvoiceDocument throws on a broken
    // invariant, which toMessage passes through verbatim.
    buildManualInvoiceDocument(invoice, { invoiceNumber: "PREFLIGHT" });

    const { series, prefix } = manualSeriesFor(invoice.docType);

    const result = await prisma.$transaction(
      async (tx) => {
        const allocated = await allocateSeriesNumber(
          tx,
          series,
          prefix,
          invoice.issueDate,
        );

        const { data, money } = buildManualInvoiceDocument(invoice, {
          invoiceNumber: allocated.invoiceNumber,
        });

        const rendered = await renderManualInvoicePdf(data);
        const uploaded = await uploadManualInvoicePdf(rendered);

        await tx.manualInvoice.update({
          where: { id },
          data: {
            invoiceNumber: allocated.invoiceNumber,
            financialYear: allocated.financialYear,
            status: ManualInvoiceStatus.ISSUED,
            issuedAt: new Date(),

            placeOfSupplyCode: data.placeOfSupplyCode,
            placeOfSupplyName: data.placeOfSupplyName,

            taxableValue: money.taxableValue,
            cgstAmount: money.cgstAmount,
            sgstAmount: money.sgstAmount,
            igstAmount: money.igstAmount,
            totalTax: money.totalTax,
            reimbursements: money.reimbursements,
            total: money.total,
            taxNote: data.taxNote,

            sellerSnapshot: data.seller as unknown as Prisma.InputJsonValue,
            buyerSnapshot: data.buyer as unknown as Prisma.InputJsonValue,
            consignmentSnapshot:
              data.consignments as unknown as Prisma.InputJsonValue,
            lineItems: data.lineItems as unknown as Prisma.InputJsonValue,

            fileUrl: uploaded.fileUrl,
            fileKey: uploaded.fileKey,
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            mimeType: uploaded.mimeType,
          },
        });

        return {
          invoiceNumber: allocated.invoiceNumber,
          fileUrl: uploaded.fileUrl,
        };
      },
      // A render plus an upload comfortably exceeds Prisma's 5s default.
      { timeout: 60_000, maxWait: 15_000 },
    );

    revalidateBoth();
    return { ok: true, data: result };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "issueManualInvoiceAction",
        "Could not issue the invoice. Nothing was numbered; try again.",
      ),
    };
  }
}

/**
 * Copy an invoice into a fresh draft.
 *
 * The single biggest time saver on a repeat customer: everything but the number,
 * the dates and the PDF comes across, so what is left is the AWB and the
 * amounts. Deliberately does NOT copy the IRN, which belongs to exactly one
 * document, or the cancellation.
 */
export async function duplicateManualInvoiceAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await requireArenaAdmin();

    const source = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      include: manualInvoiceInclude,
    });
    if (!source) return { ok: false, error: "That invoice no longer exists." };

    const issueDate = new Date();
    const dueDate = dueDateFor(source.paymentTerms, issueDate);

    const created = await prisma.manualInvoice.create({
      data: {
        billingPartyId: source.billingPartyId,
        orgId: source.orgId,
        // Always a fresh tax invoice. Duplicating a credit note into another
        // credit note would carry over the invoice it reverses, which is never
        // what the second one reverses.
        docType: ManualInvoiceDocType.TAX_INVOICE,
        mode: source.mode,
        csbCategory: source.csbCategory,
        issueDate,
        dueDate,
        paymentTerms: source.paymentTerms,
        currency: source.currency,
        taxMode: source.taxMode,
        reverseCharge: source.reverseCharge,
        placeOfSupplyCode: source.placeOfSupplyCode,
        placeOfSupplyName: source.placeOfSupplyName,
        notes: source.notes,
        termsOverride: source.termsOverride,
        createdById: userId,
        createdByName: await getActorName(userId),
        consignments: {
          create: source.consignments.map((c, index) => ({
            sortOrder: index,
            awbNumber: c.awbNumber,
            mawbNumber: c.mawbNumber,
            bookingDate: c.bookingDate,
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
            grossWeightKg: c.grossWeightKg,
            chargeableWeightKg: c.chargeableWeightKg,
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
            charges: {
              create: c.charges.map((charge, chargeIndex) => ({
                sortOrder: chargeIndex,
                chargeTypeId: charge.chargeTypeId,
                label: charge.label,
                sacCode: charge.sacCode,
                rate: charge.rate,
                quantity: charge.quantity,
                amount: charge.amount,
                discount: charge.discount,
                ratePercent: charge.ratePercent,
                reimbursement: charge.reimbursement,
                notes: charge.notes,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath(ARENA_PATH);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "duplicateManualInvoiceAction",
        "Could not duplicate the invoice. Try again.",
      ),
    };
  }
}

/**
 * Open a credit note against an issued invoice, pre-filled with its lines.
 *
 * An admin then deletes or reduces whatever is not being credited and issues it,
 * which is the correction path for an invoice that is already frozen.
 */
export async function createCreditNoteAction(
  invoiceId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await requireArenaAdmin();

    const source = await prisma.manualInvoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      include: manualInvoiceInclude,
    });
    if (!source) return { ok: false, error: "That invoice no longer exists." };
    if (source.status === ManualInvoiceStatus.DRAFT) {
      return {
        ok: false,
        error: "That invoice has not been issued, so edit it instead.",
      };
    }
    if (source.docType === ManualInvoiceDocType.CREDIT_NOTE) {
      return { ok: false, error: "You cannot credit a credit note." };
    }

    const existing = await prisma.manualInvoice.findFirst({
      where: {
        relatedInvoiceId: invoiceId,
        docType: ManualInvoiceDocType.CREDIT_NOTE,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, data: { id: existing.id } };
    }

    const created = await prisma.manualInvoice.create({
      data: {
        billingPartyId: source.billingPartyId,
        orgId: source.orgId,
        docType: ManualInvoiceDocType.CREDIT_NOTE,
        relatedInvoiceId: source.id,
        mode: source.mode,
        csbCategory: source.csbCategory,
        issueDate: new Date(),
        currency: source.currency,
        taxMode: source.taxMode,
        reverseCharge: source.reverseCharge,
        placeOfSupplyCode: source.placeOfSupplyCode,
        placeOfSupplyName: source.placeOfSupplyName,
        reference: source.invoiceNumber,
        createdById: userId,
        createdByName: await getActorName(userId),
        consignments: {
          create: source.consignments.map((c, index) => ({
            sortOrder: index,
            awbNumber: c.awbNumber,
            origin: c.origin,
            destination: c.destination,
            serviceType: c.serviceType,
            pieces: c.pieces,
            grossWeightKg: c.grossWeightKg,
            chargeableWeightKg: c.chargeableWeightKg,
            goodsDescription: c.goodsDescription,
            charges: {
              create: c.charges.map((charge, chargeIndex) => ({
                sortOrder: chargeIndex,
                chargeTypeId: charge.chargeTypeId,
                label: charge.label,
                sacCode: charge.sacCode,
                rate: charge.rate,
                quantity: charge.quantity,
                amount: charge.amount,
                discount: charge.discount,
                ratePercent: charge.ratePercent,
                reimbursement: charge.reimbursement,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });

    revalidatePath(ARENA_PATH);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "createCreditNoteAction",
        "Could not start a credit note. Try again.",
      ),
    };
  }
}

export async function setManualInvoicePaidAction(
  id: string,
  paid: boolean,
): Promise<ActionResult> {
  try {
    const { userId } = await requireArenaAdmin();

    const invoice = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!invoice) return { ok: false, error: "That invoice no longer exists." };
    if (invoice.status === ManualInvoiceStatus.DRAFT) {
      return { ok: false, error: "Issue the invoice before marking it paid." };
    }
    if (invoice.status === ManualInvoiceStatus.CANCELLED) {
      return { ok: false, error: "This invoice has been cancelled." };
    }

    await prisma.manualInvoice.update({
      where: { id },
      data: paid
        ? {
            status: ManualInvoiceStatus.PAID,
            paidAt: new Date(),
            paidById: userId,
            paidByName: await getActorName(userId),
          }
        : {
            status: ManualInvoiceStatus.ISSUED,
            paidAt: null,
            paidById: null,
            paidByName: null,
          },
    });

    revalidateBoth();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "setManualInvoicePaidAction",
        "Could not update the invoice. Try again.",
      ),
    };
  }
}

/**
 * Void an issued invoice. The number and the PDF survive: an issued serial
 * cannot be withdrawn from existence, and a hole where one used to be is worse
 * than a document marked cancelled.
 */
export async function cancelManualInvoiceAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    await requireArenaAdmin();

    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      return { ok: false, error: "Say why this invoice is being cancelled." };
    }

    const invoice = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!invoice) return { ok: false, error: "That invoice no longer exists." };
    if (invoice.status === ManualInvoiceStatus.DRAFT) {
      return { ok: false, error: "Delete the draft instead of cancelling it." };
    }

    await prisma.manualInvoice.update({
      where: { id },
      data: {
        status: ManualInvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledReason: trimmed.slice(0, 500),
      },
    });

    revalidateBoth();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "cancelManualInvoiceAction",
        "Could not cancel the invoice. Try again.",
      ),
    };
  }
}

/** Drafts only. An issued invoice is never deleted; it is cancelled or credited. */
export async function deleteManualInvoiceDraftAction(
  id: string,
): Promise<ActionResult> {
  try {
    await requireArenaAdmin();

    const invoice = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!invoice) return { ok: false, error: "That invoice no longer exists." };
    if (invoice.status !== ManualInvoiceStatus.DRAFT) {
      return {
        ok: false,
        error:
          "An issued invoice cannot be deleted. Cancel it or raise a credit note.",
      };
    }

    await prisma.manualInvoice.delete({ where: { id } });

    revalidatePath(ARENA_PATH);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "deleteManualInvoiceDraftAction",
        "Could not delete the draft. Try again.",
      ),
    };
  }
}

/**
 * Email the issued PDF to the customer.
 *
 * `lastSentAt` is written only when Resend accepted the message, so the list can
 * honestly say whether the customer has actually been sent their invoice rather
 * than whether somebody once pressed the button.
 */
export async function emailManualInvoiceAction(
  id: string,
  toOverride?: string,
): Promise<ActionResult<{ sentTo: string }>> {
  try {
    await requireArenaAdmin();

    const invoice = await prisma.manualInvoice.findFirst({
      where: { id, deletedAt: null },
      include: { billingParty: true },
    });
    if (!invoice) return { ok: false, error: "That invoice no longer exists." };
    if (invoice.status === ManualInvoiceStatus.DRAFT || !invoice.fileUrl) {
      return { ok: false, error: "Issue the invoice before sending it." };
    }

    const to = (toOverride ?? invoice.billingParty.email ?? "").trim();
    if (!to) {
      return {
        ok: false,
        error: "This customer has no email address. Add one, or type one to send to.",
      };
    }

    const sent = await sendManualInvoiceEmail({
      to,
      invoiceNumber: invoice.invoiceNumber ?? "",
      partyName: invoice.billingParty.legalName,
      total: invoice.total.toNumber(),
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      docType: invoice.docType,
      fileUrl: invoice.fileUrl,
      fileName: invoice.fileName ?? "invoice.pdf",
    });

    if (!sent) {
      return { ok: false, error: "The email could not be sent. Try again." };
    }

    await prisma.manualInvoice.update({
      where: { id },
      data: { lastSentAt: new Date(), lastSentTo: to },
    });

    revalidatePath(ARENA_PATH);
    return { ok: true, data: { sentTo: to } };
  } catch (error) {
    return {
      ok: false,
      error: toMessage(
        error,
        "emailManualInvoiceAction",
        "Could not send the invoice. Try again.",
      ),
    };
  }
}
