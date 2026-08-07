import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared box + contents (packing list) renderer.
//
// A shipment's cargo is boxes → contents: each PackageItem is a physical box
// (dimensions, weight, quantity = how many identical boxes) that holds many
// PackageContentItem lines (the real packing list: description, HSN, qty,
// unit value). This component renders one block per box with its contents as a
// sub-table, plus a rollup footer — used identically on the customer shipment
// page and the ops booking page so customs data reads the same on both sides.
//
// Boxes are told apart by a hairline and whitespace rather than by nested
// cards: the list already sits inside a card on the ops pages, and a box drawn
// inside a box inside a box reads as clutter on either side.
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
      <p className="text-sm text-muted-foreground">No boxes recorded.</p>
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
    <div>
      <div className="divide-y">
        {packages.map((box, bi) => {
          const currency = box.declaredCurrency ?? fallbackCurrency;
          const contents = box.contents ?? [];
          const perBoxValue = contents.length
            ? contents.reduce(
                (s, c) => s + num(c.unitValue) * (c.quantity || 0),
                0,
              )
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
                "space-y-4 py-5 first:pt-0 last:pb-0",
                // In ops view a multipiece box gets an amber left rail so the
                // "this is really N boxes" fact can't be skimmed past.
                ops &&
                  multi &&
                  "border-l-2 border-l-amber-400 pl-4 dark:border-l-amber-500",
              )}
            >
              {/* Box header */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
                  Box {bi + 1}
                  {multi && (
                    <span
                      className={cn(
                        "inline-flex items-baseline gap-1 text-xs font-normal",
                        ops
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground",
                      )}
                    >
                      <Layers className="h-3 w-3 self-center" />
                      {qty} identical boxes
                    </span>
                  )}
                </p>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {money(perBoxValue, currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {qty > 1 ? "declared per box" : "declared"}
                  </span>
                </p>
              </div>

              {/* Box physical meta */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
                <Meta label="Dimensions">
                  <span className="font-mono">
                    {num(box.lengthCm).toFixed(0)} ×{" "}
                    {num(box.widthCm).toFixed(0)} ×{" "}
                    {num(box.heightCm).toFixed(0)}
                  </span>{" "}
                  <span className="font-normal text-muted-foreground">cm</span>
                </Meta>
                <Meta label="Weight per box">{kg(box.weightKg)}</Meta>
                <Meta label="Chargeable">
                  {kg(chargeable)}
                  {isVolumetric && (
                    <span
                      className={cn(
                        "ml-1.5 text-xs font-normal",
                        ops
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {ops ? "billed by size" : "volumetric"}
                    </span>
                  )}
                </Meta>
                <Meta label="Box count">
                  <span
                    className={cn(
                      ops && multi && "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {qty} box{qty !== 1 ? "es" : ""}
                  </span>
                </Meta>
              </div>

              {/* Contents / packing list */}
              {contents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {box.description || "No item breakdown recorded for this box."}
                </p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-md text-sm">
                    <thead>
                      <tr className="border-b text-left align-bottom">
                        <th className="px-1 pb-2 text-xs font-normal text-muted-foreground">
                          Item
                        </th>
                        <th className="px-1 pb-2 text-xs font-normal text-muted-foreground">
                          HSN
                        </th>
                        <th className="px-1 pb-2 text-right text-xs font-normal text-muted-foreground">
                          Qty
                        </th>
                        <th className="px-1 pb-2 text-right text-xs font-normal text-muted-foreground">
                          Unit value
                        </th>
                        <th className="px-1 pb-2 text-right text-xs font-normal text-muted-foreground">
                          Line total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {contents.map((c) => (
                        <tr key={c.id}>
                          <td className="px-1 py-2 text-foreground">
                            {c.description}
                          </td>
                          <td className="px-1 py-2 font-mono text-xs text-muted-foreground">
                            {c.hsCode ||
                              (ops ? (
                                <span className="font-sans font-medium text-amber-700 dark:text-amber-400">
                                  No HSN
                                </span>
                              ) : (
                                <span className="font-sans text-muted-foreground/50">
                                  Not set
                                </span>
                              ))}
                          </td>
                          <td className="px-1 py-2 text-right tabular-nums text-muted-foreground">
                            {c.quantity}
                          </td>
                          <td className="px-1 py-2 text-right tabular-nums text-muted-foreground">
                            {money(c.unitValue, c.currency ?? currency)}
                          </td>
                          <td className="px-1 py-2 text-right tabular-nums text-foreground">
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
      </div>

      {/* Rollup footer */}
      <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t pt-4 text-sm">
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
        />
        {ops && totalBoxes > 1 && (
          <span className="inline-flex items-baseline gap-1 text-sm font-medium text-amber-700 dark:text-amber-400">
            <Layers className="h-3 w-3 self-center" />
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
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-medium tabular-nums text-foreground">
        {children}
      </p>
    </div>
  );
}

function RollupStat({
  label,
  value,
  alert,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-base font-semibold tabular-nums text-foreground",
          alert && "text-amber-700 dark:text-amber-400",
        )}
      >
        {value}
      </span>
    </span>
  );
}
