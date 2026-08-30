"use client";

/**
 * components/invoices/manual/ManualInvoiceBuilder.tsx
 *
 * The screen an admin raises an invoice on. The whole feature stands or falls
 * on this being fast, so the layout is built around what actually costs time.
 *
 * ── HOW THE FIVE MINUTES ARE SPENT ──────────────────────────────────────────
 *   1. Who is it for.          One combobox, with inline create. Picking a
 *                              party fills the currency, tax mode, terms and
 *                              place of supply from what they were last billed.
 *   2. What moved.             One consignment card, open, no repeater in
 *                              sight. "Add consignment" only when needed.
 *   3. What to charge.         A dense table. Pick a charge, type an amount,
 *                              press Enter, repeat. A preset lays down five
 *                              rows at once.
 *   4. Check the total.        Live, in a sticky bar, recomputed in the browser
 *                              by the same engine the server will use.
 *
 * Everything else (IRN, notes, ports, shipper and consignee, packing counts) is
 * behind a disclosure, because it is needed on a minority of invoices and every
 * field on screen is a field the eye has to skip.
 *
 * ── THE TOTALS ARE COMPUTED LOCALLY, ON PURPOSE ─────────────────────────────
 * lib/invoices/manual/money.ts is a pure module with no server dependency, so
 * the browser runs the identical function the issue path runs. No round trip,
 * no debounce, no "calculating" state, and no risk of the preview and the
 * document disagreeing, because there is only one implementation.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Copy,
  Eye,
  FileText,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SectionHeading } from "@/components/layout/SectionHeading";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShipmentMode, TaxMode } from "@/generated/prisma";
import {
  CSB_CATEGORIES,
  forwarderKey,
  INVOICE_CURRENCIES,
  PARCEL_TYPES,
  PAYMENT_TERMS,
  SHIP_MODES,
  TAX_MODE_COPY,
  currencySymbol,
  formatMoney,
  manualInvoiceSchema,
  type BillingPartyDetail,
  type ChargePresetOption,
  type ChargeTypeOption,
  type ManualInvoiceDetail,
} from "@/lib/invoices/manual/config";
import {
  buildManualInvoiceMoney,
  type ManualInvoiceMoney,
} from "@/lib/invoices/manual/money";
import { OUTSIDE_INDIA } from "@/lib/invoices/tax/gst";
import {
  issueManualInvoiceAction,
  previewManualInvoiceAction,
  saveManualInvoiceAction,
} from "@/actions/invoices/manualInvoices.action";

import { BillingPartyPicker } from "./BillingPartyPicker";
import { ChargePicker } from "./ChargePicker";
import {
  ForwarderPicker,
  ProductPicker,
  type ProductHistory,
} from "./ForwarderPicker";
import { InvoicePreviewDialog } from "./InvoicePreviewDialog";
import { PlaceOfSupplyPicker } from "./PlaceOfSupplyPicker";
import { RouteEndPicker } from "./RouteEndPicker";
import { ServicePicker } from "./ServicePicker";
import { SuggestPicker } from "./SuggestPicker";
import {
  applyMode,
  applyPartyDefaults,
  consignmentNet,
  emptyCharge,
  emptyConsignment,
  emptyState,
  chargeFromCatalog,
  chargeFromPreset,
  duplicateConsignment,
  isChargeFilled,
  stateFromDetail,
  toMoneyLines,
  toPayload,
  HOME_COUNTRY,
  type BuilderState,
  type ChargeRow,
  type ConsignmentRow,
} from "./builderState";

export function ManualInvoiceBuilder({
  initial,
  initialParty,
  catalog: initialCatalog,
  presets,
  serviceHistory,
  forwarderHistory,
  productHistory,
  sellerStateCode,
}: {
  /** An existing draft to edit, or null for a fresh one. */
  initial: ManualInvoiceDetail | null;
  /**
   * A customer chosen before the form opened, from their page on the customers
   * list. Ignored when `initial` is set, because a draft already names one and
   * a query string must never be able to re-point an invoice at somebody else.
   */
  initialParty?: BillingPartyDetail | null;
  catalog: ChargeTypeOption[];
  presets: ChargePresetOption[];
  /** Services already used on past invoices, most used first. */
  serviceHistory: string[];
  /** Forwarders already used, most used first. */
  forwarderHistory: string[];
  /** Products already used, keyed by the forwarder they were used under. */
  productHistory: ProductHistory;
  /** Arena's own GST state code. Decides IGST against CGST plus SGST. */
  sellerStateCode: string;
}) {
  const router = useRouter();

  const [state, setState] = React.useState<BuilderState>(() => {
    if (initial) return stateFromDetail(initial);
    if (!initialParty) return emptyState();
    // Same path a picker selection takes, so arriving with a customer already
    // chosen fills currency, terms and tax mode exactly as choosing them here
    // would. Nothing is touched yet, so every default applies.
    return applyPartyDefaults(
      emptyState(),
      initialParty,
      initialParty.defaults,
      new Set(),
    );
  });
  const [catalog, setCatalog] = React.useState(initialCatalog);
  const [invoiceId, setInvoiceId] = React.useState<string | null>(
    initial?.id ?? null,
  );
  const [saving, setSaving] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);

  // Which fields the admin has decided for themselves. Party defaults must
  // never overwrite one of these; see applyPartyDefaults.
  const touched = React.useRef(new Set<keyof BuilderState>());

  const set = React.useCallback(
    <K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
      touched.current.add(key);
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── live money ──────────────────────────────────────────────────────────
  const money: ManualInvoiceMoney = React.useMemo(
    () =>
      buildManualInvoiceMoney({
        lines: toMoneyLines(state),
        taxMode: state.taxMode,
        reverseCharge: state.reverseCharge,
        sellerStateCode,
        placeOfSupplyCode: state.placeOfSupplyCode || sellerStateCode,
      }),
    [state, sellerStateCode],
  );

  const chargeCount = state.consignments.reduce(
    (sum, c) => sum + c.charges.filter(isChargeFilled).length,
    0,
  );

  // What the pickers offer: everything typed on past invoices, plus anything
  // typed on THIS one. The second half is what stops a three-leg invoice
  // spelling the same forwarder three ways, and it costs one memo each.
  const merge = (typedHere: string[], history: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const label of [...typedHere, ...history]) {
      const trimmed = label.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  };

  const serviceOptions = React.useMemo(
    () => merge(state.consignments.map((c) => c.serviceType), serviceHistory),
    [state.consignments, serviceHistory],
  );

  const forwarderOptions = React.useMemo(
    () => merge(state.consignments.map((c) => c.forwarderName), forwarderHistory),
    [state.consignments, forwarderHistory],
  );

  // Products typed on this invoice are folded into the stored history under
  // the forwarder they were typed against, so a second consignment on the same
  // forwarder offers what the first one used before anything is saved.
  const productOptions = React.useMemo(() => {
    const out: ProductHistory = {};
    for (const c of state.consignments) {
      const product = c.productType.trim();
      if (!product) continue;
      const key = forwarderKey(c.forwarderName);
      const list = (out[key] ??= []);
      if (!list.some((p) => p.toLowerCase() === product.toLowerCase())) {
        list.push(product);
      }
    }
    for (const [key, list] of Object.entries(productHistory)) {
      const target = (out[key] ??= []);
      for (const product of list) {
        if (!target.some((p) => p.toLowerCase() === product.toLowerCase())) {
          target.push(product);
        }
      }
    }
    return out;
  }, [state.consignments, productHistory]);

  // ── consignment and charge editing ──────────────────────────────────────

  const updateConsignment = React.useCallback(
    (index: number, patch: Partial<ConsignmentRow>) => {
      setState((prev) => {
        const next: BuilderState = {
          ...prev,
          consignments: prev.consignments.map((c, i) =>
            i === index ? { ...c, ...patch } : c,
          ),
        };

        // Naming a foreign destination is naming the place of supply. Code 96
        // is what GSTR-1 wants on an export and nothing else will do, and an
        // admin who has to know that is an admin who will get it wrong once.
        // Only ever a default: `touched` means they decided for themselves.
        if (
          patch.destination &&
          prev.mode === ShipmentMode.INTERNATIONAL &&
          !touched.current.has("placeOfSupplyCode")
        ) {
          const country = patch.destination.country.trim();
          if (country && country !== HOME_COUNTRY) {
            next.placeOfSupplyCode = OUTSIDE_INDIA.code;
          } else if (
            country === HOME_COUNTRY &&
            prev.placeOfSupplyCode === OUTSIDE_INDIA.code
          ) {
            // The lane came home. Fall back to deciding it from the customer.
            next.placeOfSupplyCode = "";
          }
        }

        return next;
      });
    },
    [],
  );

  const updateCharge = React.useCallback(
    (cIndex: number, chargeIndex: number, patch: Partial<ChargeRow>) => {
      setState((prev) => ({
        ...prev,
        consignments: prev.consignments.map((c, i) =>
          i !== cIndex
            ? c
            : {
                ...c,
                charges: c.charges.map((charge, j) =>
                  j === chargeIndex ? { ...charge, ...patch } : charge,
                ),
              },
        ),
      }));
    },
    [],
  );

  const addCharge = React.useCallback((cIndex: number, rows?: ChargeRow[]) => {
    setState((prev) => ({
      ...prev,
      consignments: prev.consignments.map((c, i) =>
        i !== cIndex ? c : { ...c, charges: [...c.charges, ...(rows ?? [emptyCharge()])] },
      ),
    }));
  }, []);

  const removeCharge = React.useCallback((cIndex: number, chargeIndex: number) => {
    setState((prev) => ({
      ...prev,
      consignments: prev.consignments.map((c, i) => {
        if (i !== cIndex) return c;
        const charges = c.charges.filter((_, j) => j !== chargeIndex);
        // Never leave a consignment with no row at all: an empty table has
        // nothing to click and reads as broken rather than as empty.
        return { ...c, charges: charges.length > 0 ? charges : [emptyCharge()] };
      }),
    }));
  }, []);

  const applyPreset = React.useCallback(
    (cIndex: number, preset: ChargePresetOption) => {
      setState((prev) => ({
        ...prev,
        consignments: prev.consignments.map((c, i) => {
          if (i !== cIndex) return c;
          // Drop the trailing empty row so the preset does not land under a
          // blank line, then leave one at the bottom as always.
          const kept = c.charges.filter(isChargeFilled);
          return {
            ...c,
            charges: [
              ...kept,
              ...preset.lines.map(chargeFromPreset),
              emptyCharge(),
            ],
          };
        }),
      }));
      toast.success(`${preset.name} added.`);
    },
    [],
  );

  // ── save and issue ──────────────────────────────────────────────────────

  const validate = React.useCallback((): string | null => {
    if (!state.party) return "Choose who this invoice is for.";
    const parsed = manualInvoiceSchema.safeParse(toPayload(state));
    if (!parsed.success) {
      return parsed.error.issues[0]?.message ?? "Check the form and try again.";
    }
    return null;
  }, [state]);

  const save = React.useCallback(
    async (opts: { silent?: boolean } = {}): Promise<string | null> => {
      const problem = validate();
      if (problem) {
        toast.error(problem);
        return null;
      }

      setSaving(true);
      try {
        const result = await saveManualInvoiceAction(invoiceId, toPayload(state));
        if (!result.ok) {
          toast.error(result.error);
          return null;
        }
        setInvoiceId(result.data.id);
        if (!opts.silent) toast.success("Draft saved.");
        return result.data.id;
      } finally {
        setSaving(false);
      }
    },
    [invoiceId, state, validate],
  );

  const issue = React.useCallback(async () => {
    if (chargeCount === 0) {
      toast.error("Add at least one charge before issuing.");
      return;
    }

    // Always save first. Issuing reads the stored rows, so issuing without
    // saving would number whatever was last written rather than what is on
    // screen, which is the worst possible kind of wrong.
    const id = await save({ silent: true });
    if (!id) return;

    setIssuing(true);
    try {
      const result = await issueManualInvoiceAction(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Issued as ${result.data.invoiceNumber}.`);
      router.push(`/arena-dashboard/invoices/manual/${id}`);
      router.refresh();
    } finally {
      setIssuing(false);
    }
  }, [chargeCount, save, router]);

  // ── preview ─────────────────────────────────────────────────────────────
  //
  // Saves the draft first, exactly as issuing does, then renders the stored row
  // through the real template. Saving is what makes the preview trustworthy:
  // rendering unsaved form state would need a second path from form to document
  // and two paths eventually disagree. See previewManualInvoiceAction.

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewPdf, setPreviewPdf] = React.useState<string | null>(null);
  const [previewName, setPreviewName] = React.useState("invoice.pdf");
  const [previewing, setPreviewing] = React.useState(false);

  // The bare minimum a document can be built from: somebody to bill and
  // something to bill them for. Everything else has a sensible empty state on
  // the page, so waiting for more would only be withholding the answer.
  const canPreview = !!state.party && chargeCount > 0;

  const preview = React.useCallback(async () => {
    setPreviewPdf(null);
    setPreviewOpen(true);
    setPreviewing(true);
    try {
      const id = await save({ silent: true });
      if (!id) {
        setPreviewOpen(false);
        return;
      }
      const result = await previewManualInvoiceAction(id);
      if (!result.ok) {
        toast.error(result.error);
        setPreviewOpen(false);
        return;
      }
      setPreviewPdf(result.data.pdf);
      setPreviewName(result.data.fileName);
    } finally {
      setPreviewing(false);
    }
  }, [save]);

  const busy = saving || issuing || previewing;
  const cur = state.currency;
  const international = state.mode === ShipmentMode.INTERNATIONAL;

  // GST on a foreign-currency invoice is nearly always a mistake: a supply
  // billed in dollars is usually a zero-rated export. Nearly, not always, so
  // this says so and offers the fix rather than making the decision.
  const foreignCurrencyTax = cur !== "INR" && money.totalTax > 0;

  const clearAllGst = React.useCallback(() => {
    setState((prev) => ({
      ...prev,
      consignments: prev.consignments.map((c) => ({
        ...c,
        charges: c.charges.map((charge) => ({ ...charge, ratePercent: "0" })),
      })),
    }));
  }, []);

  return (
    <div>
      {/* ── who and when ──────────────────────────────────────────────── */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid gap-2">
          <Label>Customer</Label>
          <BillingPartyPicker
            value={state.party}
            disabled={busy}
            onChange={async (party) => {
              setState((prev) =>
                applyPartyDefaults(prev, party, null, touched.current),
              );
              // The defaults live on the party record, so a second read fills
              // in currency, terms and tax mode. Deliberately after selection
              // rather than blocking it: the name lands instantly and the rest
              // catches up.
              const { getBillingPartyAction } = await import(
                "@/actions/invoices/manualInvoices.action"
              );
              const detail = await getBillingPartyAction(party.id);
              if (detail) {
                setState((prev) =>
                  applyPartyDefaults(
                    prev,
                    party,
                    detail.defaults,
                    touched.current,
                  ),
                );
              }
            }}
          />
          {state.party?.orgName ? (
            <p className="text-xs text-muted-foreground">
              Linked to {state.party.orgName}, so they will also see this in
              their own dashboard.
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "grid grid-cols-2 gap-4",
            international ? "sm:grid-cols-5" : "sm:grid-cols-4",
          )}
        >
          <div className="grid gap-2">
            <Label htmlFor="issue-date">Invoice date</Label>
            <Input
              id="issue-date"
              type="date"
              value={state.issueDate}
              disabled={busy}
              onChange={(e) => set("issueDate", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Payment terms</Label>
            <Select
              value={state.paymentTerms}
              disabled={busy}
              onValueChange={(v) => set("paymentTerms", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map((term) => (
                  <SelectItem key={term.value} value={term.value}>
                    {term.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Currency</Label>
            <Select
              value={state.currency}
              disabled={busy}
              onValueChange={(v) => set("currency", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={state.mode}
              disabled={busy}
              onValueChange={(v) => {
                // Not a plain field set. The type decides whether the lanes can
                // leave India at all, so changing it has to bring them with it.
                touched.current.add("mode");
                setState((prev) => applyMode(prev, v as ShipmentMode));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ShipmentMode.INTERNATIONAL}>
                  International
                </SelectItem>
                <SelectItem value={ShipmentMode.DOMESTIC}>Domestic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* CSB is the first thing asked about an export and meaningless on a
              domestic invoice, so it sits up here on one and vanishes on the
              other rather than living in a disclosure on both.

              Labelled "Ship. type" rather than "Category", which is the wording
              Arena's own paperwork uses. Note that this is NOT the Air/Sea
              field: that one is "Transport", deliberately not "Ship mode",
              because two labels a letter apart on one consignment is a field
              nobody fills correctly twice. */}
          {international ? (
            <div className="grid gap-2">
              <Label>Ship. type</Label>
              <Select
                value={state.csbCategory}
                disabled={busy}
                onValueChange={(v) => set("csbCategory", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not stated" />
                </SelectTrigger>
                <SelectContent>
                  {CSB_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </section>

      {/* ── the one switch that changes what the customer pays ─────────── */}
      <section className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <Switch
            id="tax-mode"
            checked={state.taxMode === TaxMode.INCLUSIVE}
            disabled={busy}
            onCheckedChange={(checked) =>
              set("taxMode", checked ? TaxMode.INCLUSIVE : TaxMode.EXCLUSIVE)
            }
          />
          <div className="grid gap-0.5">
            <Label htmlFor="tax-mode" className="cursor-pointer">
              {TAX_MODE_COPY[state.taxMode].label}
            </Label>
            <p className="text-xs text-muted-foreground">
              {TAX_MODE_COPY[state.taxMode].help}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="reverse-charge"
            checked={state.reverseCharge}
            disabled={busy}
            onCheckedChange={(checked) => set("reverseCharge", checked)}
          />
          <div className="grid gap-0.5">
            <Label htmlFor="reverse-charge" className="cursor-pointer">
              Reverse charge
            </Label>
            <p className="text-xs text-muted-foreground">
              The customer pays the GST, so none is charged here.
            </p>
          </div>
        </div>

        <div className="ml-auto grid gap-1">
          <Label className="text-xs text-muted-foreground">
            Place of supply
          </Label>
          {/* Searchable, and it shows the code beside the name. The trigger no
              longer says "from the customer's GSTIN": that described a silent
              fallback rather than a value, and on the field that decides IGST
              against a CGST/SGST split the answer should be one somebody
              looked at. Leaving it unpicked still falls back, so an invoice
              raised in a hurry is not wrong, only undeclared. */}
          <PlaceOfSupplyPicker
            value={state.placeOfSupplyCode}
            international={international}
            disabled={busy}
            onChange={(code) => set("placeOfSupplyCode", code)}
          />
        </div>
      </section>

      {foreignCurrencyTax ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p>
            This invoice is in {cur} but charges GST. A supply billed in a
            foreign currency is usually a zero-rated export.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={clearAllGst}
          >
            Set every charge to 0%
          </Button>
        </div>
      ) : null}

      {/* ── consignments ──────────────────────────────────────────────── */}
      <section className="mt-8">
        {state.consignments.map((consignment, index) => (
          <ConsignmentCard
            key={consignment.key}
            index={index}
            total={state.consignments.length}
            row={consignment}
            currency={cur}
            mode={state.mode}
            catalog={catalog}
            presets={presets}
            services={serviceOptions}
            forwarders={forwarderOptions}
            products={productOptions}
            customerName={state.party?.legalName ?? null}
            disabled={busy}
            onChange={(patch) => updateConsignment(index, patch)}
            onChargeChange={(chargeIndex, patch) =>
              updateCharge(index, chargeIndex, patch)
            }
            onAddCharge={() => addCharge(index)}
            onRemoveCharge={(chargeIndex) => removeCharge(index, chargeIndex)}
            onApplyPreset={(preset) => applyPreset(index, preset)}
            onCatalogAdd={(type) => setCatalog((prev) => [...prev, type])}
            onRemove={
              state.consignments.length > 1
                ? () =>
                    setState((prev) => ({
                      ...prev,
                      consignments: prev.consignments.filter(
                        (_, i) => i !== index,
                      ),
                    }))
                : undefined
            }
            onDuplicate={() =>
              setState((prev) => {
                const source = prev.consignments[index];
                const copy = duplicateConsignment(source);
                const next = [...prev.consignments];
                next.splice(index + 1, 0, copy);
                return { ...prev, consignments: next };
              })
            }
          />
        ))}

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="mt-3"
          onClick={() =>
            setState((prev) => ({
              ...prev,
              consignments: [
                ...prev.consignments,
                emptyConsignment({}, prev.mode),
              ],
            }))
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add another consignment
        </Button>
      </section>

      {/* ── the rest, folded away ─────────────────────────────────────── */}
      <Collapsible className="mt-8">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="group px-2">
            <ChevronDown className="mr-2 h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            Reference, e-invoice and notes
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="reference">Customer reference</Label>
            <Input
              id="reference"
              value={state.reference}
              disabled={busy}
              placeholder="Their PO number"
              onChange={(e) => set("reference", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="due-date">Due date</Label>
            <Input
              id="due-date"
              type="date"
              value={state.dueDate}
              disabled={busy}
              onChange={(e) => set("dueDate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Left blank, it follows the payment terms.
            </p>
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="irn">IRN</Label>
            <Input
              id="irn"
              value={state.irn}
              disabled={busy}
              placeholder="Paste from the e-invoice portal, if you use one"
              className="font-mono text-xs"
              onChange={(e) => set("irn", e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="irn-ack">Acknowledgement no.</Label>
            <Input
              id="irn-ack"
              value={state.irnAckNo}
              disabled={busy}
              className="font-mono text-xs"
              onChange={(e) => set("irnAckNo", e.target.value)}
            />
          </div>

          <div className="grid gap-2 sm:col-span-3">
            <Label htmlFor="notes">Notes on the invoice</Label>
            <Textarea
              id="notes"
              rows={2}
              value={state.notes}
              disabled={busy}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── sticky totals ─────────────────────────────────────────────────
          Sticky, not fixed. Fixed positions against the viewport, which on this
          layout means the whole window including the sidebar, so the bar ran
          underneath the nav and covered it. Sticky keeps it in the page's own
          column and lets the scroll container decide where the bottom is.

          The negative margins bleed it to the edges of that column and cancel
          the page's bottom padding, so at full scroll it rests flush rather
          than floating above a strip of background. */}
      <div className="sticky bottom-0 z-30 -mx-6 -mb-8 mt-8 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-3">
          <Figure label="Taxable" value={formatMoney(money.taxableValue, cur)} />
          {money.isIntraState ? (
            <>
              <Figure label="CGST" value={formatMoney(money.cgstAmount, cur)} />
              <Figure label="SGST" value={formatMoney(money.sgstAmount, cur)} />
            </>
          ) : (
            <Figure label="IGST" value={formatMoney(money.igstAmount, cur)} />
          )}
          {money.reimbursements > 0 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Figure
                    label="On their behalf"
                    value={formatMoney(money.reimbursements, cur)}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Recovered at cost. No GST is charged on these and they are not
                part of the taxable value.
              </TooltipContent>
            </Tooltip>
          ) : null}

          <div className="ml-auto flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Total {cur}
                {chargeCount > 0 ? ` · ${chargeCount} charges` : ""}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {currencySymbol(cur)}
                {money.total.toLocaleString(cur === "INR" ? "en-IN" : "en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => save()}
              >
                {saving && !issuing && !previewing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Save draft
              </Button>

              {/* Disabled rather than hidden: a button that appears once you
                  have done enough is a button nobody knows they are working
                  towards. The tooltip says what is still missing. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !canPreview}
                      onClick={preview}
                    >
                      {previewing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      Preview
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {canPreview
                    ? "See the document as the customer will get it"
                    : !state.party
                      ? "Choose a customer first"
                      : "Add a charge first"}
                </TooltipContent>
              </Tooltip>

              <Button type="button" disabled={busy} onClick={issue}>
                {issuing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Issue invoice
              </Button>
            </div>
          </div>
        </div>
      </div>

      <InvoicePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        pdf={previewPdf}
        fileName={previewName}
        loading={previewing}
      />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One consignment
// ---------------------------------------------------------------------------

function ConsignmentCard({
  index,
  total,
  row,
  currency,
  mode,
  catalog,
  presets,
  services,
  forwarders,
  products,
  customerName,
  disabled,
  onChange,
  onChargeChange,
  onAddCharge,
  onRemoveCharge,
  onApplyPreset,
  onCatalogAdd,
  onRemove,
  onDuplicate,
}: {
  index: number;
  total: number;
  row: ConsignmentRow;
  currency: string;
  mode: ShipmentMode;
  catalog: ChargeTypeOption[];
  presets: ChargePresetOption[];
  services: string[];
  forwarders: string[];
  products: ProductHistory;
  /** Whoever is being billed, for the "same as the customer" shortcut. */
  customerName: string | null;
  disabled: boolean;
  onChange: (patch: Partial<ConsignmentRow>) => void;
  onChargeChange: (chargeIndex: number, patch: Partial<ChargeRow>) => void;
  onAddCharge: () => void;
  onRemoveCharge: (chargeIndex: number) => void;
  onApplyPreset: (preset: ChargePresetOption) => void;
  onCatalogAdd: (type: ChargeTypeOption) => void;
  onRemove?: () => void;
  onDuplicate: () => void;
}) {
  const net = consignmentNet(row);
  const relevantPresets = presets.filter((p) => !p.mode || p.mode === mode);

  return (
    <div className={cn("rounded-lg border", index > 0 && "mt-4")}>
      {/* The identity line. These four fields are on almost every invoice, so
          they sit above the fold and everything else is one click away. */}
      <div className="flex flex-wrap items-end gap-3 border-b bg-muted/20 px-4 py-3">
        {total > 1 ? (
          <span className="pb-2 text-sm font-medium text-muted-foreground">
            {index + 1}
          </span>
        ) : null}

        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label className="text-xs">AWB / HAWB</Label>
          <Input
            className="h-8"
            value={row.awbNumber}
            disabled={disabled}
            placeholder="176-51234567"
            onChange={(e) => onChange({ awbNumber: e.target.value })}
          />
        </div>

        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label className="text-xs">Origin</Label>
          <RouteEndPicker
            label="Origin"
            value={row.origin}
            mode={mode}
            disabled={disabled}
            onChange={(origin) => onChange({ origin })}
          />
        </div>

        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label className="text-xs">Destination</Label>
          <RouteEndPicker
            label="Destination"
            value={row.destination}
            mode={mode}
            disabled={disabled}
            onChange={(destination) => onChange({ destination })}
          />
        </div>

        {/* Who carried it and under what product. These are the two a customer
            recognises: "DHL, Express Worldwide" means something to them in a
            way "Air freight" does not, which is why they hold the slot the
            service description used to. The service itself is still there, one
            click down, for the customs-clearance and warehousing invoices that
            have no forwarder at all. */}
        {/* Narrower than its neighbours by about a third. "DHL", "UPS" and
            "Blue Dart" are short, and the width they were given came off the
            route pickers beside them, which hold full city and country
            names. */}
        <div className="grid min-w-28 flex-[0.7] gap-1.5">
          <Label className="text-xs">Forwarder</Label>
          <ForwarderPicker
            value={row.forwarderName}
            history={forwarders}
            disabled={disabled}
            onChange={(forwarderName) => onChange({ forwarderName })}
          />
        </div>

        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label className="text-xs">Product type</Label>
          <ProductPicker
            value={row.productType}
            forwarder={row.forwarderName}
            history={products}
            disabled={disabled}
            onChange={(productType) => onChange({ productType })}
          />
        </div>

        <div className="flex items-center gap-1 pb-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled}
                onClick={onDuplicate}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate this consignment</TooltipContent>
          </Tooltip>

          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── charges ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <ChargeTable
          row={row}
          mode={mode}
          catalog={catalog}
          disabled={disabled}
          onChargeChange={onChargeChange}
          onAddCharge={onAddCharge}
          onRemoveCharge={onRemoveCharge}
          onCatalogAdd={onCatalogAdd}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onAddCharge}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Charge
          </Button>

          {relevantPresets.length > 0 ? (
            <Select
              value=""
              disabled={disabled}
              onValueChange={(id) => {
                const preset = relevantPresets.find((p) => p.id === id);
                if (preset) onApplyPreset(preset);
              }}
            >
              <SelectTrigger size="sm" className="h-8 w-52">
                <SelectValue placeholder="Add a preset" />
              </SelectTrigger>
              <SelectContent>
                {relevantPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <span className="ml-auto text-sm text-muted-foreground">
            Consignment total{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatMoney(net, currency)}
            </span>
          </span>
        </div>

        <ConsignmentDetails
          row={row}
          mode={mode}
          services={services}
          customerName={customerName}
          disabled={disabled}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The charge table
// ---------------------------------------------------------------------------

function ChargeTable({
  row,
  mode,
  catalog,
  disabled,
  onChargeChange,
  onAddCharge,
  onRemoveCharge,
  onCatalogAdd,
}: {
  row: ConsignmentRow;
  mode: ShipmentMode;
  catalog: ChargeTypeOption[];
  disabled: boolean;
  onChargeChange: (chargeIndex: number, patch: Partial<ChargeRow>) => void;
  onAddCharge: () => void;
  onRemoveCharge: (chargeIndex: number) => void;
  onCatalogAdd: (type: ChargeTypeOption) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-2 text-left font-normal">Charge</th>
            <th className="w-24 pb-2 text-left font-normal">SAC</th>
            <th className="w-28 pb-2 text-right font-normal">Amount</th>
            <th className="w-24 pb-2 text-right font-normal">Discount</th>
            <th className="w-20 pb-2 text-right font-normal">GST %</th>
            <th className="w-28 pb-2 text-center font-normal">On their behalf</th>
            <th className="w-8 pb-2" />
          </tr>
        </thead>
        <tbody>
          {row.charges.map((charge, index) => (
            <tr key={charge.key} className="group">
              <td className="border-t py-1 pr-2">
                <ChargePicker
                  value={charge.label}
                  catalog={catalog}
                  mode={mode}
                  onPick={(type) => {
                    const seeded = chargeFromCatalog(type);
                    onChargeChange(index, {
                      chargeTypeId: seeded.chargeTypeId,
                      label: seeded.label,
                      sacCode: seeded.sacCode,
                      ratePercent: seeded.ratePercent,
                      reimbursement: seeded.reimbursement,
                    });
                  }}
                  onFreeText={(label) =>
                    onChargeChange(index, { label, chargeTypeId: null })
                  }
                  onCatalogAdd={onCatalogAdd}
                />
              </td>

              <td className="border-t py-1 pr-2">
                <Input
                  className="h-8 font-mono text-xs"
                  value={charge.sacCode}
                  disabled={disabled}
                  onChange={(e) =>
                    onChargeChange(index, { sacCode: e.target.value })
                  }
                />
              </td>

              <td className="border-t py-1 pr-2">
                <Input
                  className="h-8 text-right tabular-nums"
                  inputMode="decimal"
                  value={charge.amount}
                  disabled={disabled}
                  placeholder="0.00"
                  onChange={(e) =>
                    onChargeChange(index, { amount: e.target.value })
                  }
                  onKeyDown={(e) => {
                    // Enter on the last row adds the next one, so a run of
                    // charges is typed without reaching for the mouse.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (index === row.charges.length - 1) onAddCharge();
                    }
                  }}
                />
              </td>

              <td className="border-t py-1 pr-2">
                <Input
                  className="h-8 text-right tabular-nums"
                  inputMode="decimal"
                  value={charge.discount}
                  disabled={disabled}
                  placeholder="0"
                  onChange={(e) =>
                    onChargeChange(index, { discount: e.target.value })
                  }
                />
              </td>

              <td className="border-t py-1 pr-2">
                <Input
                  className="h-8 text-right tabular-nums"
                  inputMode="decimal"
                  // A reimbursement carries no GST in either pricing mode, so
                  // the field is disabled rather than merely ignored. A number
                  // that has no effect is worse than no field.
                  value={charge.reimbursement ? "" : charge.ratePercent}
                  disabled={disabled || charge.reimbursement}
                  placeholder={charge.reimbursement ? "n/a" : "18"}
                  onChange={(e) =>
                    onChargeChange(index, { ratePercent: e.target.value })
                  }
                />
              </td>

              <td className="border-t py-1 text-center">
                <Switch
                  checked={charge.reimbursement}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChargeChange(index, {
                      reimbursement: checked,
                      ratePercent: checked ? "0" : "18",
                    })
                  }
                />
              </td>

              <td className="border-t py-1 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  disabled={disabled}
                  onClick={() => onRemoveCharge(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {row.charges.some((c) => c.reimbursement) ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Charges marked &ldquo;on their behalf&rdquo; are recovered at cost. No
          GST is charged on them and they stay out of the taxable value, though
          the customer still owes them.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Everything a minority of invoices needs
// ---------------------------------------------------------------------------

/** Only the keys holding plain text, so the field helper needs no cast. */
type TextKey = {
  [K in keyof ConsignmentRow]: ConsignmentRow[K] extends string ? K : never;
}[keyof ConsignmentRow];

/**
 * One field. The label row is a flex rather than a bare Label so a shortcut can
 * sit opposite the name it belongs to, where it is findable without adding a
 * cell to the grid and knocking every field after it out of column.
 */
function DetailField({
  label,
  value,
  disabled,
  onChange,
  type,
  inputMode,
  placeholder,
  suffix,
  hint,
  action,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
  /** Unit, shown inside the box. "kg" in the label makes the label too long. */
  suffix?: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex min-h-5 items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        {action}
      </div>
      <div className="relative">
        <Input
          id={id}
          type={type}
          className={cn("h-8", suffix && "pr-8", inputMode && "tabular-nums")}
          inputMode={inputMode}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A shortcut that fills a field from something already on screen. */
function FillFrom({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ConsignmentDetails({
  row,
  mode,
  services,
  customerName,
  disabled,
  onChange,
}: {
  row: ConsignmentRow;
  mode: ShipmentMode;
  services: string[];
  customerName: string | null;
  disabled: boolean;
  onChange: (patch: Partial<ConsignmentRow>) => void;
}) {
  // ── WHICH FIELDS EXIST DEPENDS ON THE INVOICE ────────────────────────────
  //
  // A master air waybill, a forwarder, a sub agent and an export invoice
  // number are international forwarding concepts. On a Gurugram to Pune
  // invoice they are four more boxes to skip past and four more ways to fill
  // in something that will never print correctly.
  //
  // Flight, airline and container deliberately stay on BOTH. Domestic air
  // cargo and domestic container rail are ordinary, and hiding a field that a
  // real invoice needs is a worse failure than showing one it does not.
  const international = mode === ShipmentMode.INTERNATIONAL;

  // ── WHY THIS IS FOUR SECTIONS AND NOT ONE GRID ───────────────────────────
  //
  // These twenty fields used to be one flat grid in declaration order, which
  // read as a wall and gave the eye nothing to aim at: the booking date sat
  // next to the pieces, the container between the consignee and the MAWB.
  // Nobody fills twenty fields. They fill the four that apply, and finding
  // those four was the whole cost.
  //
  // Grouped, each section answers one question and is skipped as a unit. The
  // order is the order a job is described in: what moved, between whom, how,
  // and what it is called.

  const field = (
    key: TextKey,
    label: string,
    opts: {
      type?: string;
      inputMode?: "decimal" | "numeric";
      placeholder?: string;
      suffix?: string;
      hint?: React.ReactNode;
      action?: React.ReactNode;
    } = {},
  ) => (
    <DetailField
      key={key}
      label={label}
      value={row[key]}
      disabled={disabled}
      onChange={(value) => onChange({ [key]: value })}
      {...opts}
    />
  );

  const gross = row.grossWeightKg.trim();
  const chargeable = row.chargeableWeightKg.trim();

  // Chargeable weight is the higher of actual and volumetric, so a figure below
  // the gross is nearly always the two fields filled the wrong way round. Said
  // quietly and never blocked: an agreed rate sometimes bills less than flew.
  const weightLooksWrong =
    gross !== "" &&
    chargeable !== "" &&
    Number.parseFloat(chargeable) < Number.parseFloat(gross);

  // What the collapsed row says. A count told you how many boxes had something
  // in them, which is not a thing anybody wanted to know; the values themselves
  // mean the section usually does not need opening to be checked.
  const summary = [
    row.pieces.trim() && `${row.pieces.trim()} pcs`,
    chargeable ? `${chargeable} kg chargeable` : gross && `${gross} kg`,
    row.shipMode.trim(),
    row.serviceType.trim(),
    row.trackingNumber.trim(),
    row.shipperName.trim(),
  ]
    .filter(Boolean)
    .slice(0, 4)
    .join("  ·  ");

  return (
    // Open from the start when there is already something in it. Editing a
    // saved draft and being shown a closed box that hides half of what was
    // typed is how a detail gets left stale.
    <Collapsible defaultOpen={summary.length > 0} className="mt-3 border-t pt-3">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group w-full justify-start px-2 font-normal"
        >
          <ChevronDown className="mr-2 h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          <span className="font-medium">Shipment details</span>
          {summary ? (
            <span className="ml-3 truncate text-xs text-muted-foreground">
              {summary}
            </span>
          ) : (
            <span className="ml-3 truncate text-xs text-muted-foreground">
              Weights, service, parcel type, tracking, shipper and consignee
            </span>
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-4 grid gap-6">
        <section className="grid gap-3">
          <SectionHeading right="What moved, and how much of it">
            The goods
          </SectionHeading>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Parcel type and ship mode sit with the goods rather than with
                the carriage: they describe WHAT moved and how, which is the
                question this section answers, and parcel type is what customs
                and the carrier both ask for. Product type is not here; it
                belongs beside the forwarder that sells it, in the header
                row. */}
            <div className="grid content-start gap-1.5">
              <div className="flex min-h-5 items-baseline">
                <Label className="text-xs">Parcel type</Label>
              </div>
              <SuggestPicker
                value={row.parcelType}
                options={PARCEL_TYPES}
                placeholder="Non-documents"
                disabled={disabled}
                onChange={(parcelType) => onChange({ parcelType })}
              />
            </div>
            <div className="grid content-start gap-1.5">
              <div className="flex min-h-5 items-baseline">
                <Label className="text-xs">Transport</Label>
              </div>
              {/* How the goods travelled. Not the invoice's own domestic or
                  international setting: a domestic consignment can fly and an
                  international one can sail. Called "Transport" and not "Ship
                  mode" because the CSB field above is now "Ship. type", and the
                  two would have been a letter apart on the same document. */}
              <SuggestPicker
                value={row.shipMode}
                options={SHIP_MODES}
                placeholder="Air"
                disabled={disabled}
                onChange={(shipMode) => onChange({ shipMode })}
              />
            </div>

            {field("pieces", "Pieces", { inputMode: "numeric" })}
            {field("grossWeightKg", "Gross weight", {
              inputMode: "decimal",
              suffix: "kg",
            })}
            {field("chargeableWeightKg", "Chargeable weight", {
              inputMode: "decimal",
              suffix: "kg",
              hint: weightLooksWrong
                ? "Lower than the gross. Chargeable is usually the higher of the two."
                : undefined,
              action:
                gross && chargeable !== gross ? (
                  <FillFrom
                    disabled={disabled}
                    onClick={() => onChange({ chargeableWeightKg: gross })}
                  >
                    Same as gross
                  </FillFrom>
                ) : undefined,
            })}

            {field("boxCount", "Boxes", { inputMode: "numeric" })}
            {field("palletCount", "Pallets", { inputMode: "numeric" })}
            {field("cartonCount", "Cartons", { inputMode: "numeric" })}

            {/* One field, not the two this used to be. "Goods" and
                "Particulars" were never a distinction anybody drew while
                typing: the second box got whatever did not fit in the first,
                and the document printed them as two chips saying one thing. */}
            <div className="sm:col-span-2">
              {field("goodsDescription", "Goods description", {
                placeholder:
                  "Machine spares, 3 crates. Anything else to print against this consignment.",
              })}
            </div>
            {/* Beside the description it belongs to, because it is a code FOR
                that description and the two get filled in together off the
                same shipping bill. Typed, not derived: a manual invoice holds
                no item list, so there is nothing here with a quantity to take
                the code from. The booking invoice, which does have one, picks
                it automatically. */}
            {field("hsnCode", "HSN", {
              placeholder: "84213910",
              hint: "Of the goods. Where a consignment holds several, the one with the largest quantity.",
            })}
          </div>
        </section>

        <section className="grid gap-3">
          <SectionHeading right="Printed on the document, whoever is paying">
            Shipper and consignee
          </SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("shipperName", "Shipper", {
              action:
                customerName && row.shipperName.trim() !== customerName ? (
                  <FillFrom
                    disabled={disabled}
                    onClick={() => onChange({ shipperName: customerName })}
                  >
                    Same as customer
                  </FillFrom>
                ) : undefined,
            })}
            {field("consigneeName", "Consignee", {
              action:
                customerName && row.consigneeName.trim() !== customerName ? (
                  <FillFrom
                    disabled={disabled}
                    onClick={() => onChange({ consigneeName: customerName })}
                  >
                    Same as customer
                  </FillFrom>
                ) : undefined,
            })}
          </div>
        </section>

        <section className="grid gap-3">
          <SectionHeading right="Leave blank whatever does not apply">
            Carriage
          </SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* What was actually done, as distinct from who carried it. On a
                courier consignment the forwarder in the header says everything
                and this stays empty; on a customs clearance or a warehousing
                job there is no forwarder and this is the only field that says
                what the invoice is for. */}
            <div className="grid content-start gap-1.5">
              <div className="flex min-h-5 items-baseline">
                <Label className="text-xs">Service</Label>
              </div>
              <ServicePicker
                value={row.serviceType}
                mode={mode}
                history={services}
                disabled={disabled}
                onChange={(serviceType) => onChange({ serviceType })}
              />
            </div>

            {/* A date input, not the free text box this used to be. A saved
                draft loads a yyyy-mm-dd here, and reading one back in a plain
                text field is how a date gets retyped as 08/08 and lost. */}
            {/* Separate from the AWB above. A courier consignment often has
                both: the waybill it flew under, and the number the customer
                was given to track on. Telling a customer to track a number
                that does not resolve is the failure this prevents. */}
            {field("trackingNumber", "Tracking number", {
              placeholder: "The number the customer tracks on",
            })}
            {field("bookingDate", "Booking date", { type: "date" })}
            {/* Not always the booking date, and it is the date a customer
                reconciles against their own dispatch register. */}
            {field("pickupDate", "Pick-up date", { type: "date" })}
            {field("flightNumber", "Flight", { placeholder: "EK 511" })}
            {field("airlineName", "Airline", { placeholder: "Emirates" })}
            {field("containerNumber", "Container")}
            {international ? field("mawbNumber", "MAWB") : null}
            {/* Forwarder used to be an international-only text box here. It is
                now a picker in the header row and available on both, because
                Blue Dart and DTDC carry domestic consignments exactly the way
                DHL carries export ones. */}
            {international ? field("subAgent", "Sub agent") : null}
          </div>
        </section>

        <section className="grid gap-3">
          <SectionHeading right="For finding this consignment again">
            Reference numbers
          </SectionHeading>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("jobNumber", "Job number")}
            {field("referenceNo", "Their reference", {
              placeholder: "The customer's own number",
            })}
            {international
              ? field("exportInvoiceNo", "Shipper invoice no.", {
                  hint: "The customer's own export invoice. Printed in the header when the whole invoice is against one.",
                })
              : null}
          </div>
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}
