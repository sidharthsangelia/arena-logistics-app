"use server";

import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/utils/db";
import { getCurrentOrg, assertOrgOwnsClient, assertOrgOwnsAddress } from "@/actions/book/getOrgs";
import { newAddressSchema } from "@/types/validations/booking";
import { ok, fail, type ActionResult, type AddressSummary, type Party } from "@/types/booking";
import type { AddressKind } from "@/generated/prisma";

async function resolveParty(party: Party, currentOrgId: string) {
  if (party.partyType === "ORG") {
    if (party.orgId !== currentOrgId) throw new Error("Org mismatch.");
    return { orgId: party.orgId as string | null, clientId: null as string | null };
  }
  await assertOrgOwnsClient(currentOrgId, party.clientId);
  return { orgId: null as string | null, clientId: party.clientId as string | null };
}

export async function listAddresses(
  party: Party,
  kind?: AddressKind,
): Promise<ActionResult<AddressSummary[]>> {
  try {
    const org = await getCurrentOrg();
    const { orgId, clientId } = await resolveParty(party, org.id);

    const addresses = await prisma.address.findMany({
      where: { orgId, clientId, deletedAt: null, ...(kind ? { kind } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return ok(addresses);
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "listAddresses" } });
    return fail(e instanceof Error ? e.message : "Could not load addresses.");
  }
}

export async function createAddress(
  party: Party,
  kind: AddressKind | null,
  input: unknown,
): Promise<ActionResult<AddressSummary>> {
  const parsed = newAddressSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Check the address fields and try again.", parsed.error.flatten().fieldErrors);
  }

  try {
    const org = await getCurrentOrg();
    const { orgId, clientId } = await resolveParty(party, org.id);
    const data = parsed.data;

    const address = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        // One primary per address kind (per owner), not one primary overall — a
        // booking needs a default pickup AND a default delivery AND billing.
        await tx.address.updateMany({
          where: { orgId, clientId, kind, deletedAt: null },
          data: { isDefault: false },
        });
      }
      return tx.address.create({
        data: {
          orgId,
          clientId,
          kind,
          label: data.label || null,
          contactName: data.contactName,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail || null,
          line1: data.line1,
          line2: data.line2 || null,
          city: data.city,
          state: data.state || null,
          country: data.country,
          postalCode: data.postalCode,
          isDefault: data.isDefault,
        },
      });
    });

    return ok(address);
  } catch (e) {
    Sentry.captureException(e, { tags: { action: "createAddress" } });
    return fail(e instanceof Error ? e.message : "Could not save address.");
  }
}

export async function getAddress(addressId: string): Promise<ActionResult<AddressSummary>> {
  try {
    const org = await getCurrentOrg();
    const address = await assertOrgOwnsAddress(org.id, addressId);
    return ok(address);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not load address.");
  }
}

export async function updateAddress(
  addressId: string,
  kind: AddressKind | null,
  input: unknown,
): Promise<ActionResult<AddressSummary>> {
  const parsed = newAddressSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Check the address fields and try again.", parsed.error.flatten().fieldErrors);
  }

  return Sentry.withScope(async () => {
    try {
      const org = await getCurrentOrg();
      // Ownership check — throws if this address isn't the org's (or its client's).
      const existing = await assertOrgOwnsAddress(org.id, addressId);
      const data = parsed.data;

      const address = await prisma.$transaction(async (tx) => {
        // A newly-flagged default demotes the other entries of the same owner
        // AND kind — the primary is per-kind, so it can't clash across types.
        if (data.isDefault) {
          await tx.address.updateMany({
            where: {
              orgId: existing.orgId,
              clientId: existing.clientId,
              kind,
              deletedAt: null,
              id: { not: addressId },
            },
            data: { isDefault: false },
          });
        }
        return tx.address.update({
          where: { id: addressId },
          data: {
            kind,
            label: data.label || null,
            contactName: data.contactName,
            contactPhone: data.contactPhone,
            contactEmail: data.contactEmail || null,
            line1: data.line1,
            line2: data.line2 || null,
            city: data.city,
            state: data.state || null,
            country: data.country,
            postalCode: data.postalCode,
            isDefault: data.isDefault,
          },
        });
      });

      return ok(address);
    } catch (e) {
      Sentry.captureException(e, { tags: { action: "updateAddress" } });
      console.error("updateAddress failed", e);
      return fail(e instanceof Error ? e.message : "Could not update address.");
    }
  });
}

export async function deleteAddress(addressId: string): Promise<ActionResult<{ id: string }>> {
  return Sentry.withScope(async () => {
    try {
      const org = await getCurrentOrg();
      await assertOrgOwnsAddress(org.id, addressId);
      // Soft delete — booked shipments keep pointing at the historical row.
      await prisma.address.update({
        where: { id: addressId },
        data: { deletedAt: new Date(), isDefault: false },
      });
      return ok({ id: addressId });
    } catch (e) {
      Sentry.captureException(e, { tags: { action: "deleteAddress" } });
      console.error("deleteAddress failed", e);
      return fail(e instanceof Error ? e.message : "Could not delete address.");
    }
  });
}

export async function setDefaultAddress(
  addressId: string,
): Promise<ActionResult<{ id: string }>> {
  return Sentry.withScope(async () => {
    try {
      const org = await getCurrentOrg();
      const existing = await assertOrgOwnsAddress(org.id, addressId);

      await prisma.$transaction(async (tx) => {
        // Clear the current primary for THIS kind only, then promote this one.
        await tx.address.updateMany({
          where: {
            orgId: existing.orgId,
            clientId: existing.clientId,
            kind: existing.kind,
            deletedAt: null,
          },
          data: { isDefault: false },
        });
        await tx.address.update({
          where: { id: addressId },
          data: { isDefault: true },
        });
      });

      return ok({ id: addressId });
    } catch (e) {
      Sentry.captureException(e, { tags: { action: "setDefaultAddress" } });
      console.error("setDefaultAddress failed", e);
      return fail(e instanceof Error ? e.message : "Could not update the primary address.");
    }
  });
}