"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { carrierLabel } from "@/lib/rateSweep/carrier";
import { SWEEP_COUNTRIES, WEIGHT_SLABS_KG } from "@/lib/rateSweep/config";
import type { MatrixRow } from "@/lib/rateSweep/queries";

/**
 * The stored rates, filterable by lane, vendor and weight.
 *
 * Filters are links rather than a form, so every view is a URL somebody can
 * paste into a message. That matters more here than the interaction polish: the
 * usual reason to open this screen is to show a colleague that one specific
 * lane looks wrong.
 *
 * With no vendor selected the parent query returns the cheapest comparable rate
 * per lane, which is the shape a quotation is built from. Selecting a vendor
 * switches to every product that vendor quoted, which is the shape you need
 * when the cheapest one looks implausible.
 */
export function MatrixBrowser({
  rows,
  runId,
  vendorIds,
  carriers,
  selected,
}: {
  rows: MatrixRow[];
  runId: string;
  vendorIds: string[];
  /** Carrier codes actually present in this run, so the filter has no dead chips. */
  carriers: string[];
  selected: { country?: string; vendor?: string; carrier?: string; weight?: string };
}) {
  const base = `/arena-dashboard/rate-sweeps/${runId}`;

  const hrefWith = (patch: Partial<typeof selected>) => {
    const next = { ...selected, ...patch };
    const params = new URLSearchParams();
    if (next.country) params.set("country", next.country);
    if (next.vendor) params.set("vendor", next.vendor);
    if (next.carrier) params.set("carrier", next.carrier);
    if (next.weight) params.set("weight", next.weight);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border p-3">
        <FilterRow label="Country">
          <FilterChip href={hrefWith({ country: undefined })} active={!selected.country}>
            All
          </FilterChip>
          {SWEEP_COUNTRIES.map((country) => (
            <FilterChip
              key={country.code}
              href={hrefWith({ country: country.code })}
              active={selected.country === country.code}
            >
              {country.code}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Vendor">
          <FilterChip href={hrefWith({ vendor: undefined })} active={!selected.vendor}>
            Cheapest of all
          </FilterChip>
          {vendorIds.map((vendorId) => (
            <FilterChip
              key={vendorId}
              href={hrefWith({ vendor: vendorId })}
              active={selected.vendor === vendorId}
            >
              {vendorId}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Carrier">
          <FilterChip href={hrefWith({ carrier: undefined })} active={!selected.carrier}>
            All
          </FilterChip>
          {carriers.map((code) => (
            <FilterChip
              key={code}
              href={hrefWith({ carrier: code })}
              active={selected.carrier === code}
            >
              {carrierLabel(code)}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Weight">
          <FilterChip href={hrefWith({ weight: undefined })} active={!selected.weight}>
            All
          </FilterChip>
          {WEIGHT_SLABS_KG.map((weight) => (
            <FilterChip
              key={weight}
              href={hrefWith({ weight: String(weight) })}
              active={selected.weight === String(weight)}
            >
              {weight}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No rates stored for that combination.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lane</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Before tax</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">All in</TableHead>
                <TableHead className="text-right">Transit</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row.vendorId}-${row.destCountryCode}-${row.weightKg}-${index}`}>
                  <TableCell className="font-medium">{row.destCountryCode}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {trimWeight(row.weightKg)}kg
                  </TableCell>
                  <TableCell>{row.vendorId}</TableCell>
                  <TableCell className="font-medium">
                    {carrierLabel(row.carrier)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {/* Raw vendor product name. This screen is internal, and
                        masking it here would hide which carrier is actually
                        cheapest on a lane, which is the whole point. Customer
                        surfaces brand it through lib/branding. */}
                    {row.productName}
                    {!row.isComparable ? (
                      <Badge variant="outline" className="ml-2 font-normal">
                        {row.currency}, not compared
                      </Badge>
                    ) : null}
                    {/* The terms behind the price. A duty-unpaid rate ranked
                        against duty-paid ones looks cheapest and leaves the
                        customer a customs bill, so it is never left implicit. */}
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {row.dutyMode !== "UNKNOWN" ? (
                        <Tag>{row.dutyMode === "DUTY_PAID" ? "duty paid" : "duty unpaid"}</Tag>
                      ) : null}
                      {row.contentType !== "UNKNOWN" ? (
                        <Tag>
                          {row.contentType === "DOCUMENTS" ? "documents" : "non-documents"}
                        </Tag>
                      ) : null}
                      {row.pickupIncluded === true ? <Tag>pickup</Tag> : null}
                      {row.pickupIncluded === false ? <Tag>no pickup</Tag> : null}
                      {row.restrictionNote ? <Tag>{row.restrictionNote}</Tag> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(row.totalWithoutTax, row.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {money(row.taxAmount, row.currency)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {money(row.totalWithTax, row.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.tatDays > 0 ? `${row.tatDays}d` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {rows.length} rows, capped at 500. Use the CSV export for the
        whole run.
      </p>
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-16 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={
        active
          ? "rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background"
          : "rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </Link>
  );
}

/** A service term, small enough to sit under the name without competing with it. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border px-1 py-px text-[10px] uppercase tracking-wide">
      {children}
    </span>
  );
}

/** "2.500" from a Decimal column reads better as "2.5". */
function trimWeight(value: string): string {
  return String(Number(value));
}

function money(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
