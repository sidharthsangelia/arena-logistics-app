"use client";

import { Bar, BarChart, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AgingBucket } from "@/lib/wallet/adminConfig";
import { formatMoney } from "@/utils/format";

/**
 * How old the money owed to us is.
 *
 * The total owed on its own says nothing about whether it is a problem. A large
 * balance that is all a few days old is just normal trade; a small one that is all
 * months old is money that is probably gone. That difference is the only reason
 * this chart exists.
 *
 * Horizontal bars because the category labels are words rather than dates, and
 * colour escalates with age because age is exactly the risk being shown.
 */

const chartConfig = {
  amount: { label: "Owed", color: "var(--color-slate-400)" },
} satisfies ChartConfig;

/** Escalating tone by bucket. Matches agingTone() in lib/wallet/collections.ts. */
const BUCKET_COLOR: Record<string, string> = {
  "0-7": "var(--color-slate-400)",
  "8-15": "var(--color-amber-400)",
  "16-30": "var(--color-orange-500)",
  "30+": "var(--color-red-500)",
};

function compactRupees(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 10_000_000) return `${(value / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(value) >= 100_000) return `${(value / 100_000).toFixed(1)}L`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

export function CollectionAgingChart({
  data,
  currency,
}: {
  data: AgingBucket[];
  currency: string;
}) {
  const hasDebt = data.some((b) => b.amount > 0);

  if (!hasDebt) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">Nothing is waiting to be collected.</p>
        <p className="text-xs text-muted-foreground">
          Every booking that shipped without paying has since been settled.
        </p>
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-56">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 56, bottom: 0, left: 4 }}
      >
        <XAxis type="number" hide tickFormatter={compactRupees} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={104}
          fontSize={11}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              config={chartConfig}
              valueFormatter={(value) => formatMoney(value, currency)}
              labelFormatter={(label) => {
                const bucket = data.find((b) => b.label === label);
                if (!bucket) return label;
                return `${label} · ${bucket.count} booking${bucket.count === 1 ? "" : "s"}`;
              }}
            />
          }
        />
        <Bar dataKey="amount" radius={[0, 3, 3, 0]} maxBarSize={26}>
          {data.map((bucket) => (
            <Cell key={bucket.key} fill={BUCKET_COLOR[bucket.key] ?? chartConfig.amount.color} />
          ))}
          {/* The figure sits on the bar because there is no value axis to read. */}
          <LabelList
            dataKey="amount"
            position="right"
            fontSize={11}
            className="fill-muted-foreground"
            formatter={(value: unknown) =>
              Number(value) > 0 ? formatMoney(Number(value), currency) : ""
            }
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
