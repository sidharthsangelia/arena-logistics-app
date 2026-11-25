export default function ClientPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only Business Associates manage their own clients. The sidebar hides this
  // route for standard orgs, and each page enforces it against direct
  // navigation, bookmarks and deep links: the list inside its table's Suspense
  // boundary, the detail page on its shared client promise.
  //
  // The guard used to be awaited here. A layout that awaits holds the whole
  // route, and Next stands in the nearest loading state above it, which is the
  // dashboard's, so every visit to /clients flashed the dashboard skeleton.
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
