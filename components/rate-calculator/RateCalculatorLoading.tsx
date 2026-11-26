import { ArrowRight, ChevronDown, Info, Lock, Plane, Plus, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BoxPresetChips, HowToMeasure } from "@/components/booking/BoxSizeHelpers";
import { KeyboardShortcuts, SubmitShortcutHint } from "./KeyboardShortcuts";
import {
  AVAILABLE_VENDORS,
  DOMESTIC_CALCULATOR_VENDORS,
  type RateScope,
} from "@/lib/types";

import {
  BOX_COLUMN_HEADER,
  BOX_COLUMNS,
  BOX_GRID,
  BOX_INPUT_HEIGHT,
  CHARGED_WEIGHT_EMPTY,
  FORM_TOP_GRID,
  ROUTE_FIELD_GRID,
  SECTION_LABEL_TEXT,
  allCarriersLabel,
  destinationPincodeLabel,
} from "./formLayout";

/**
 * Route-level fallback for both rate calculators (international and domestic,
 * tenant and Arena). Neither route reads anything on load, so this only covers
 * the client form's chunk arriving.
 *
 * It is a static replica of RateCalculatorForm, built from the same layout
 * classes (formLayout.ts), so nothing moves when the form mounts. Everything
 * that is the same on every load is rendered for real: the heading, section
 * labels, India chips, field labels, column headers, the carrier summary and
 * the button copy. Only the input controls, where the form mounts and the
 * user's own data goes, are skeletons, each at its control's exact size.
 *
 * The buttons are inert here (no pointer events, out of the tab order) rather
 * than disabled, so they keep their real colour instead of fading and popping
 * back when the form arrives.
 */
export function RateCalculatorLoading({
  title,
  subtitle,
  scope,
  showCarriers = false,
}: {
  title: string;
  subtitle: string;
  scope: RateScope;
  /** Arena only: staff pick which carriers to query. Customers never see it. */
  showCarriers?: boolean;
}) {
  const isDomestic = scope === "domestic";
  const vendorCount = (isDomestic ? DOMESTIC_CALCULATOR_VENDORS : AVAILABLE_VENDORS).length;

  return (
    <main className="min-h-screen bg-muted/30" aria-busy="true">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* Same wrappers as RatesClient > RateCalculatorForm */}
        <div className="space-y-6">
          <div className="space-y-5">
            <div className={FORM_TOP_GRID}>
              {/* ── Route card ── */}
              <Card>
                <CardContent className="space-y-5 p-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Sending from</SectionLabel>
                      <IndiaChip />
                    </div>
                    <div className={ROUTE_FIELD_GRID}>
                      <Field label="Pincode" />
                      <Field label="City" />
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Sending to</SectionLabel>
                      {isDomestic && <IndiaChip />}
                    </div>
                    {/* Country picker, wrapped like CountryCombobox (space-y-1). */}
                    {!isDomestic && (
                      <div className="space-y-1">
                        <Skeleton className="h-8 w-full rounded-lg" />
                      </div>
                    )}
                    <div className={ROUTE_FIELD_GRID}>
                      <Field label={destinationPincodeLabel(scope)} />
                      <Field label="City" />
                    </div>
                  </div>

                  {isDomestic && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="space-y-2">
                        <SectionLabel tip>Invoice value</SectionLabel>
                        <Skeleton className="h-8 w-full rounded-lg" />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ── Boxes card ── */}
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center justify-between">
                    <SectionLabel tip>Your boxes</SectionLabel>
                    <div className="flex items-center gap-1.5">
                      <KeyboardShortcuts className="mr-1" />
                      <HowToMeasure className="mr-2" />
                      <span className="text-xs text-muted-foreground">Size in</span>
                      <Skeleton className="h-7 w-18 rounded-lg" />
                    </div>
                  </div>

                  <div className={cn(BOX_GRID, BOX_COLUMN_HEADER)}>
                    {BOX_COLUMNS.map((col) => (
                      <span key={col.label} className="flex items-center gap-1">
                        {col.label}
                        <TipIcon />
                      </span>
                    ))}
                    <span />
                  </div>

                  <div className="space-y-1.5">
                    <div className="rounded-md px-1 py-1">
                      <div className={BOX_GRID}>
                        {BOX_COLUMNS.map((col) => (
                          <Skeleton
                            key={col.label}
                            className={cn(BOX_INPUT_HEIGHT, "w-full rounded-lg")}
                          />
                        ))}
                        {/* Remove slot: empty while there is only one box. */}
                        <div className="flex justify-end">
                          <span className="h-8 w-8" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <BoxPresetChips className="px-1" />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    tabIndex={-1}
                    aria-hidden
                    className="pointer-events-none w-full border-dashed text-muted-foreground"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add another box size
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* ── Action rail ── */}
            <Card>
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
                {showCarriers && (
                  <>
                    <div className="lg:w-60 lg:shrink-0">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">Carriers</span>
                          <TipIcon />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          tabIndex={-1}
                          aria-hidden
                          className="pointer-events-none w-full justify-between font-normal"
                        >
                          <span className="flex items-center gap-2">
                            <Plane className="h-4 w-4 text-muted-foreground" />
                            {allCarriersLabel(vendorCount)}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </div>
                    </div>
                    <div className="hidden h-11 w-px shrink-0 bg-border lg:block" />
                  </>
                )}

                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-muted/50">
                      <Scale className="h-4.5 w-4.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        You pay for
                        <TipIcon />
                      </div>
                      <p className="text-sm text-muted-foreground">{CHARGED_WEIGHT_EMPTY}</p>
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  size="lg"
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none h-11 w-full text-sm font-medium lg:w-auto lg:min-w-52"
                >
                  Get live rates
                  <ArrowRight className="ml-2 h-4 w-4" />
                  <SubmitShortcutHint />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Static stand-ins for the form's small interactive bits
// ─────────────────────────────────────────────────────────────────────────────

/** The form's InfoTip trigger, minus the tooltip. Same box, so no shift. */
function TipIcon() {
  return (
    <span className="text-muted-foreground/60" aria-hidden>
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

function SectionLabel({ children, tip = false }: { children: React.ReactNode; tip?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={SECTION_LABEL_TEXT}>{children}</span>
      {tip && <TipIcon />}
    </div>
  );
}

function IndiaChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground">
      <span className="text-sm leading-none">🇮🇳</span>
      India
      <Lock className="h-3 w-3 text-muted-foreground" />
    </span>
  );
}

/** Label for real, the input it labels as a skeleton at the input's size. */
function Field({ label }: { label: string }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  );
}
