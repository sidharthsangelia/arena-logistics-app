"use client";

/**
 * Box-size helpers shared by the rate calculator (RateCalculatorForm and its
 * loading replica) and the booking wizard (BoxEditor):
 *
 *   • HowToMeasure    a quiet link that opens the L × B × H diagram + tips
 *   • BoxPresetChips  one-click common carton sizes
 *   • BoxSizeHint     the per-box size weight line and never-blocking hints
 *
 * The rules (presets, thresholds, unit maths) live in lib/booking/boxSize.ts so
 * the help docs quote the same numbers. All three render the same on the server
 * and the client, so the calculator's loading state can show HowToMeasure and
 * the chips for real instead of skeletons.
 */

import { Ruler, TriangleAlert } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { VOLUMETRIC_DIVISOR } from "@/lib/booking/cargo";
import {
  BOX_PRESETS,
  presetDimensions,
  type BoxPreset,
  type BoxSizeReading,
} from "@/lib/booking/boxSize";

// ---------------------------------------------------------------------------
// HowToMeasure
// ---------------------------------------------------------------------------

const TIPS = [
  "Measure the packed box from the outside.",
  "Round up to the next whole cm or inch.",
  "Include anything that sticks out, like handles or a bulge.",
  "Enter one box. Use the count for identical boxes.",
];

const SIDES = [
  { key: "L", name: "Length", hint: "the longest side" },
  { key: "B", name: "Breadth", hint: "the side across" },
  { key: "H", name: "Height", hint: "from the base to the top" },
];

export function HowToMeasure({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <Ruler className="h-3.5 w-3.5" />
          How to measure
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-4">
        <p className="text-sm font-medium text-foreground">How to measure a box</p>

        <BoxDiagram />

        <dl className="grid grid-cols-[1.25rem_1fr] gap-x-2 gap-y-1 text-xs">
          {SIDES.map((s) => (
            <div key={s.key} className="contents">
              <dt className="font-semibold text-primary">{s.key}</dt>
              <dd className="text-foreground">
                {s.name}
                <span className="text-muted-foreground">, {s.hint}</span>
              </dd>
            </div>
          ))}
        </dl>

        <ul className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
          {TIPS.map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              {t}
            </li>
          ))}
        </ul>

        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Size weight</span> = L × B × H in cm ÷{" "}
          {VOLUMETRIC_DIVISOR.toLocaleString("en-IN")}. You pay for whichever is higher, size
          weight or real weight.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A line-drawn carton with its three sides marked. Oblique projection: the
 * front face is L wide and H tall, depth (B) runs up and to the right. Hidden
 * back edges are dashed so the box reads as a solid, not a wireframe.
 */
function BoxDiagram() {
  return (
    <svg
      viewBox="0 0 240 156"
      role="img"
      aria-label="A box with length along the front, breadth along the side going back, and height from base to top"
      className="h-auto w-full"
    >
      {/* hidden back edges */}
      <g className="stroke-muted-foreground/40" strokeWidth={1} strokeDasharray="3 3" fill="none">
        <path d="M40 120 L84 88 L194 88 M84 88 L84 28" />
      </g>

      {/* faces */}
      <g className="stroke-muted-foreground/80" strokeWidth={1.25} strokeLinejoin="round">
        <path d="M40 60 L150 60 L194 28 L84 28 Z" className="fill-muted" />
        <path d="M150 60 L194 28 L194 88 L150 120 Z" className="fill-muted-foreground/15" />
        <path d="M40 60 L150 60 L150 120 L40 120 Z" className="fill-background" />
      </g>

      {/* tape seam on the lid */}
      <path d="M95 60 L139 28" className="stroke-muted-foreground/30" strokeWidth={4} strokeLinecap="round" />

      {/* dimension lines */}
      <g className="stroke-primary" strokeWidth={1.25} strokeLinecap="round">
        {/* L */}
        <path d="M40 134 L150 134 M40 130 L40 138 M150 130 L150 138" />
        {/* H */}
        <path d="M24 60 L24 120 M20 60 L28 60 M20 120 L28 120" />
        {/* B */}
        <path d="M160 128 L204 96 M157 124 L163 132 M201 92 L207 100" />
      </g>
      <g className="fill-primary" fontSize={12} fontWeight={600} textAnchor="middle">
        <text x={95} y={151}>L</text>
        <text x={12} y={94}>H</text>
        <text x={192} y={126}>B</text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BoxPresetChips
// ---------------------------------------------------------------------------

/**
 * Common carton sizes as small chips. `onPick` is left out by the loading
 * replica, where the chips render inert at their real size.
 */
export function BoxPresetChips({
  onPick,
  activeId,
  className,
}: {
  onPick?: (preset: BoxPreset) => void;
  /** Highlights the chip this box already matches. */
  activeId?: string;
  className?: string;
}) {
  const inert = !onPick;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 text-[11px] text-muted-foreground">Common sizes</span>
      {BOX_PRESETS.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            tabIndex={inert ? -1 : undefined}
            aria-hidden={inert || undefined}
            aria-pressed={onPick ? active : undefined}
            title={`${p.label}: ${p.lengthCm} × ${p.widthCm} × ${p.heightCm} cm`}
            onClick={onPick ? () => onPick(p) : undefined}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              inert && "pointer-events-none",
              active
                ? "border-foreground/25 bg-muted text-foreground"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="font-medium">{p.label}</span>
            <span className="opacity-70">{presetDimensions(p)}</span>
          </button>
        );
      })}
      <span className="text-[11px] text-muted-foreground/70">cm</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BoxSizeHint
// ---------------------------------------------------------------------------

const fmtKg = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;

/** Size weight for one box, then any hint about a number that looks off. */
export function BoxSizeHint({
  reading,
  className,
}: {
  reading: BoxSizeReading;
  className?: string;
}) {
  const { hasSize, sizeWeightKg, actualKg, chargedBySize, warnings } = reading;
  if (!hasSize && warnings.length === 0) return null;

  return (
    <div className={cn("space-y-0.5 text-[11px] leading-relaxed", className)}>
      {hasSize && (
        <p className="text-muted-foreground tabular-nums">
          Size weight <span className="font-medium text-foreground">{fmtKg(sizeWeightKg)}</span>
          {actualKg > 0 && (
            <>
              {" "}
              vs real {fmtKg(actualKg)}
              <span className="mx-1.5 text-muted-foreground/50">·</span>
              {chargedBySize ? (
                <span className="font-medium text-foreground">charged by size</span>
              ) : (
                "charged by weight"
              )}
            </>
          )}
        </p>
      )}
      {warnings.map((w) => (
        <p key={w.kind} className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          {w.text}
        </p>
      ))}
    </div>
  );
}
