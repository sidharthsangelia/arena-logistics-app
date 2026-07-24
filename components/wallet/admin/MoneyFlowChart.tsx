"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DailyMoneyPoint } from "@/lib/wallet/adminConfig";
import { formatMoney } from "@/utils/format";

/**
 * Money in against money out, one pair of bars per day.
 *
 * Side by side rather than stacked: the question this answers is "are wallets
 * filling faster than they are draining", and stacked bars would make the two
 * quantities share a baseline so neither could be read off the axis.
 *
 * Colour is the functional cue. Green means money arriving; grey means money being
 * spent, which is normal business rather than something to worry about, so it is
 * deliberately not red.
 */

const chartConfig = {
  moneyIn: { label: "Money in", color: "var(--color-emerald-500)" },
  moneyOut: { label: "Money out", color: "var(--color-slate-400)" },
} satisfies ChartConfig;

/** Compact axis labels: ₹1.2L rather than ₹120,000, which would not fit. */
function compactRupees(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(value) >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(parsed);
}

function fullDayLabel(date: string | number): string {
  const parsed = new Date(`${String(date)}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed);
}

export function MoneyFlowChart({
  data,
  currency,
}: {
  data: DailyMoneyPoint[];
  currency: string;
}) {
  const hasMovement = data.some((d) => d.moneyIn > 0 || d.moneyOut > 0);

  if (!hasMovement) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">
          No money moved in or out during this period.
        </p>
        <p className="text-xs text-muted-foreground">
          Try a longer period, or check back after the next booking.
        </p>
      </div>
    );
  }

  // A long window with a tick per day turns the axis into a grey smear. Showing
  // roughly a dozen labels keeps it readable at every period length.
  const tickInterval = Math.max(0, Math.ceil(data.length / 12) - 1);

  return (
    <div className="space-y-3">
      <ChartLegend config={chartConfig} />

      <ChartContainer config={chartConfig} className="h-64">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            interval={tickInterval}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
          />
          <YAxis
            tickFormatter={compactRupees}
            tickLine={false}
            axisLine={false}
            width={44}
            fontSize={11}
          />
          <Tooltip
            cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
            content={
              <ChartTooltipContent
                config={chartConfig}
                labelFormatter={fullDayLabel}
                valueFormatter={(value) => formatMoney(value, currency)}
              />
            }
          />
          <Bar dataKey="moneyIn" fill="var(--color-moneyIn)" radius={[2, 2, 0, 0]} maxBarSize={18} />
          <Bar dataKey="moneyOut" fill="var(--color-moneyOut)" radius={[2, 2, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
