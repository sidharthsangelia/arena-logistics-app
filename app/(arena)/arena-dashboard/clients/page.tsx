// app/arena-dashboard/clients/page.tsx

import { prisma } from "@/utils/db";
import type { Prisma } from "@/generated/prisma";

import ClientsToolbar from "@/components/clients/ClientsToolbar";
 
import ClientsTableInternal from "@/components/clients/ClientsTableInternal";

const PAGE_SIZE = 25;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function ClientsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";

  const page = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const skip = (page - 1) * PAGE_SIZE;

  const where: Prisma.ClientWhereInput = {
    deletedAt: null,

    ...(query
      ? {
          OR: [
            {
              companyName: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              contactName: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              org: {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,

      include: {
        org: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },

      skip,
      take: PAGE_SIZE,
    }),

    prisma.client.count({
      where,
    }),
  ]);

  return (
    <>
      <ClientsToolbar />

      <ClientsTableInternal
        clients={clients}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        query={query}
      />
    </>
  );
}