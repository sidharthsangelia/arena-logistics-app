import { TenantInvoicesTable } from "@/components/invoices/TenantInvoicesTable";

import { InvoicesPageHeading } from "./heading";

/**
 * Nothing on this screen is skeletoned unless it genuinely comes from the
 * database. The heading is static content the route already knows, so it is
 * rendered outright; the panel below is the real table with its query switched
 * off, so its filters, column headings and paging controls are painted and
 * final while only the cells and figures stand in.
 *
 * Identical to the page's own Suspense fallback — the same component, not a
 * copy of it — so the route taking over from this file moves nothing.
 */
export default function InvoicesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <InvoicesPageHeading />
      <TenantInvoicesTable skeleton />
    </div>
  );
}
