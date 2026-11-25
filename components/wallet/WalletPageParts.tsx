/**
 * components/wallet/WalletPageParts.tsx
 *
 * The wallet page's two cards as shells, shared by the page (client, react-query)
 * and its route loading state (server). The shell is everything that never
 * changes: the icon, "Wallet balance", "Recent activity", the card chrome. The
 * page and the loading state pass in only what differs, so the loading state
 * cannot drift from the page and nothing moves when the page mounts.
 *
 * No "use client" and no hooks, so a loading.tsx can render it directly.
 */

import { Wallet } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WalletBalanceCard({
  amount,
  actions,
}: {
  amount: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Wallet balance</p>
            {amount}
          </div>
        </div>
        <div className="flex gap-2">{actions}</div>
      </CardContent>
    </Card>
  );
}

export function WalletActivityCard({
  rangeTabs,
  children,
}: {
  rangeTabs: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
        <p className="text-sm font-semibold">Recent activity</p>
        {rangeTabs}
      </CardHeader>
      <CardContent className="divide-y">{children}</CardContent>
    </Card>
  );
}

/** Stands in for the text-3xl balance: same 36px line, so no shift. */
export function WalletBalanceSkeleton() {
  return (
    <div className="flex h-9 items-center">
      <Skeleton className="h-7 w-40" />
    </div>
  );
}

/**
 * Transaction rows before they arrive. Each line is a skeleton inside a box of
 * the real line's height (20px label, 16px date, 20px amount, 20px badge), so
 * the row is exactly as tall as a real one.
 */
export function WalletTransactionsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-3 text-sm">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div>
              <div className="flex h-5 items-center">
                <Skeleton className="h-3.5 w-24" />
              </div>
              <div className="flex h-4 items-center">
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="mt-0.5 h-5 w-16 rounded-4xl" />
          </div>
        </div>
      ))}
    </>
  );
}
