import QuotesToolbar from "@/components/quotes/QuotesToolbar";
import { requireBusinessAssociateOrg } from "@/utils/tenant";

export default async function QuotesPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Quotes are a Business-Associate-only feature. The sidebar hides this route
  // for standard orgs; this guard enforces it against direct navigation.
  await requireBusinessAssociateOrg();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <QuotesToolbar />

      {children}
    </div>
  );
}
