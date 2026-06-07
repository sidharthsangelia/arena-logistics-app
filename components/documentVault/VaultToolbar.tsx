import { ShieldCheck } from "lucide-react";
import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";

// Server component — fetches the total doc count for the header stat.
export default async function VaultToolbar() {

  const orgId = await getDbOrgId();

  const total = await prisma.clientDocument.count({
    where: { client: { deletedAt: null, orgId } },
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">Document Vault</h1>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {total.toLocaleString()} KYC document{total !== 1 ? "s" : ""} across all clients
        </p>
      </div>
    </div>
  );
}