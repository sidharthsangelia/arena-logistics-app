"use server"
import { auth } from "@clerk/nextjs/server";
 
import type { Org } from "@/generated/prisma";
import { prisma } from "@/utils/db";

/**
 * Every login on this platform is an Org (solo customer or BA — same model,
 * see ARCHITECTURE.md §1). There is no "logged in but no Org" state once
 * onboarding is complete, so a missing Org row here is a real error, not a
 * permissions check — surface it loudly instead of quietly redirecting.
 */
export class NoActiveOrgError extends Error {
  constructor() {
    super("No active Org for the current session.");
    this.name = "NoActiveOrgError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Resolves the signed-in Clerk org to our Org row.
 *
 * Assumption: this app puts users into a Clerk Organization 1:1 with our
 * `Org` model (`Org.clerkOrgId` mirrors Clerk's `orgId`). If this project
 * instead uses Clerk personal accounts only, swap `orgId` below for
 * `userId` and key `Org.clerkOrgId` off that — the rest of this file is
 * unaffected either way.
 */
export async function getCurrentOrg(): Promise<Org> {
  const { org } = await getCurrentOrgContext();
  return org;
}

export interface OrgContext {
  org: Org;
  userId: string;
}

/** Same resolution as `getCurrentOrg`, but also returns the Clerk userId for audit-trail fields (`changedById`, `uploadedById`, etc). */
export async function getCurrentOrgContext(): Promise<OrgContext> {
  const { userId, orgId } = await auth();

  if (!userId) throw new UnauthenticatedError();
  if (!orgId) throw new NoActiveOrgError();

  const org = await prisma.org.findUnique({ where: { clerkOrgId: orgId } });
  if (!org) throw new NoActiveOrgError();
  if (org.deletedAt) throw new NoActiveOrgError();

  return { org, userId };
}

/** Throws unless `clientId` belongs to the current org. Returns the Client row. */
export async function assertOrgOwnsClient(orgId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, orgId, deletedAt: null },
  });
  if (!client) {
    throw new Error("Client not found, or does not belong to your organization.");
  }
  return client;
}

/** Throws unless `shipmentId` belongs to the current org. Returns the Shipment row. */
export async function assertOrgOwnsShipment(orgId: string, shipmentId: string) {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, orgId },
  });
  if (!shipment) {
    throw new Error("Shipment not found, or does not belong to your organization.");
  }
  return shipment;
}

/** Throws unless `addressId` belongs to the org itself OR one of the org's clients. */
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