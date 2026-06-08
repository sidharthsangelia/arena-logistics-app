/**
 * src/components/quotes/QuotesToolbar.tsx
 *
 * Page header for /quotes.
 * Search and status filter live in QuotesFilters (used inside QuotesTable)
 * so they can be co-located with the table they control.
 */

import { QuotesExportButton } from "./QuotesExportButton";

export default function QuotesToolbar() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
      <p className="text-sm text-muted-foreground">
        All generated freight quotations.
      </p>
    </div>
  );
}