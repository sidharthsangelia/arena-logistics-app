/**
 * app/(arena)/arena-dashboard/document-vault/page.tsx
 *
 * Company-side view of every business associate's KYC and compliance paperwork.
 * Unlike /document-vault (tenant-scoped) this intentionally spans every org.
 *
 * The page itself fetches nothing. Paging, sorting, search and the doc-type
 * filter all live in the URL but are driven client-side through the History API,
 * so the table refetches through react-query instead of re-rendering this route
 * on every keystroke. The Suspense boundary is what useSearchParams needs, and it
 * doubles as the first paint.
 */

import { Suspense } from "react";

import AdminVaultTable from "@/components/documentVault/AdminVaultTable";
import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";

export const metadata = {
  title: "Document Vault",
};

export default function ArenaDocumentVaultPage() {
  return (
    <Suspense fallback={<DataTableSkeleton columns={7} rows={10} withToolbar />}>
      <AdminVaultTable />
    </Suspense>
  );
}
