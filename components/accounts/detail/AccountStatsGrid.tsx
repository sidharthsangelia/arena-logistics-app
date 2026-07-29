// components/accounts/detail/AccountStatsGrid.tsx
//
// The wallet tile is admin only. Members get a three-up grid rather than a
// fourth tile reading "hidden", which would only advertise what they cannot see.

import { FileText, Truck, Users, Wallet } from "lucide-react";

import StatCard from "@/components/accounts/detail/StatCard";
import type { AccountDetail } from "@/queries/accounts";
import { formatInr } from "@/lib/utils";

export default function AccountStatsGrid({
  account,
}: {
  account: AccountDetail;
}) {
  const { walletBalance } = account;

  return (
    <div
      className={
        walletBalance !== null
          ? "grid grid-cols-2 gap-4 sm:grid-cols-4"
          : "grid grid-cols-2 gap-4 sm:grid-cols-3"
      }
    >
      <StatCard icon={Users} label="Clients" value={account.clientCount} />
      <StatCard icon={FileText} label="Quotes" value={account.quoteCount} />
      <StatCard icon={Truck} label="Shipments" value={account.shipmentCount} />

      {walletBalance !== null && (
        <StatCard
          icon={Wallet}
          label="Wallet balance"
          value={formatInr(walletBalance)}
        />
      )}
    </div>
  );
}
