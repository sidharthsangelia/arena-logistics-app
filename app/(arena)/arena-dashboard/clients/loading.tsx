import ClientsToolbar from "@/components/clients/toolbar/ClientsToolbar";
import ClientsTableSkeleton from "@/components/clients/ClientTableSkeleton";
import { DEFAULT_CLIENT_PAGE_SIZE } from "@/queries/clients";

/**
 * Covers the instant between clicking Clients in the sidebar and the route
 * responding. This is client-side and costs no network, so it is what makes the
 * click feel answered.
 *
 * It is deliberately not a copy of the page. It renders the page's own two
 * pieces: the real toolbar, which is fixed markup either way, and the same table
 * fallback the page's Suspense boundary uses. So this file cannot drift out of
 * step with what replaces it — there is nothing here to keep in step.
 *
 * The only thing it cannot know is the page size, since loading.tsx receives no
 * search params. It draws the default; the page's own boundary takes over with
 * the real count a moment later.
 */
export default function ClientsLoading() {
  return (
    <>
      <ClientsToolbar />
      <ClientsTableSkeleton
        rows={DEFAULT_CLIENT_PAGE_SIZE}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
      />
    </>
  );
}
