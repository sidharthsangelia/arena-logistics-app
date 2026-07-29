// components/accounts/detail/AccountDetailHeader.tsx

import OrgAvatar from "@/components/accounts/OrgAvatar";
import PlanBadge from "@/components/accounts/PlanBadge";
import AccountTypeBadge from "@/components/accounts/AccountTypeBadge";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AccountDetail } from "@/queries/accounts";

export default function AccountDetailHeader({
  account,
}: {
  account: AccountDetail;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-center gap-4">
        <OrgAvatar
          name={account.name}
          logoUrl={account.logoUrl}
          className="h-14 w-14"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {account.name}
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            {account.slug}
          </p>
        </div>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="flex flex-wrap items-center gap-2">
          <PlanBadge plan={account.plan} />
          <AccountTypeBadge
            isBusinessAssociate={account.isBusinessAssociate}
            skipPayment={account.skipPayment}
          />
        </div>
      </TooltipProvider>
    </div>
  );
}
