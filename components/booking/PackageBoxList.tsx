import { Box as BoxIcon, Layers, Package as PackageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared box + contents (packing list) renderer.
//
// A shipment's cargo is boxes → contents: each PackageItem is a physical box
// (dimensions, weight, quantity = how many identical boxes) that holds many
// PackageContentItem lines (the real packing list: description, HSN, qty,
// unit value). This component renders one card per box with its contents as a
// sub-table, plus a rollup footer — used identically on the customer shipment
// page and the ops booking page so customs data reads the same on both sides.
// ---------------------------------------------------------------------------

interface BoxContent {
  id: string;
  description: string;
  hsCode?: string | null;
  quantity: number;
  unitValue: unknown;
  currency?: string | null;
}

interface Box {
  id: string;
  description: string;
  quantity: number;
  lengthCm: unknown;
  widthCm: unknown;
  heightCm: unknown;
  weightKg: unknown;
  declaredValue?: unknown;
  declaredCurrency?: string | null;
  hsCode?: string | null;
  contents?: BoxContent[];
}

// air divisor — L×W×H (cm) ÷ 5000 = volumetric kg
const VOLUMETRIC_DIVISOR = 5000;

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && "toNumber" in (v as object))
    return (v as { toNumber(): number }).toNumber();
  return Number(v) || 0;
}

function money(v: unknown, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(num(v));
}

function kg(v: unknown): string {
  const n = num(v);
  return `${n.toFixed(2)} kg`;
}

export function PackageBoxList({
  packages,
  fallbackCurrency = "INR",
  variant = "default",
}: {
  packages: Box[];
  fallbackCurrency?: string;
  /** "ops" intensifies attention cues (multipiece, size-billing, missing HSN). */
  variant?: "default" | "ops";
}) {
  const ops = variant === "ops";
  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
        <PackageIcon className="h-7 w-7 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No boxes recorded.</p>
      </div>
    );
  }

  // Rollup totals across every box (box.quantity = identical box count).
  const totalBoxes = packages.reduce((a, b) => a + (b.quantity || 1), 0);
  const totalItemLines = packages.reduce(
    (a, b) => a + (b.contents?.length ?? 0),
    0,
  );
  const totalWeight = packages.reduce(
    (a, b) => a + num(b.weightKg) * (b.quantity || 1),
    0,
  );
  const totalDeclared = packages.reduce((a, b) => {
    const perBox =
      b.contents && b.contents.length
        ? b.contents.reduce(
            (s, c) => s + num(c.unitValue) * (c.quantity || 0),
            0,
          )
        : num(b.declaredValue);
    return a + perBox * (b.quantity || 1);
  }, 0);

  return (
    <div className="space-y-3 p-4">
      {packages.map((box, bi) => {
        const currency = box.declaredCurrency ?? fallbackCurrency;
        const contents = box.contents ?? [];
        const perBoxValue = contents.length
          ? contents.reduce((s, c) => s + num(c.unitValue) * (c.quantity || 0), 0)
          : num(box.declaredValue);
        const qty = box.quantity || 1;

        const vol =
          (num(box.lengthCm) * num(box.widthCm) * num(box.heightCm)) /
          VOLUMETRIC_DIVISOR;
        const chargeable = Math.max(num(box.weightKg), vol);
        const isVolumetric = vol > num(box.weightKg);

        const multi = qty > 1;

        return (
          <div
            key={box.id}
            className={cn(
              "overflow-hidden rounded-lg border bg-card",
              // In ops view a multipiece box gets an amber left rail so the
              // "this is really N boxes" fact can't be skimmed past.
              ops &&
                multi &&
                "border-l-4 border-l-amber-400 dark:border-l-amber-500",
            )}
          >
            {/* Box header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-background">
                  <BoxIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm font-semibold text-foreground">
                  Box {bi + 1}
                </span>
                {multi && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      ops
                        ? "border border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                        : "border border-border bg-background font-medium text-muted-foreground",
                    )}
                  >
                    <Layers className="h-3 w-3" />
                    {qty} identical boxes
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {money(perBoxValue, currency)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {qty > 1 ? "declared per box" : "declared value"}
                </p>
              </div>
            </div>

            {/* Box physical meta */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b px-4 py-2.5 sm:grid-cols-4">
              <Meta label="Dimensions">
                <span className="font-mono">
                  {num(box.lengthCm).toFixed(0)} × {num(box.widthCm).toFixed(0)}{" "}
                  × {num(box.heightCm).toFixed(0)}
                </span>{" "}
                <span className="text-muted-foreground">cm</span>
              </Meta>
              <Meta label="Weight per box">{kg(box.weightKg)}</Meta>
              <Meta label="Chargeable">
                {kg(chargeable)}
                {isVolumetric &&
                  (ops ? (
                    <span className="ml-1 inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      billed by size
                    </span>
                  ) : (
                    <span className="ml-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      volumetric
                    </span>
                  ))}
              </Meta>
              <Meta label="Box count">
                <span
                  className={cn(
                    ops &&
                      multi &&
                      "font-semibold text-amber-700 dark:text-amber-400",
                  )}
                >
                  {qty} box{qty !== 1 ? "es" : ""}
                </span>
              </Meta>
            </div>

            {/* Contents / packing list */}
            {contents.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                {box.description || "No item breakdown recorded for this box."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold">HSN</th>
                      <th className="px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        Unit value
                      </th>
                      <th className="px-4 py-2 text-right font-semibold">
                        Line total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {contents.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 font-medium text-foreground">
                          {c.description}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {c.hsCode ||
                            (ops ? (
                              <span className="inline-flex items-center rounded border border-amber-300 bg-amber-100 px-1.5 py-px font-sans text-[10px] font-semibold not-italic text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                No HSN
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">
                                Not set
                              </span>
                            ))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {c.quantity}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {money(c.unitValue, c.currency ?? currency)}
                        </td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                          {money(
                            num(c.unitValue) * (c.quantity || 0),
                            c.currency ?? currency,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* Rollup footer */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs">
        <RollupStat
          label="Total boxes"
          value={String(totalBoxes)}
          alert={ops && totalBoxes > 1}
        />
        <RollupStat label="Item lines" value={String(totalItemLines)} />
        <RollupStat label="Actual weight" value={kg(totalWeight)} />
        <RollupStat
          label="Declared value"
          value={money(totalDeclared, fallbackCurrency)}
          emphasise
        />
        {ops && totalBoxes > 1 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            <Layers className="h-3 w-3" />
            Multipiece: hand over all {totalBoxes} boxes
          </span>
        )}
      </div>
    </div>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-foreground tabular-nums">{children}</p>
    </div>
  );
}

function RollupStat({
  label,
  value,
  emphasise,
  alert,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums text-foreground",
          emphasise && "text-sm",
          alert && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
