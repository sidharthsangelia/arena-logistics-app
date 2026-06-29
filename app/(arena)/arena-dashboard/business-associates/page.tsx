// app/arena-dashboard/business-associates/page.tsx

import BusinessAssociatesToolbar from "@/components/business-assoicates/BusinessAsscoiatesToolBar";
import BusinessAssociatesTable from "@/components/business-assoicates/BusinessAssociatesTable";
import { prisma } from "@/utils/db";
import type { Prisma } from "@/generated/prisma";

const PAGE_SIZE = 25;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
    page?: string;
  }>;
};

export default async function BusinessAssociatesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";
  const type =
    params.type === "ba" || params.type === "standard" ? params.type : "all";

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.OrgWhereInput = {
    deletedAt: null,
    ...(query && {
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { slug: { contains: query, mode: "insensitive" as const } },
      ],
    }),
    ...(type === "ba" && { isBusinessAssociate: true }),
    ...(type === "standard" && { isBusinessAssociate: false }),
  };

  const [orgs, total] = await Promise.all([
    prisma.org.findMany({
      where,
      include: {
        _count: {
          select: {
            clients: true,
            quotes: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),

    prisma.org.count({
      where,
    }),
  ]);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <BusinessAssociatesToolbar query={query} type={type} total={total} />

      <BusinessAssociatesTable
        orgs={orgs}
        page={page}
        query={query}
        type={type}
        total={total}
        pageSize={PAGE_SIZE}
        key={`${query}-${type}-${page}`}
      />
    </div>
  );
}