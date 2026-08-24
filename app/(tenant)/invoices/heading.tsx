/**
 * The page's static heading, in one place because the route renders it twice:
 * once in loading.tsx and once in page.tsx. Copying it into both was how the
 * two drifted, and a heading that changes between the loading frame and the
 * loaded one is the one layout shift a static heading has no excuse for.
 */
export function InvoicesPageHeading() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        Invoices
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Everything Arena has billed you: a tax invoice for every shipment, plus
        any bills raised to your account. Open or download any of them.
      </p>
    </div>
  );
}
