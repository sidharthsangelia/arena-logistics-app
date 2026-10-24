"use server";


import { revalidateClientLists } from "@/lib/clients/revalidate";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import {
  clientSchema,
  type ClientFormValues,
} from "@/lib/validations/clients.schema";
import { ClientSearchResult } from "./clientSrearch.action";
import * as Sentry from "@sentry/nextjs";
import { maskAadhaar } from "@/lib/kyc/idNumbers";
import { encryptAadhaar } from "@/lib/kyc/aadhaarVault";

// ---------------------------------------------------------------------------
// Identity numbers typed into the client form
// ---------------------------------------------------------------------------

type ParsedClient = ReturnType<typeof clientSchema.parse>;

/**
 * The form's fields split into the columns they are stored in. The Aadhaar is
 * never stored as typed: masked for display, encrypted for carriers.
 *
 * On an edit (`sent` is the raw input), a field the form did not send is left
 * alone, so a form without these inputs cannot wipe them. A blank Aadhaar also
 * means "unchanged", because the form cannot show the one on file. GSTIN and
 * PAN are shown, so a blank one that was sent genuinely clears it.
 */
function toClientColumns(data: ParsedClient, sent?: ClientFormValues) {
  const isEdit = sent !== undefined;
  const { gstin, panNumber, aadhaarNumber, companyKind, companyName, ...rest } = data;

  const aadhaar: { aadhaarMasked?: string | null; aadhaarEncrypted?: string | null } = {};
  if (aadhaarNumber) {
    aadhaar.aadhaarMasked = maskAadhaar(aadhaarNumber);
    aadhaar.aadhaarEncrypted = encryptAadhaar(aadhaarNumber);
    if (!aadhaar.aadhaarEncrypted) {
      Sentry.captureMessage("AADHAAR_ENCRYPTION_KEY is not set; Aadhaar kept masked only", {
        level: "error",
        tags: { action: "clientForm" },
      });
    }
  } else if (!isEdit) {
    aadhaar.aadhaarMasked = null;
    aadhaar.aadhaarEncrypted = null;
  }

  return {
    ...rest,
    companyKind,
    // Client.companyName is the display name everywhere, so an individual's is
    // their own name (lib/clients/clientKind.ts). The schema guarantees whichever
    // of the two this needs is present.
    companyName: companyKind === "INDIVIDUAL" ? rest.contactName! : companyName!,
    ...(!isEdit || sent.gstin !== undefined ? { gstin: gstin || null } : {}),
    ...(!isEdit || sent.panNumber !== undefined ? { panNumber: panNumber || null } : {}),
    ...aadhaar,
  };
}

// ---------------------------------------------------------------------------
// Tenant context
// Resolves Clerk orgId → internal DB Org.id
// ---------------------------------------------------------------------------

async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) throw new Error("No active organisation in session.");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });

  if (!org) throw new Error(`Org not found for clerkOrgId: ${clerkOrgId}`);

  return org.id;
}

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

type ActionResult =
  | { success: true }
  | { success: false; message: string };

export type CreateClientResult =
  | { success: true; client: ClientSearchResult }
  | { success: false; message: string };

// ---------------------------------------------------------------------------
// createClientAction
// ---------------------------------------------------------------------------

export async function createClientAction(
  input: ClientFormValues,
): Promise<CreateClientResult> {
  try {
    const orgId = await getDbOrgId();
    const data = clientSchema.parse(input);

    const created = await prisma.client.create({
      data: {
        ...toClientColumns(data),
        orgId,
      },
      select: {
        companyKind: true,
        id: true,
        companyName: true,
        contactName: true,
        email: true,
        phone: true,
        addressLine1: true,
        city: true,
        state: true,
        country: true,
        postalCode: true,
      },
    });

    revalidateClientLists({ membershipChanged: true });
    return { success: true, client: created };
  } catch (error) {
    console.error("createClientAction", error);
    return { success: false, message: "Failed to create client." };
  }
}

// ---------------------------------------------------------------------------
// updateClientAction
// ---------------------------------------------------------------------------

export async function updateClientAction(
  id: string,
  input: ClientFormValues,
): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();
    const data = clientSchema.parse(input);

    await prisma.client.update({
      where: { id, orgId },
      data: toClientColumns(data, input),
    });

    revalidateClientLists();
    return { success: true };
  } catch (error) {
    console.error("updateClientAction", error);
    return { success: false, message: "Failed to update client." };
  }
}

// ---------------------------------------------------------------------------
// deleteClientAction  (soft-delete)
// ---------------------------------------------------------------------------

export async function deleteClientAction(id: string): Promise<ActionResult> {
  try {
    const orgId = await getDbOrgId();

    await prisma.client.update({
      where: { id, orgId },
      data: { deletedAt: new Date() },
    });

    revalidateClientLists({ membershipChanged: true });
    return { success: true };
  } catch (error) {
    console.error("deleteClientAction", error);
    return { success: false, message: "Failed to delete client." };
  }
}