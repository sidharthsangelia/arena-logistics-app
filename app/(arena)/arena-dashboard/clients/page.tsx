import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/utils/db";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma";
import ClientsToolbar from "@/components/clients/ClientsToolbar";
import ClientsTable from "@/components/clients/ClientsTable";

const PAGE_SIZE = 25;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

async function getDbOrgId(): Promise<string> {
  const { orgId: clerkOrgId } = await auth();
  if (!clerkOrgId) redirect("/onboarding");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId },
    select: { id: true },
  });
  if (!org) redirect("/onboarding");

  return org.id;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const [orgId, params] = await Promise.all([
    getDbOrgId(),
    searchParams,
  ]);

  const query = params.q?.trim() ?? "";
  const page  = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const skip  = (page - 1) * PAGE_SIZE;

  const where: Prisma.ClientWhereInput = {
    orgId,          // ← only this org's clients
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { companyName: { contains: query, mode: "insensitive" } },
            { contactName: { contains: query, mode: "insensitive" } },
            { email:       { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { companyName: "asc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.client.count({ where }),
  ]);

  return (
    <>
      <ClientsToolbar />
      <ClientsTable
        clients={clients}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        query={query}
      />
    </>
  );
}