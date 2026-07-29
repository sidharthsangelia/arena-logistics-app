import { Badge } from "@/components/ui/badge";
import type { OrgPlan } from "@/generated/prisma";
import { PLAN_LABELS } from "@/lib/utils";
 

const PLAN_VARIANT: Record<OrgPlan, "outline" | "secondary" | "default"> = {
  FREE: "outline",
  STARTER: "secondary",
  GROWTH: "secondary",
  ENTERPRISE: "default",
};

export default function PlanBadge({ plan }: { plan: OrgPlan }) {
  return (
    <Badge variant={PLAN_VARIANT[plan]} className="font-medium">
      {PLAN_LABELS[plan]}
    </Badge>
  );
}