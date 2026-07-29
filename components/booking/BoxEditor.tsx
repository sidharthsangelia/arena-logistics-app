"use client";

import { useEffect } from "react";
import { Plus, Trash2, Info, Scale } from "lucide-react";
import { nanoid } from "nanoid";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { CargoBox, BoxContentItem } from "@/types/booking.types";
import {
  totalDeclaredValue,
  totalBoxCount,
  boxDeclaredValue,
  boxChargeableWeight,
  boxVolumetricWeight,
  totalChargeableWeight,
} from "@/lib/booking/cargo";

// ---------------------------------------------------------------------------
// BoxEditor
//
// The boxes-and-contents editor, shared by the international and domestic items
// steps. What a customer packs, and how it is priced, is identical either way:
// a box is a physical carton (dimensions, weight, and a count of identical
// cartons) holding line items (description, HSN, quantity, unit value), and the
// price comes off the greater of real and volumetric weight in both flows.
//
// Everything that DOES differ between the two — the customs category, the
// commercial invoice, the door-pickup opt-in, the GST paperwork — lives in the
// step that renders this, not in here. That is the whole reason it was pulled
// out: the two steps have almost nothing else in common, and keeping two copies
// of the pricing-critical part would have let them drift.
//
// Callers must wrap this in a TooltipProvider.
// ---------------------------------------------------------------------------

export function newContentItem(): BoxContentItem {
  return { id: nanoid(), description: "", hsCode: "", quantity: 1, unitValue: 0 };
}

export function newBox(): CargoBox {
  return {
    id: nanoid(),
    lengthCm: 0,
    widthCm: 0,
    heightCm: 0,
    weightKg: 0,
    quantity: 1,
    contents: [newContentItem()],
  };
}

interface BoxEditorProps {
  boxes: CargoBox[];
  /** Currency every unit value is expressed in. "INR" throughout the domestic flow. */
  currency: string;
  onChange: (boxes: CargoBox[]) => void;
  /** Placeholder for an item's HSN field — the code is called HSN domestically and HS for exports. */
  hsCodeLabel?: string;
  hsCodePlaceholder?: string;
}

export function BoxEditor({
  boxes,
  currency,
  onChange,
  hsCodeLabel = "HSN code",
  hsCodePlaceholder = "6109.10",
}: BoxEditorProps) {
  const totalValue = totalDeclaredValue(boxes);
  const boxCount = totalBoxCount(boxes);
  const chargeableWeight = totalChargeableWeight(boxes);

  // Seed one starter box so the step never opens empty.
  useEffect(() => {
    if (boxes.length === 0) onChange([newBox()]);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchBox = (bi: number, patch: Partial<CargoBox>) => {
    onChange(boxes.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  };
  const patchItem = (bi: number, ii: number, patch: Partial<BoxContentItem>) => {
    const contents = boxes[bi].contents.map((it, i) =>
      i === ii ? { ...it, ...patch } : it,
    );
    patchBox(bi, { contents });
  };
  const addBox = () => onChange([...boxes, newBox()]);
  const removeBox = (bi: number) => onChange(boxes.filter((_, i) => i !== bi));
  const addItem = (bi: number) =>
    patchBox(bi, { contents: [...boxes[bi].contents, newContentItem()] });
  const removeItem = (bi: number, ii: number) =>
    patchBox(bi, { contents: boxes[bi].contents.filter((_, i) => i !== ii) });

  const fmtMoney = (n: number) => `${currency} ${n.toLocaleString("en-IN")}`;
  const fmtKg = (n: number) =>
    `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {boxes.map((box, bi) => {
          const actual = Number(box.weightKg) || 0;
          const volumetric = boxVolumetricWeight(box);
          const chargeable = boxChargeableWeight(box);
          const bySize = volumetric > actual && volumetric > 0;

          return (
            <div key={box.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-sm font-medium">Box {bi + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  disabled={boxes.length === 1}
                  onClick={() => removeBox(bi)}
                  aria-label="Remove box"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4 p-4">
                {/* dimensions / weight / count */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {(
                    [
                      ["lengthCm", "Length (cm)"],
                      ["widthCm", "Width (cm)"],
                      ["heightCm", "Height (cm)"],
                      ["weightKg", "Weight (kg)"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={box[key] || ""}
                        onChange={(e) =>
                          patchBox(bi, { [key]: Number(e.target.value) })
                        }
                      />
                    </div>
                  ))}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs text-muted-foreground">
                        Identical boxes
                      </Label>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground"
                            aria-label="About identical boxes"
                          >
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Shipping several boxes of the same size, weight and
                          contents? Set the count here instead of adding each
                          one. Add a new box only when something differs.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={box.quantity || ""}
                      onChange={(e) =>
                        patchBox(bi, { quantity: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>

                {/* contents */}
                <div className="space-y-2">
                  <div className="hidden gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_110px_70px_120px_32px]">
                    <span>Item</span>
                    <span>{hsCodeLabel}</span>
                    <span>Qty</span>
                    <span>Value / unit</span>
                    <span />
                  </div>

                  {box.contents.map((item, ii) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_70px_120px_32px] sm:items-center"
                    >
                      <Input
                        value={item.description}
                        onChange={(e) =>
                          patchItem(bi, ii, { description: e.target.value })
                        }
                        placeholder="e.g. Cotton T-shirts"
                      />
                      <Input
                        value={item.hsCode}
                        onChange={(e) =>
                          patchItem(bi, ii, { hsCode: e.target.value })
                        }
                        placeholder={hsCodePlaceholder}
                      />
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity || ""}
                        onChange={(e) =>
                          patchItem(bi, ii, { quantity: Number(e.target.value) })
                        }
                        placeholder="Qty"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitValue || ""}
                        onChange={(e) =>
                          patchItem(bi, ii, { unitValue: Number(e.target.value) })
                        }
                        placeholder="Value"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        disabled={box.contents.length === 1}
                        onClick={() => removeItem(bi, ii)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => addItem(bi)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add item
                  </Button>
                </div>

                {/* per-box footer: value + chargeable weight */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <span>
                    Box value{" "}
                    <strong className="text-foreground">
                      {fmtMoney(boxDeclaredValue(box))}
                    </strong>
                    {box.quantity > 1 && (
                      <>
                        {" "}
                        × {box.quantity} ={" "}
                        <strong className="text-foreground">
                          {fmtMoney(boxDeclaredValue(box) * box.quantity)}
                        </strong>
                      </>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5">
                    Chargeable{" "}
                    <strong className="text-foreground">{fmtKg(chargeable)}</strong>
                    {bySize && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                            charged by size
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          This box is bulky for its weight, so it&apos;s priced
                          on its size. Size-based weight here is{" "}
                          {fmtKg(volumetric)} vs {fmtKg(actual)} actual.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addBox}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add another box
        </Button>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">Declared value</span>{" "}
          <strong>{fmtMoney(totalValue)}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Boxes</span>{" "}
          <strong>{boxCount}</strong>
        </div>
        <div className="flex items-center gap-1.5">
          <Scale className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Chargeable weight</span>{" "}
          <strong>{fmtKg(chargeableWeight)}</strong>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground"
                aria-label="How chargeable weight works"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Carriers charge the greater of a box&apos;s real weight and its
              size-based (volumetric) weight. We work out size-based weight as
              length × width × height in cm ÷ 5000, take the higher of the two
              per box, and add them up. Your price is based on this number.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
