/**
 * The header is deliberately static and lives in the layout, not the page: it
 * paints on the first frame and stays put while the table streams in behind its
 * own Suspense boundary. The row count belongs to the table, which already has
 * it, so nothing here needs to touch the database.
 */
export default function ArenaQuotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every freight quotation generated across all business associates.
        </p>
      </div>

      {children}
    </div>
  );
}
