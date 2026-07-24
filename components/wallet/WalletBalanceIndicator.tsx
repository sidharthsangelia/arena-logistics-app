// Server half of the header wallet chip. Reads the heavily cached balance and
// keys the client chip on it, so a genuinely new server value remounts the chip
// and discards whatever it had fetched locally.

import { getCachedWalletBalance } from "@/lib/wallet/queries";
import { WalletBalanceChip } from "@/components/wallet/WalletBalanceChip";

export async function WalletBalanceIndicator({ orgId }: { orgId: string }) {
  const wallet = await getCachedWalletBalance(orgId);

  return (
    <WalletBalanceChip
      key={wallet.balance}
      balance={wallet.balance}
      currency={wallet.currency}
      exists={wallet.exists}
    />
  );
}

/** Matches the chip's footprint so the header does not shift when it lands. */
export function WalletBalanceIndicatorSkeleton() {
  return <div className="h-7 w-28 animate-pulse rounded-md bg-muted" />;
}
