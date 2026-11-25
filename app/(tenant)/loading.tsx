import { StatCardSubSkeleton, StatCardValueSkeleton } from "@/components/StatCard";
import {
  RECENT_SHIPMENTS_LIMIT,
  RECENT_WALLET_TXNS_LIMIT,
} from "@/lib/dashboard/tenantOverview";

import {
  CardDescriptionSkeleton,
  DashboardLayout,
  GreetingNameSkeleton,
  RecentShipmentsBodySkeleton,
  WalletActivityBodySkeleton,
} from "./_dashboard/parts";

/**
 * Covers the instant between clicking Dashboard and the route rendering. It is
 * the page's own layout (_dashboard/parts.tsx) with every slot filled by the
 * skeleton the page itself falls back to, so the greeting, date, buttons, card
 * titles, icons, fixed sub lines and the shipments table header are real here
 * too, and only the org's own numbers and rows wait.
 *
 * Two things are left out because only the org can say whether they appear:
 * the alerts and checklist (absent for most orgs) and the Business Associate
 * quotes card. Both sit where their arrival moves nothing above them.
 */
export default function DashboardLoading() {
  return (
    <DashboardLayout
      greetingName={<GreetingNameSkeleton />}
      alerts={null}
      checklist={null}
      wallet={{
        value: <StatCardValueSkeleton className="w-24" />,
        sub: <StatCardSubSkeleton className="w-24" />,
      }}
      stats={{
        active: <StatCardValueSkeleton />,
        attention: <StatCardValueSkeleton />,
        delivered: <StatCardValueSkeleton />,
        deliveredSub: <StatCardSubSkeleton />,
      }}
      recentShipments={{
        description: <CardDescriptionSkeleton w="w-56" />,
        body: <RecentShipmentsBodySkeleton rows={RECENT_SHIPMENTS_LIMIT} />,
      }}
      walletActivity={{
        description: <CardDescriptionSkeleton w="w-28" />,
        body: <WalletActivityBodySkeleton rows={RECENT_WALLET_TXNS_LIMIT} />,
      }}
    />
  );
}
