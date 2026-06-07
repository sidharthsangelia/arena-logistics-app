"use server";
 
import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";
 
 
export interface ClientSearchResult {
  id:           string;
  companyName:  string;
  contactName:  string | null;
  email:        string | null;
  phone:        string | null;
  addressLine1: string | null;
  city:         string | null;
  state:        string | null;
  country:      string | null;
  postalCode:   string | null;
}
 
export async function searchClientsAction(
  query: string,
): Promise<ClientSearchResult[]> {
  const orgId   = await getDbOrgId();
  const trimmed = query.trim();
 
  return prisma.client.findMany({
    where: {
      orgId,          // ← only this org's clients
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { companyName: { contains: trimmed, mode: "insensitive" } },
              { contactName: { contains: trimmed, mode: "insensitive" } },
              { email:       { contains: trimmed, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id:           true,
      companyName:  true,
      contactName:  true,
      email:        true,
      phone:        true,
      addressLine1: true,
      city:         true,
      state:        true,
      country:      true,
      postalCode:   true,
    },
    orderBy: trimmed ? { companyName: "asc" } : { createdAt: "desc" },
    take: 20,
  });
}
 