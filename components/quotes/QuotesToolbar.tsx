/**
 * components/quotes/QuotesToolbar.tsx
 *
 * Page header for /quotes. Static on purpose: it paints on the first frame and
 * stays put while the table streams in behind its own Suspense boundary. Search,
 * the status filter and Export live inside QuotesTable, co-located with the rows
 * they act on.
 */
export default function QuotesToolbar() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        All generated freight quotations.
      </p>
    </div>
  );
}
