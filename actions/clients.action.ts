"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/utils/db";

import {
  clientSchema,
  type ClientFormValues,
} from "@/lib/validations/clients.schema";

type ActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      message: string;
    };

export async function createClientAction(
  input: ClientFormValues,
): Promise<ActionResult> {
  try {
    const data = clientSchema.parse(input);

    await prisma.client.create({
      data,
    });

    revalidatePath("/clients");

    return {
      success: true,
    };
  } catch (error) {
    console.error("createClientAction", error);

    return {
      success: false,
      message: "Failed to create client",
    };
  }
}

export async function updateClientAction(
  id: string,
  input: ClientFormValues,
): Promise<ActionResult> {
  try {
    const data = clientSchema.parse(input);

    await prisma.client.update({
      where: {
        id,
      },
      data,
    });

    revalidatePath("/clients");

    return {
      success: true,
    };
  } catch (error) {
    console.error("updateClientAction", error);

    return {
      success: false,
      message: "Failed to update client",
    };
  }
}

export async function deleteClientAction(
  id: string,
): Promise<ActionResult> {
  try {
    await prisma.client.update({
      where: {
        id,
      },

      data: {
        deletedAt: new Date(),
      },
    });

    revalidatePath("/clients");

    return {
      success: true,
    };
  } catch (error) {
    console.error("deleteClientAction", error);

    return {
      success: false,
      message: "Failed to delete client",
    };
  }
}