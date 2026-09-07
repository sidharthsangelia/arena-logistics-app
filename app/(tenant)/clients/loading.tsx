import ClientsToolbar from "@/components/clients/toolbar/ClientsToolbar";
import ClientsTableSkeleton from "@/components/clients/ClientTableSkeleton";
import { DEFAULT_CLIENT_PAGE_SIZE } from "@/queries/clients";

/**
 * The tenant counterpart of the Arena clients fallback, and the same idea: this
 * renders the page's own toolbar and the page's own table fallback rather than a
 * hand-written imitation of them, so the two cannot disagree about how many
 * columns there are or what they are called.
 */
export default function ClientsLoading() {
  return (
    <>
      <ClientsToolbar client={true} />
      <ClientsTableSkeleton
        client
        rows={DEFAULT_CLIENT_PAGE_SIZE}
        pageSize={DEFAULT_CLIENT_PAGE_SIZE}
      />
    </>
  );
}
