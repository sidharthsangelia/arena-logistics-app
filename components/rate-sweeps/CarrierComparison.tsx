"use client";

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { carrierLabel } from "@/lib/rateSweep/carrier";
import { SWEEP_COUNTRIES, WEIGHT_SLABS_KG } from "@/lib/rateSweep/config";
import type { CarrierComparisonCell } from "@/lib/rateSweep/queries";

/**
 * One carrier per row, one vendor per column, for a single lane and weight.
 *
 * This is the table the whole carrier column was added for. "Which of our four
 * vendors sells the cheapest FedEx to the US at 5kg" is not answerable from the
 * cheapest-of view, because that view only ever shows one winner and hides the
 * fact that three vendors were selling the same carrier at three prices.
 *
 * The cheapest cell in each row is marked. Reading down that marked column tells
 * you something the per-lane winner never does: whether one vendor is
 * systematically better on this lane, or whether it changes carrier by carrier.
 *
 * Reseller own-brand networks are absent by design (see compareCarriers). They
 * have exactly one seller each, so a row for them would be a single number
 * under a heading that promises a comparison.
 */
export function CarrierComparison({
  cells,
  vendorIds,
  runId,
  country,
  weight,
}: {
  cells: CarrierComparisonCell[];
  vendorIds: string[];
  runId: string;
  country: string;
  weight: string;
}) {
  const base = `/arena-dashboard/rate-sweeps/${runId}`;

  const hrefWith = (patch: { country?: string; weight?: string }) => {
    const params = new URLSearchParams();
    params.set("cmpCountry", patch.country ?? country);
    params.set("cmpWeight", patch.weight ?? weight);
    return `${base}?${params.toString()}#carriers`;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border p-3">
        <FilterRow label="Lane">
          {SWEEP_COUNTRIES.map((c) => (
            <FilterChip
              key={c.code}
              href={hrefWith({ country: c.code })}
              active={country === c.code}
            >
              {c.code}
            </FilterChip>
          ))}
        </FilterRow>

        <FilterRow label="Weight">
          {WEIGHT_SLABS_KG.map((kg) => (
            <FilterChip
              key={kg}
              href={hrefWith({ weight: String(kg) })}
              active={weight === String(kg)}
            >
              {kg}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      {cells.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No comparable carrier rates stored for {country} at {weight}kg.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                {vendorIds.map((vendorId) => (
                  <TableHead key={vendorId} className="text-right">
                    {vendorId}
                  </TableHead>
                ))}
                <TableHead className="text-right">Spread</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {cells.map((cell) => {
                const prices = Object.values(cell.byVendor).map((v) =>
                  Number(v.totalWithTax),
                );
                const cheapest = Math.min(...prices);
                const dearest = Math.max(...prices);

                return (
                  <TableRow key={cell.carrier}>
                    <TableCell className="font-medium">
                      {carrierLabel(cell.carrier)}
                    </TableCell>

                    {vendorIds.map((vendorId) => {
                      const quote = cell.byVendor[vendorId];

                      if (!quote) {
                        return (
                          <TableCell
                            key={vendorId}
                            className="text-right text-muted-foreground"
                          >
                            —
                          </TableCell>
                        );
                      }

                      const isBest = vendorId === cell.bestVendorId;

                      return (
                        <TableCell key={vendorId} className="text-right">
                          <div
                            className={
                              isBest
                                ? "font-semibold tabular-nums"
                                : "tabular-nums text-muted-foreground"
                            }
                          >
                            {money(quote.totalWithTax)}
                            {isBest ? (
                              <Badge variant="secondary" className="ml-2 font-normal">
                                best
                              </Badge>
                            ) : null}
                          </div>
                          {/* The service name matters as much as the price: a
                              cheap FedEx row that turns out to be the documents
                              product is not a cheap parcel rate. */}
                          <div className="text-xs text-muted-foreground">
                            {quote.productName}
                            {quote.tatDays > 0 ? ` · ${quote.tatDays}d` : ""}
                          </div>
                        </TableCell>
                      );
                    })}

                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {prices.length > 1
                        ? `${Math.round(((dearest - cheapest) / cheapest) * 100)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
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

function money(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
