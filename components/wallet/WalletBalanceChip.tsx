"use client";

// The wallet balance in the tenant header, sat at the right end of the
// breadcrumb bar. Every booking spends from this number, so it is worth the
// permanent real estate — and worth a refresh control, because a top-up is
// credited by a Razorpay webhook that lands after the page was rendered.

import { useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { refreshWalletBalanceAction } from "@/actions/wallet/refreshWalletBalance.action";
import { resolveLowBalanceThreshold } from "@/utils/wallet/config";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";

interface WalletBalanceChipProps {
  /** Server-rendered balance as a decimal string. */
  balance: string;
  currency: string;
  /** False when the org has no wallet row yet. */
  exists: boolean;
}

export function WalletBalanceChip({
  balance,
  currency,
  exists,
}: WalletBalanceChipProps) {
  // Holds the value the refresh button fetched. Preferred over the server value
  // for the life of this mount; a genuinely newer server value arrives with a
  // different `key` from WalletBalanceIndicator, which remounts and clears it.
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = refreshed ?? balance;
  const amount = Number(current);
  const isLow = exists && Number.isFinite(amount) && amount < resolveLowBalanceThreshold();

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await refreshWalletBalanceAction();

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Only shout when the number actually moved. A refresh that confirms what
      // was already on screen is the common case and deserves no toast.
      if (result.balance !== current) {
        toast.success(
          `Balance updated to ${formatMoney(result.balance, result.currency)}`,
        );
      }

      setRefreshed(result.balance);
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2",
          isLow
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-border bg-muted/40 text-foreground",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/wallet"
              className="flex items-center gap-1.5 text-sm font-medium tabular-nums"
            >
              <Wallet
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isLow ? "text-amber-600" : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "transition-opacity",
                  pending && "opacity-50",
                )}
              >
                {exists ? formatMoney(current, currency) : "No wallet"}
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            {isLow
              ? "Low wallet balance. Top up to keep booking."
              : "Wallet balance. Opens your wallet and top-up history."}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={pending}
              aria-label="Refresh wallet balance"
              className={cn(
                "rounded p-1 transition-colors disabled:cursor-not-allowed",
                isLow
                  ? "text-amber-600 hover:bg-amber-100 hover:text-amber-900"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <RefreshCw className={cn("h-3 w-3", pending && "animate-spin")} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            Check for a new balance. Held until you ask, or until a booking or
            top-up changes it.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
