"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/utils/db";
import {
  clientSchema,
  type ClientFormValues,
} from "@/lib/validations/clients.schema";
import { ClientSearchResult } from "./clientSrearch.action";


// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

type ActionResult =
  | { success: true }
  | { success: false; message: string };

// ---------------------------------------------------------------------------
// createClientAction
//
// CHANGED: now returns the full created record so callers (e.g. AddClientForm
// inside QuoteSheet) can pre-populate the client selector without a second
// round-trip to the DB.
// ---------------------------------------------------------------------------

export type CreateClientResult =
  | { success: true; client: ClientSearchResult }
  | { success: false; message: string };

export async function createClientAction(
  input: ClientFormValues,
): Promise<CreateClientResult> {
  try {
    const data = clientSchema.parse(input);

    const created = await prisma.client.create({
      data,
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
    const data = clientSchema.parse(input);

    await prisma.client.update({ where: { id }, data });

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
    await prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    revalidatePath("/clients");
    return { success: true };
  } catch (error) {
    console.error("deleteClientAction", error);
    return { success: false, message: "Failed to delete client." };
  }
}