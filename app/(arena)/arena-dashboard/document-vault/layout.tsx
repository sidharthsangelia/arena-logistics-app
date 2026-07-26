import { ShieldCheck } from "lucide-react";

/**
 * The header is static on purpose. It used to render VaultToolbar, which is the
 * tenant-side component: it calls getDbOrgId() and counts documents for the
 * caller's own org, so on the Arena dashboard it blocked the page on a query that
 * counted Arena's own documents rather than the platform's. The real count comes
 * from the table, which already has it.
 */
export default function ArenaDocumentVaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">Document Vault</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          KYC and compliance documents across every business associate.
        </p>
      </div>

      {children}
    </div>
  );
}
