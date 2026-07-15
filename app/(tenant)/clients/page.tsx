// import { auth } from "@clerk/nextjs/server";
// import { prisma } from "@/utils/db";
// import { redirect } from "next/navigation";
// import type { Prisma } from "@/generated/prisma";
// import ClientsToolbar from "@/components/clients/ClientsToolbar";
// import ClientsTable from "@/components/clients/ClientsTable";

// const PAGE_SIZE = 25;

// type PageProps = {
//   searchParams: Promise<{
//     q?: string;
//     page?: string;
//   }>;
// };

// async function getDbOrgId(): Promise<string> {
//   const { orgId: clerkOrgId } = await auth();
//   if (!clerkOrgId) redirect("/onboarding");

//   const org = await prisma.org.findUnique({
//     where: { clerkOrgId },
//     select: { id: true },
//   });
//   if (!org) redirect("/onboarding");

//   return org.id;
// }

// export default async function ClientsPage({ searchParams }: PageProps) {
//   const [orgId, params] = await Promise.all([
//     getDbOrgId(),
//     searchParams,
//   ]);

//   const query = params.q?.trim() ?? "";
//   const page  = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
//   const skip  = (page - 1) * PAGE_SIZE;

//   const where: Prisma.ClientWhereInput = {
//     orgId,          // ← only this org's clients
//     deletedAt: null,
//     ...(query
//       ? {
//           OR: [
//             { companyName: { contains: query, mode: "insensitive" } },
//             { contactName: { contains: query, mode: "insensitive" } },
//             { email:       { contains: query, mode: "insensitive" } },
//           ],
//         }
//       : {}),
//   };

//   const [clients, total] = await Promise.all([
//     prisma.client.findMany({
//       where,
//       orderBy: { companyName: "asc" },
//       skip,
//       take: PAGE_SIZE,
//     }),
//     prisma.client.count({ where }),
//   ]);

//   return (
//     <>
//       <ClientsToolbar />
//       <ClientsTable
//         clients={clients}
//         page={page}
//         total={total}
//         pageSize={PAGE_SIZE}
//         query={query}
//       />
//     </>
//   );
// }







import ClientsToolbar from "@/components/clients/ClientsToolbar";
import ClientsTableInternal from "@/components/clients/ClientsTableInternal";
import {
  CLIENT_PAGE_SIZE_OPTIONS,
  CLIENT_SORTABLE_FIELDS,
  DEFAULT_CLIENT_PAGE_SIZE,
  getClientOrgOptions,
  getClientsPage,
  type ClientSortField,
} from "@/queries/clients";

// ---------------------------------------------------------------------------
// Search params → typed, validated query params. Anything malformed falls
// back to a sane default instead of throwing.
// ---------------------------------------------------------------------------

type RawSearchParams = Record<string, string | string[] | undefined>;

function parseSearchParams(sp: RawSearchParams) {
  const query = typeof sp.q === "string" ? sp.q.trim() : "";

  const pageRaw = Number(sp.page);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw = Number(sp.pageSize);
  const pageSize = (CLIENT_PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSizeRaw)
    ? pageSizeRaw
    : DEFAULT_CLIENT_PAGE_SIZE;

  const sortField: ClientSortField = CLIENT_SORTABLE_FIELDS.includes(sp.sort as ClientSortField)
    ? (sp.sort as ClientSortField)
    : "createdAt";

  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const orgIds =
    typeof sp.org === "string" && sp.org.length > 0
      ? sp.org.split(",").filter(Boolean)
      : [];

  return { query, page, pageSize, sortField, sortDir, orgIds };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PageProps = {
  searchParams: Promise<RawSearchParams>;
};

export default async function ClientsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  const [{ rows, totalRows, pageCount }, orgOptions] = await Promise.all([
    getClientsPage({
      page: params.page,
      pageSize: params.pageSize,
      sortField: params.sortField,
      sortDir: params.sortDir,
      query: params.query,
      orgIds: params.orgIds,
      client: true, 
    }),
    getClientOrgOptions(),
  ]);

  return (
    <>
      <ClientsToolbar />

      <ClientsTableInternal
        clients={rows}
        page={params.page}
        pageSize={params.pageSize}
        totalRows={totalRows}
        pageCount={pageCount}
        sortField={params.sortField}
        sortDir={params.sortDir}
        orgIds={params.orgIds}
        orgOptions={orgOptions}
        query={params.query}
      />
    </>
  );
}