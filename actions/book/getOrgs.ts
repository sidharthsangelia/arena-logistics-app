"use server";

import { prisma } from "@/utils/db";
import type { Org } from "@/generated/prisma";
import { resolveOrgContext, type OrgContext } from "@/actions/book/resolveOrg";

export type { OrgContext };

export async function getCurrentOrg(): Promise<Org> {
  const { org } = await resolveOrgContext();
  return org;
}

export async function getCurrentOrgContext(): Promise<OrgContext> {
  return resolveOrgContext();
}

export async function assertOrgOwnsClient(orgId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
  });
  if (!client) {
    throw new Error("Client not found, or does not belong to your organization.");
  }
  return client;
}

export async function assertOrgOwnsShipment(orgId: string, shipmentId: string) {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, orgId },
  });
  if (!shipment) {
    throw new Error("Shipment not found, or does not belong to your organization.");
  }
  return shipment;
}

export async function assertOrgOwnsAddress(orgId: string, addressId: string) {
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      deletedAt: null,
      OR: [{ orgId }, { client: { orgId, deletedAt: null } }],
    },
  });
  if (!address) {
    throw new Error("Address not found, or does not belong to your organization.");
  }
  return address;
}