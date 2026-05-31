"use server";

import { prisma } from "@/utils/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientSearchResult {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
}

// ---------------------------------------------------------------------------
// searchClientsAction
//
// Used by the QuoteSheet client-selector combobox.
// Returns up to 20 matches ordered by company name.
// An empty query returns the 20 most-recently created clients so the
// dropdown is immediately useful without typing.
// ---------------------------------------------------------------------------

export async function searchClientsAction(
  query: string,
): Promise<ClientSearchResult[]> {
  const trimmed = query.trim();

  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { companyName: { contains: trimmed, mode: "insensitive" } },
              { contactName: { contains: trimmed, mode: "insensitive" } },
              { email: { contains: trimmed, mode: "insensitive" } },
            ],
          }
        : {}),
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
    orderBy: trimmed ? { companyName: "asc" } : { createdAt: "desc" },
    take: 20,
  });

  return clients;
}