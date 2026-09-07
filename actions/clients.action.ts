"use server";

import { revalidatePath, updateTag } from "next/cache";

import { CLIENT_ORG_OPTIONS_TAG } from "@/queries/clients";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import {
  clientSchema,
  type ClientFormValues,
} from "@/lib/validations/clients.schema";
import { ClientSearchResult } from "./clientSrearch.action";

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

/**
 * The same client list is rendered at two routes: the tenant's own at /clients
 * and Arena's cross-org one at /arena-dashboard/clients.
 *
 * Only the first used to be revalidated. Creating a client from the Arena screen
 * therefore left the table showing the list as it was before, and the row only
 * appeared after a hard reload — which reads exactly like the save having failed.
 * Both are refreshed here, in one place, so a third cannot be forgotten.
 */
function revalidateClientLists() {
  revalidatePath("/clients");
  revalidatePath("/arena-dashboard/clients");
}

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
        ...data,
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

    revalidateClientLists();
    // An org with no clients is absent from the Business Associate filter, so
    // the first client created for one changes that list. updateTag rather than
    // revalidateTag: this is a server action and the person who just added the
    // client should see the change on the next render, not the render after.
    // revalidateTag's "max" profile serves the stale list once first.
    updateTag(CLIENT_ORG_OPTIONS_TAG);
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
      data,
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

    revalidateClientLists();
    // Deleting an org's last client takes it back out of the filter list.
    updateTag(CLIENT_ORG_OPTIONS_TAG);
    return { success: true };
  } catch (error) {
    console.error("deleteClientAction", error);
    return { success: false, message: "Failed to delete client." };
  }
}