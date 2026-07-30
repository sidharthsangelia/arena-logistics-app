import { Suspense } from "react";

import ClientsTable from "@/components/clients/ClientsTable";
import ClientsToolbar from "@/components/clients/toolbar/ClientsToolbar";
import ClientsTableSkeleton from "@/components/clients/ClientTableSkeleton";

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

// The page itself awaits only the search params, so the toolbar — which is the
// heading, the search box and the New Client button, and needs no data — paints
// on the first flush. The table is the part behind a database round trip, so it
// streams in underneath with a skeleton the same shape as its rows.
export default async function ClientsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  return (
    <>
      <ClientsToolbar client={true} />

      <Suspense
        // Keyed on the query so changing a filter swaps to the skeleton rather
        // than leaving the previous page's rows up while the new ones load.
        key={JSON.stringify(params)}
        fallback={<ClientsTableSkeleton />}
      >
        <ClientsTableSection params={params} />
      </Suspense>
    </>
  );
}

async function ClientsTableSection({
  params,
}: {
  params: ReturnType<typeof parseSearchParams>;
}) {
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
    <ClientsTable
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
      client={true}
    />
  );
}