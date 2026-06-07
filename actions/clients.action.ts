"use server";

import { revalidatePath } from "next/cache";
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

    revalidatePath("/clients");
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

    revalidatePath("/clients");
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

    revalidatePath("/clients");
    return { success: true };
  } catch (error) {
    console.error("deleteClientAction", error);
    return { success: false, message: "Failed to delete client." };
  }
}