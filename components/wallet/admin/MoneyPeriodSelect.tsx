"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MONEY_PERIODS, type MoneyPeriod } from "@/lib/wallet/adminConfig";

/**
 * How far back the figures on this screen look.
 *
 * Applies to the movement figures (topped up, spent, the daily chart) but not to
 * the balances, which are always current by definition. The tiles say which is
 * which so the period never silently appears to change a balance.
 */
export function MoneyPeriodSelect({ value }: { value: MoneyPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    // A different window can shrink the result set, so any page position from the
    // old window is meaningless.
    params.delete("page");

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <Select value={value} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="w-40" aria-label="Time period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(MONEY_PERIODS).map(([key, config]) => (
          <SelectItem key={key} value={key}>
            {config.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
