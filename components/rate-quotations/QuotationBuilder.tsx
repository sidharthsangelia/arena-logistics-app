"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { carrierLabel } from "@/lib/rateSweep/carrier";
import { SWEEP_COUNTRIES, WEIGHT_SLABS_KG } from "@/lib/rateSweep/config";
import {
  defaultQuotationSpec,
  type QuotationSpec,
} from "@/lib/rateSweep/excel/spec";

/**
 * The quotation builder.
 *
 * ── WHAT THIS SCREEN IS TRYING TO PREVENT ───────────────────────────────────
 * Not a malformed file. The failure that matters is a correct-looking file with
 * the wrong audience: our raw cost book, professionally laid out, with a
 * customer's name on the cover. So audience is the first control on the page
 * rather than a checkbox at the bottom, choosing INTERNAL visibly changes the
 * colour of the whole summary panel, and the filename carries the word.
 *
 * ── AND WHY THE SUMMARY PANEL IS STICKY ─────────────────────────────────────
 * Every control here changes what comes out. The panel restates the decision in
 * words as it is being made — "customer file, 25% markup, 6 sheets" — because
 * the alternative is generating a file to find out what you asked for.
 */

interface CarrierOption {
  code: string;
  /** Rate rows in the latest run. Shown so an empty sheet is never a surprise. */
  rows: number;
}

export interface ClientOption {
  id: string;
  companyName: string;
  /** Which account they belong to. Two orgs can have a client of the same name. */
  orgName: string;
}

export function QuotationBuilder({
  runId,
  capturedAt,
  ageDays,
  stale,
  availableCarriers,
  clients,
}: {
  runId: string;
  capturedAt: string;
  ageDays: number;
  stale: boolean;
  availableCarriers: CarrierOption[];
  clients: ClientOption[];
}) {
  const [spec, setSpec] = useState<QuotationSpec>(defaultQuotationSpec);
  const [busy, setBusy] = useState(false);

  const patch = (next: Partial<QuotationSpec>) =>
    setSpec((current) => ({ ...current, ...next }));

  const isCustomer = spec.audience === "CUSTOMER";

  const sheetCount = useMemo(() => {
    if (spec.layout === "CHEAPEST") return 3; // cover, best rates, terms
    const carriers =
      spec.carriers.length > 0 ? spec.carriers.length : availableCarriers.length;
    return 3 + carriers;
  }, [spec.layout, spec.carriers, availableCarriers.length]);

  const problems = useMemo(() => {
    const list: string[] = [];
    if (spec.countryCodes.length === 0) list.push("Pick at least one country.");
    if (spec.weightsKg.length === 0) list.push("Pick at least one weight slab.");
    if (isCustomer && spec.markupPercent <= 0) {
      list.push("A customer file needs a markup above 0%.");
    }
    return list;
  }, [spec, isCustomer]);

  async function generate() {
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/rate-sweeps/quotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...spec, runId }),
      });

      if (!response.ok) {
        // The route answers errors as JSON and successes as a spreadsheet, so
        // the failure path can read a message rather than showing "something
        // went wrong" over a perfectly good explanation.
        const problem = await response.json().catch(() => null);
        toast.error(problem?.error ?? "Could not build the workbook.");
        return;
      }

      const blob = await response.blob();
      const filename =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? "arena-rates.xlsx";

      // The route files the history row before it answers, and hands the card
      // number back on a header so this does not need a second round trip.
      const cardNumber = response.headers.get("X-Rate-Card-Number");

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      // Customer cards are also stored, so saying so closes the loop: the person
      // knows they can find it again without keeping the download. Internal
      // cards are deliberately not stored, and the toast says that rather than
      // leaving them to discover a missing row later.
      //
      // No card number means the route could not file the history row. That is
      // deliberately not fatal to the download, but it must not read as success
      // either: a card that never reaches the list looks like the list is broken.
      if (cardNumber) {
        toast.success(`${cardNumber} generated`, {
          description: isCustomer
            ? "Downloaded and saved to the rate card history."
            : "Downloaded and logged. Internal cost cards are never stored as files, so keep this one safe.",
        });
      } else {
        toast.warning(`${filename} downloaded`, {
          description:
            "The workbook is fine, but it could not be added to the rate card history and will not appear in the list.",
        });
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        {/* ── Audience. First, because it is the decision that can go wrong. ── */}
        <Section
          title="Who is this file for"
          description="This decides whether the workbook shows your selling price or your buying price."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={isCustomer}
              onClick={() => patch({ audience: "CUSTOMER" })}
              title="Customer"
              description="Marked-up prices. Sourcing vendors masked. Safe to send."
            />
            <ChoiceCard
              active={!isCustomer}
              onClick={() => patch({ audience: "INTERNAL" })}
              title="Internal"
              description="Raw carrier cost, every vendor named. Stamped on every page."
              tone="danger"
              icon={<Lock className="size-4" />}
            />
          </div>

          {!isCustomer ? (
            <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This file shows what Arena pays. Every sheet is stamped and the
                filename ends in INTERNAL, but it is still your cost book. Do not
                send it to a customer.
              </span>
            </p>
          ) : null}
        </Section>

        <Section
          title="Shape of the workbook"
          description="Both include a cover and the full terms."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              active={spec.layout === "BY_SERVICE"}
              onClick={() => patch({ layout: "BY_SERVICE" })}
              title="One sheet per carrier"
              description="A DHL tab, a FedEx tab, a UPS tab. For customers who choose by carrier."
              icon={<FileSpreadsheet className="size-4" />}
            />
            <ChoiceCard
              active={spec.layout === "CHEAPEST"}
              onClick={() => patch({ layout: "CHEAPEST" })}
              title="Best rate only"
              description="One grid of the cheapest option per lane, with the carrier named beside it."
              icon={<FileSpreadsheet className="size-4" />}
            />
          </div>
        </Section>

        <Section
          title="Destinations"
          description="Only countries the sweep covers can be included."
        >
          <CountryPicker
            selected={spec.countryCodes}
            onChange={(countryCodes) => patch({ countryCodes })}
          />
        </Section>

        <Section
          title="Weight slabs"
          description="Rows in every rate grid. Only slabs the sweep priced are offered, because anything else would be an invented number."
        >
          <WeightPicker
            selected={spec.weightsKg}
            onChange={(weightsKg) => patch({ weightsKg })}
          />
        </Section>

        {spec.layout === "BY_SERVICE" ? (
          <Section
            title="Carriers"
            description="One sheet each. Leave all unticked for every carrier with rates."
          >
            <div className="flex flex-wrap gap-2">
              {availableCarriers.map((carrier) => {
                const active = spec.carriers.includes(carrier.code);
                return (
                  <button
                    key={carrier.code}
                    type="button"
                    onClick={() =>
                      patch({
                        carriers: active
                          ? spec.carriers.filter((c) => c !== carrier.code)
                          : [...spec.carriers, carrier.code],
                      })
                    }
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {carrierLabel(carrier.code)}
                    <span className="ml-2 text-xs opacity-60">
                      {carrier.rows.toLocaleString("en-IN")}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>
        ) : null}

        <Section title="Pricing and presentation">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="markup">Markup %</Label>
              <Input
                id="markup"
                type="number"
                min={0}
                max={500}
                step={0.5}
                value={spec.markupPercent}
                disabled={!isCustomer}
                onChange={(event) =>
                  patch({ markupPercent: Number(event.target.value) })
                }
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {isCustomer
                  ? "Applied through the same path as the live rate calculator, so a customer never sees two prices for one lane."
                  : "Not applied to an internal file."}
              </p>
            </div>

            <div>
              <Label htmlFor="validity">Valid for (days)</Label>
              <Input
                id="validity"
                type="number"
                min={1}
                max={90}
                value={spec.validityDays}
                onChange={(event) =>
                  patch({ validityDays: Number(event.target.value) })
                }
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Printed on the cover and in the terms.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="preparedFor">Prepared for</Label>
              <Input
                id="preparedFor"
                value={spec.preparedFor}
                placeholder="Client or company name"
                maxLength={120}
                onChange={(event) => patch({ preparedFor: event.target.value })}
                className="mt-1.5"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Appears on the cover and in the filename. Leave blank for a
                generic rate card.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label>Link to a client</Label>
              <div className="mt-1.5">
                <ClientPicker
                  clients={clients}
                  selectedId={spec.clientId ?? null}
                  onChange={(client) =>
                    patch({
                      clientId: client?.id ?? null,
                      // Fill the cover from the client's name, but never
                      // overwrite something already typed: somebody who wrote
                      // "Acme Exports — Mumbai office" meant that.
                      preparedFor:
                        client && !spec.preparedFor
                          ? client.companyName
                          : spec.preparedFor,
                    })
                  }
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Optional. Links this card to a client so it shows in their
                history. Not printed on the file, and not needed for a prospect
                who is not on the books yet.
              </p>
            </div>
          </div>
        </Section>

        <Section
          title="Services normally left out"
          description="Both are excluded by default. Each one can make a price look better than it is."
        >
          <div className="space-y-3">
            <ToggleRow
              checked={spec.includeDutyUnpaid}
              onChange={(includeDutyUnpaid) => patch({ includeDutyUnpaid })}
              label="Include duty-unpaid (DDU) services"
              detail="A DDU rate undercuts duty-paid ones and leaves the customer a customs bill at the door. Only include these when the customer has asked for DDU explicitly."
            />
            <ToggleRow
              checked={spec.includeRestricted}
              onChange={(includeRestricted) => patch({ includeRestricted })}
              label="Include restricted services"
              detail="Gifts-only and B2B-only services. They cannot be sold for a general consignment, so a price from one is not a price you can honour."
            />
          </div>
        </Section>
      </div>

      {/* ── Sticky summary. Restates the decision as it is being made. ── */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div
          className={cn(
            "rounded-lg border p-5",
            isCustomer ? "bg-card" : "border-destructive/40 bg-destructive/5",
          )}
        >
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {isCustomer ? "Customer rate card" : "Internal cost card"}
            </h3>
          </div>

          <dl className="mt-4 space-y-2.5 text-sm">
            <SummaryRow label="Layout">
              {spec.layout === "BY_SERVICE" ? "One sheet per carrier" : "Best rate only"}
            </SummaryRow>
            <SummaryRow label="Sheets">{sheetCount}</SummaryRow>
            <SummaryRow label="Countries">{spec.countryCodes.length}</SummaryRow>
            <SummaryRow label="Weights">{spec.weightsKg.length}</SummaryRow>
            <SummaryRow label="Markup">
              {isCustomer ? `${spec.markupPercent}%` : "None (raw cost)"}
            </SummaryRow>
            <SummaryRow label="Rates from">
              {new Date(capturedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </SummaryRow>
          </dl>

          {stale ? (
            <p className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                These rates are {ageDays} days old. The cover will carry a warning.
                Run a fresh sweep before sending this out.
              </span>
            </p>
          ) : null}

          {problems.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {problems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-2 text-xs text-destructive"
                >
                  <X className="mt-0.5 size-3.5 shrink-0" />
                  {problem}
                </li>
              ))}
            </ul>
          ) : null}

          <Separator className="my-4" />

          <Button
            onClick={generate}
            disabled={busy || problems.length > 0}
            className="w-full"
            variant={isCustomer ? "default" : "destructive"}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Building
              </>
            ) : (
              <>
                <Download className="size-4" />
                Generate .xlsx
              </>
            )}
          </Button>

          <p className="mt-3 text-xs text-muted-foreground">
            Every workbook includes a cover, the full terms and conditions, and
            the chargeable-weight and duties notes on each sheet.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Country picker
// ---------------------------------------------------------------------------

/**
 * Searchable multi-select. Chips below the trigger, so the current selection is
 * readable without opening anything: with twenty countries available the
 * closed-state summary "5 selected" is exactly the information the person needs
 * and exactly what a count withholds.
 */
function CountryPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (code: string) =>
    onChange(
      selected.includes(code)
        ? selected.filter((c) => c !== code)
        : [...selected, code],
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open}>
              {selected.length === 0
                ? "Choose countries"
                : `${selected.length} of ${SWEEP_COUNTRIES.length} selected`}
              <ChevronsUpDown className="size-4 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search countries" />
              <CommandList>
                <CommandEmpty>No country matches.</CommandEmpty>
                <CommandGroup>
                  {SWEEP_COUNTRIES.map((country) => {
                    const active = selected.includes(country.code);
                    return (
                      <CommandItem
                        key={country.code}
                        value={`${country.name} ${country.code}`}
                        onSelect={() => toggle(country.code)}
                      >
                        <Check
                          className={cn(
                            "size-4",
                            active ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="flex-1">{country.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {country.code}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(SWEEP_COUNTRIES.map((c) => c.code))}
        >
          All
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onChange([])}>
          Clear
        </Button>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((code) => {
            const country = SWEEP_COUNTRIES.find((c) => c.code === code);
            return (
              <Badge key={code} variant="secondary" className="gap-1 font-normal">
                {country?.name ?? code}
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  className="opacity-60 hover:opacity-100"
                  aria-label={`Remove ${country?.name ?? code}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client picker
// ---------------------------------------------------------------------------

/**
 * Single-select over every client on the platform, searchable.
 *
 * Searchable rather than a plain select because this list spans every account
 * and is the one control here that grows without bound. The account name sits
 * beside each client because two BAs can both have a client called "Global
 * Traders", and picking the wrong one files the card under the wrong customer.
 */
function ClientPicker({
  clients,
  selectedId,
  onChange,
}: {
  clients: ClientOption[];
  selectedId: string | null;
  onChange: (client: ClientOption | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const selected = clients.find((client) => client.id === selectedId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open}>
            {selected ? selected.companyName : "No client linked"}
            <ChevronsUpDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search clients" />
            <CommandList>
              <CommandEmpty>No client matches.</CommandEmpty>
              <CommandGroup>
                {clients.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={`${client.companyName} ${client.orgName}`}
                    onSelect={() => {
                      onChange(client.id === selectedId ? null : client);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        client.id === selectedId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate">{client.companyName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {client.orgName}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weight picker
// ---------------------------------------------------------------------------

/**
 * Presets first, individual slabs second.
 *
 * "Up to 30kg" is what somebody actually wants nine times out of ten, and
 * making them tick twenty-six boxes to express it would be the kind of
 * thoroughness that reads as an unfinished tool.
 */
function WeightPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (next: number[]) => void;
}) {
  const presets: { label: string; max: number }[] = [
    { label: "Up to 5kg", max: 5 },
    { label: "Up to 10kg", max: 10 },
    { label: "Up to 30kg", max: 30 },
    { label: "Up to 50kg", max: 50 },
    { label: "Everything", max: Infinity },
  ];

  const toggle = (weight: number) =>
    onChange(
      selected.includes(weight)
        ? selected.filter((w) => w !== weight)
        : [...selected, weight].sort((a, b) => a - b),
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const value = WEIGHT_SLABS_KG.filter((w) => w <= preset.max);
          const active =
            value.length === selected.length &&
            value.every((w) => selected.includes(w));

          return (
            <Button
              key={preset.label}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => onChange(value)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-lg border p-3">
        {WEIGHT_SLABS_KG.map((weight) => {
          const active = selected.includes(weight);
          return (
            <button
              key={weight}
              type="button"
              onClick={() => toggle(weight)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs tabular-nums transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {weight}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.length} slab{selected.length === 1 ? "" : "s"} selected.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  description,
  tone = "default",
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
  tone?: "default" | "danger";
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-4 text-left transition-colors",
        active
          ? tone === "danger"
            ? "border-destructive bg-destructive/5"
            : "border-foreground bg-accent"
          : "hover:bg-accent/50",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        {active ? <Check className="ml-auto size-4" /> : null}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function ToggleRow({
  checked,
  onChange,
  label,
  detail,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}
