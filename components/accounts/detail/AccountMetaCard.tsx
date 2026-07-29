// components/accounts/detail/AccountMetaCard.tsx
//
// The identifiers and dates you need when something has gone wrong: the two IDs
// to search logs with, and the signup health that explains why an account looks
// quiet.

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import SignupHealth from "@/components/accounts/SignupHealth";
import type { AccountDetail } from "@/queries/accounts";
import { formatDate } from "@/lib/utils";

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export default function AccountMetaCard({
  account,
}: {
  account: AccountDetail;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Account</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <TooltipProvider delayDuration={200}>
          <MetaRow label="Signup status">
            <SignupHealth
              profileCompletedAt={account.profileCompletedAt}
              verifiedKycCount={account.verifiedKycCount}
              shipmentCount={account.shipmentCount}
            />
          </MetaRow>
        </TooltipProvider>

        <MetaRow label="KYC verified">{account.verifiedKycCount}</MetaRow>

        <MetaRow label="Profile completed">
          {account.profileCompletedAt
            ? formatDate(account.profileCompletedAt)
            : "Not completed"}
        </MetaRow>

        <MetaRow label="Joined">{formatDate(account.createdAt)}</MetaRow>

        <MetaRow label="Last updated">{formatDate(account.updatedAt)}</MetaRow>

        <MetaRow label="Org ID">
          <span className="font-mono text-xs break-all">{account.id}</span>
        </MetaRow>

        <MetaRow label="Clerk Org ID">
          <span className="font-mono text-xs break-all">
            {account.clerkOrgId}
          </span>
        </MetaRow>
      </CardContent>
    </Card>
  );
}
