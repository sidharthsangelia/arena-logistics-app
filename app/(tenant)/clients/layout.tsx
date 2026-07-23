import { requireBusinessAssociateOrg } from "@/utils/tenant";

export default async function ClientPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only Business Associates manage their own clients. The sidebar already
  // hides this route for standard orgs; this guard enforces it against direct
  // navigation, bookmarks, and deep links.
  await requireBusinessAssociateOrg();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
