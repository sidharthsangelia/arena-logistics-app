import { Suspense } from "react";

import ClientsToolbar from "@/components/clients/toolbar/ClientsToolbar";
import ClientsTable from "@/components/clients/ClientsTable";
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

/**
 * Every client across every business associate.
 *
 * The page awaits only the search params, which cost nothing. The toolbar — the
 * heading, the sentence under it, and the import, export and new-client buttons —
 * is all fixed markup, so it paints on the first flush instead of waiting behind
 * a query it has no interest in. Only the table needs the database, so only the
 * table sits behind a boundary.
 *
 * This mirrors the tenant route at app/(tenant)/clients. The two used to differ:
 * this one awaited both queries at the top level, which meant nothing at all
 * reached the browser until the slower of them came back.
 */
export default async function ArenaAllClientsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const params = parseSearchParams(sp);

  return (
    <>
      <ClientsToolbar />

      <Suspense
        // Keyed on the query so changing a filter swaps to the skeleton rather
        // than leaving the previous page's rows up while the new ones load.
        key={JSON.stringify(params)}
        fallback={<ClientsTableSkeleton rows={params.pageSize} pageSize={params.pageSize} />}
      >
        <ClientsTableSection params={params} />
      </Suspense>
    </>
  );
}

/**
 * Both queries start together. The rows are what the page is for; the filter
 * dropdown's organisation list is cached for a minute and usually costs nothing,
 * but it must not be awaited first or it would add a round trip in front of the
 * one that matters.
 */
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
    />
  );
}
