import { DataTableSkeleton } from "@/components/data-table/DataTableSkeleton";

/**
 * Covers the instant between clicking Quotes in the sidebar and the route
 * rendering. The layout header is already on screen by then, so this stands in
 * only for the toolbar and the table.
 */
export default function Loading() {
  return <DataTableSkeleton columns={10} rows={10} withToolbar />;
}
