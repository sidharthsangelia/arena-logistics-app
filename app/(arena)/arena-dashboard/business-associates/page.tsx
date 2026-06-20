// app/arena-dashboard/business-associates/page.tsx

 
import BusinessAssociatesToolbar from "@/components/business-assoicates/BusinessAsscoiatesToolBar";
import BusinessAssociatesTable from "@/components/business-assoicates/BusinessAssociatesTable";
import { prisma } from "@/utils/db";
 

const PAGE_SIZE = 25;

type PageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
};

export default async function BusinessAssociatesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  const query = params.q?.trim() ?? "";

  const page = Math.max(
    1,
    Number.parseInt(params.page ?? "1", 10) || 1
  );

  const where = {
    deletedAt: null,
    ...(query && {
      OR: [
        {
          name: {
            contains: query,
            mode: "insensitive" as const,
          },
        },
        {
          slug: {
            contains: query,
            mode: "insensitive" as const,
          },
        },
      ],
    }),
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
    <div className="space-y-6">
      <BusinessAssociatesToolbar />

      <BusinessAssociatesTable
        orgs={orgs}
        page={page}
        query={query}
        total={total}
        pageSize={PAGE_SIZE}
        key={`${query}-${page}`}
      />
    </div>
  );
}