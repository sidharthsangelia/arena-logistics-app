import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Org } from "@/generated/prisma";
import OrgAvatar from "../OrgAvatar";
import PlanBadge from "../PlanBadge";
import { formatDate } from "@/lib/utils";
 

type Props = {
  org: Org;
};

export default function OrgProfileCard({ org }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex items-center gap-4">
          <OrgAvatar name={org.name} logoUrl={org.logoUrl} className="h-14 w-14" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{org.name}</h2>
            <p className="font-mono text-sm text-muted-foreground">/{org.slug}</p>
          </div>
        </div>
        <PlanBadge plan={org.plan} />
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Clerk Org ID</dt>
            <dd className="truncate font-mono text-xs">{org.clerkOrgId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Joined</dt>
            <dd>{formatDate(org.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last Updated</dt>
            <dd>{formatDate(org.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Billing</dt>
            <dd>{org.razorpayCustomerId ? "Connected" : "Not connected"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}