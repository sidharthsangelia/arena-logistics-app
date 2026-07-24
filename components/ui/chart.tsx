"use client";

/**
 * CHART PRIMITIVES
 * -----------------------------------------------------------------------------
 * A thin wrapper over recharts, deliberately smaller than the shadcn generator
 * output. Two reasons for hand-rolling it:
 *
 *   1. This repo is on recharts 3, and the shadcn chart component was written
 *      against recharts 2. Its tooltip shim reaches into internals that moved.
 *   2. The generated version carries a theming system for five palette slots.
 *      The palette here (--chart-1..5) is greyscale on purpose, because colour
 *      in this app is a functional cue rather than decoration. So series colours
 *      are passed explicitly by whoever knows what they mean, and there is no
 *      palette indirection to get lost in.
 *
 * Usage:
 *
 *   const config = {
 *     in:  { label: "Money in",  color: "var(--color-emerald-500)" },
 *     out: { label: "Money out", color: "var(--color-slate-400)" },
 *   } satisfies ChartConfig;
 *
 *   <ChartContainer config={config} className="h-64">
 *     <BarChart data={data}>
 *       <Bar dataKey="in" fill="var(--color-in)" />
 *     </BarChart>
 *   </ChartContainer>
 */

import * as React from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";

export type ChartSeriesConfig = {
  /** Human label shown in the tooltip and legend. */
  label: string;
  /** Any CSS colour. Exposed to children as `var(--color-<key>)`. */
  color: string;
};

export type ChartConfig = Record<string, ChartSeriesConfig>;

// ---------------------------------------------------------------------------
// ChartContainer
//
// Turns the config into CSS custom properties on a wrapper element, so series
// components reference `var(--color-in)` rather than importing the palette. That
// keeps the colour decision in one object per chart instead of scattered across
// every <Bar> and <Line>.
// ---------------------------------------------------------------------------

export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  /** A single recharts chart element, e.g. <BarChart>. */
  children: React.ReactElement;
}) {
  const cssVars = React.useMemo(() => {
    const style: Record<string, string> = {};
    for (const [key, series] of Object.entries(config)) {
      style[`--color-${key}`] = series.color;
    }
    return style as React.CSSProperties;
  }, [config]);

  return (
    <div
      data-slot="chart"
      style={cssVars}
      className={cn(
        "w-full",
        // Recharts draws focus outlines on every bar and dot, which reads as
        // noise on a dashboard. Axis and grid strokes inherit the theme border
        // so charts stay legible in both light and dark.
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground",
        "[&_.recharts-cartesian-grid_line]:stroke-border/60",
        "[&_.recharts-surface]:outline-none",
        "[&_.recharts-sector]:outline-none",
        "[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted/50",
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartTooltipContent
//
// Passed to recharts' <Tooltip content={...} />. Typed against what recharts
// actually hands over at runtime rather than importing its internal payload
// types, which move between versions.
// ---------------------------------------------------------------------------

type TooltipEntry = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

export type ChartTooltipContentProps = {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  config: ChartConfig;
  /** Format the heading. Defaults to the raw category label. */
  labelFormatter?: (label: string | number) => React.ReactNode;
  /** Format each value, e.g. as currency. */
  valueFormatter?: (value: number, key: string) => React.ReactNode;
  /** Hide the heading for charts where the category is already obvious. */
  hideLabel?: boolean;
  /** Append a total row. Only for charts where the series add up to something. */
  showTotal?: boolean;
  totalLabel?: string;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  config,
  labelFormatter,
  valueFormatter,
  hideLabel = false,
  showTotal = false,
  totalLabel = "Total",
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  const rows = payload.filter((entry) => entry.value != null);
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);

  const renderValue = (value: number | string | undefined, key: string) => {
    const numeric = Number(value ?? 0);
    if (valueFormatter && Number.isFinite(numeric)) return valueFormatter(numeric, key);
    return String(value ?? "");
  };

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      {!hideLabel && label != null && (
        <p className="mb-1.5 font-medium text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}

      <div className="space-y-1">
        {rows.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          const series = config[key];

          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: series?.color ?? entry.color ?? "currentColor" }}
                />
                {series?.label ?? key}
              </span>
              <span className="font-medium tabular-nums text-foreground">
                {renderValue(entry.value, key)}
              </span>
            </div>
          );
        })}

        {showTotal && rows.length > 1 && (
          <div className="mt-1.5 flex items-center justify-between gap-4 border-t pt-1.5">
            <span className="text-muted-foreground">{totalLabel}</span>
            <span className="font-medium tabular-nums text-foreground">
              {renderValue(total, "__total__")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartLegend
//
// Plain markup outside the chart rather than recharts' <Legend>, so it sits
// wherever the layout wants it and never steals height from the plot area.
// ---------------------------------------------------------------------------

export function ChartLegend({
  config,
  className,
  keys,
}: {
  config: ChartConfig;
  className?: string;
  /** Restrict and order the entries. Defaults to every key in the config. */
  keys?: string[];
}) {
  const entries = (keys ?? Object.keys(config))
    .map((key) => [key, config[key]] as const)
    .filter((entry): entry is readonly [string, ChartSeriesConfig] => Boolean(entry[1]));

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {entries.map(([key, series]) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ background: series.color }}
          />
          {series.label}
        </span>
      ))}
    </div>
  );
}
