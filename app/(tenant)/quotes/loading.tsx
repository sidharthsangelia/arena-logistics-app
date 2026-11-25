import { QuotesTableSkeleton } from "@/components/quotes/QuotesTable";

/**
 * The layout's heading is already on screen by then, so this stands in only for
 * the table: its real toolbar, headers and pager, with placeholder cells.
 */
export default function Loading() {
  return <QuotesTableSkeleton />;
}
