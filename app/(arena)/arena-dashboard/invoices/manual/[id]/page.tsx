import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getArenaAuth } from "@/utils/arena-auth";
import { ManualInvoiceStatus } from "@/generated/prisma";
import { getManualInvoiceDetail } from "@/lib/invoices/manual/queries";
import {
  MANUAL_STATUS_TONE,
  csbLabel,
  formatMoney,
  partySubtitle,
  paymentTermLabel,
} from "@/lib/invoices/manual/config";
import { ManualInvoiceActions } from "@/components/invoices/manual/ManualInvoiceActions";

export const metadata = {
  title: "Invoice",
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/**
 * One issued invoice: what it says, and what can still be done to it.
 *
 * A flat document rather than a grid of cards, matching the shipment and client
 * detail pages. The PDF is the artefact; this page exists to answer "has it been
 * paid, has it been sent, and what is on it" without opening the file.
 */
export default async function ManualInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  const { id } = await params;
  const invoice = await getManualInvoiceDetail(id);
  if (!invoice) notFound();

  // A draft has no number and no PDF, so there is nothing to show here yet.
  if (invoice.status === ManualInvoiceStatus.DRAFT) {
    redirect(`/arena-dashboard/invoices/manual/${id}/edit`);
  }

  const tone = MANUAL_STATUS_TONE[invoice.view];
  const party = invoice.party;

  const facts: Array<[string, string | null]> = [
    ["Issued", formatDate(invoice.issueDate)],
    ["Due", formatDate(invoice.dueDate)],
    ["Terms", paymentTermLabel(invoice.paymentTerms)],
    ["Reference", invoice.reference],
    ["Category", csbLabel(invoice.csbCategory)],
    ["Place of supply", invoice.placeOfSupplyName],
    ["Reverse charge", invoice.reverseCharge ? "Yes" : null],
    ["IRN", invoice.irn],
    ["Raised by", invoice.createdByName],
    ["Paid", formatDate(invoice.paidAt)],
    [
      "Sent",
      invoice.lastSentAt
        ? `${formatDate(invoice.lastSentAt)} to ${invoice.lastSentTo}`
        : null,
    ],
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/arena-dashboard/invoices">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Invoices
        </Link>
      </Button>

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight tabular-nums">
              {invoice.invoiceNumber}
            </h1>
            <Badge variant="outline" className={tone.className}>
              {tone.label}
            </Badge>
            {invoice.docType === "CREDIT_NOTE" ? (
              <Badge variant="secondary">Credit note</Badge>
            ) : null}
          </div>
          {/* "Unregistered" is a fact worth stating about a company and
              meaningless against a person's name. See partySubtitle. */}
          <p className="mt-1 text-sm text-muted-foreground">
            {party ? `${party.legalName}  ·  ${partySubtitle(party)}` : null}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            Total {invoice.currency}
          </p>
          <p className="text-3xl font-semibold tabular-nums">
            {formatMoney(
              invoice.consignments.reduce(
                (sum, c) =>
                  sum +
                  c.charges.reduce(
                    (s, ch) => s + Math.max(0, ch.amount - ch.discount),
                    0,
                  ),
                0,
              ),
              invoice.currency,
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            before tax, as entered
          </p>
        </div>
      </div>

      {/* ── actions ──────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {invoice.fileUrl ? (
          <Button asChild variant="outline">
            <a href={invoice.fileUrl} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </Button>
        ) : null}

        <ManualInvoiceActions
          id={invoice.id}
          status={invoice.status}
          partyEmail={party?.email ?? null}
          alreadySent={!!invoice.lastSentAt}
        />
      </div>

      {invoice.cancelledReason ? (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          Cancelled: {invoice.cancelledReason}
        </p>
      ) : null}

      {/* ── facts ────────────────────────────────────────────────────── */}
      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Details
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm break-words">{value}</dd>
            </div>
          ))}
      </dl>

      {/* ── consignments ─────────────────────────────────────────────── */}
      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {invoice.consignments.length === 1 ? "Consignment" : "Consignments"}
      </h2>

      <div className="mt-4 space-y-6">
        {invoice.consignments.map((c, index) => {
          const chips: Array<[string, string | null]> = [
            ["Forwarder", c.forwarderName],
            ["Prod type", c.productType],
            ["Service", c.serviceType],
            ["Tracking", c.trackingNumber],
            ["Ship mode", c.shipMode],
            ["Parcel type", c.parcelType],
            [
              "Ports",
              [c.originPort, c.destinationPort].filter(Boolean).join(" → ") ||
                null,
            ],
            ["Booked", formatDate(c.bookingDate)],
            ["Picked up", formatDate(c.pickupDate)],
            ["MAWB", c.mawbNumber],
            ["Flight", c.flightNumber],
            ["Airline", c.airlineName],
            ["Pieces", c.pieces === null ? null : String(c.pieces)],
            [
              "Gross wt",
              c.grossWeightKg === null ? null : `${c.grossWeightKg} kg`,
            ],
            [
              "Ch. wt",
              c.chargeableWeightKg === null
                ? null
                : `${c.chargeableWeightKg} kg`,
            ],
            ["Job", c.jobNumber],
            ["Shipper", c.shipperName],
            ["Consignee", c.consigneeName],
            ["Shipper inv.", c.exportInvoiceNo],
            // One field since the merge. An invoice issued under the old
            // two-field shape still has both, so they are joined rather than
            // the second one vanishing from a document already sent.
            [
              "Goods",
              [c.goodsDescription, c.particulars]
                .map((v) => v?.trim())
                .filter(Boolean)
                .join(". ") || null,
            ],
          ].filter(([, v]) => !!v) as Array<[string, string]>;

          return (
            <div key={c.id}>
              <div className="flex flex-wrap items-baseline gap-3">
                {invoice.consignments.length > 1 ? (
                  <span className="text-sm text-muted-foreground">
                    {index + 1}
                  </span>
                ) : null}
                <span className="font-medium tabular-nums">
                  {c.awbNumber ?? c.jobNumber ?? "Services"}
                </span>
                {c.origin || c.destination ? (
                  <span className="text-sm text-muted-foreground">
                    {[c.origin, c.destination].filter(Boolean).join(" to ")}
                  </span>
                ) : null}
                {c.originPostalCode || c.destinationPostalCode ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {[c.originPostalCode, c.destinationPostalCode]
                      .filter(Boolean)
                      .join(" \u2192 ")}
                  </span>
                ) : null}
              </div>

              {chips.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                  {chips.map(([label, value]) => (
                    <span key={label} className="text-xs text-muted-foreground">
                      {label}{" "}
                      <span className="text-foreground">{value}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-md text-sm">
                  <tbody>
                    {c.charges.map((charge) => (
                      <tr key={charge.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-4">
                          {charge.label}
                          {charge.reimbursement ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              paid on their behalf
                            </span>
                          ) : null}
                        </td>
                        <td className="w-20 py-1.5 pr-4 text-right text-xs text-muted-foreground tabular-nums">
                          {charge.reimbursement
                            ? "no GST"
                            : `${charge.ratePercent}%`}
                        </td>
                        <td className="w-28 py-1.5 text-right tabular-nums">
                          {formatMoney(
                            Math.max(0, charge.amount - charge.discount),
                            invoice.currency,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {invoice.notes ? (
        <>
          <Separator className="my-7" />
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Notes
          </h2>
          <p className="mt-3 text-sm">{invoice.notes}</p>
        </>
      ) : null}
    </div>
  );
}
