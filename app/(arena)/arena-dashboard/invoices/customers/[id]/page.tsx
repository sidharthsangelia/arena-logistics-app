import { Suspense, cache } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, ExternalLink, Link2, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getArenaAuth } from "@/utils/arena-auth";
import { formatDate } from "@/utils/format";
import { BillingPartyKind } from "@/generated/prisma";
import {
  getBillingParty,
  getBillingPartyLink,
  getBillingPartyStats,
  getManualInvoicesPage,
} from "@/lib/invoices/manual/queries";

/**
 * Four streamed sections below ask for the same three reads between them, and
 * Prisma calls are not deduplicated on their own. react's cache() makes each
 * one happen once per render, so splitting the page into boundaries costs
 * nothing extra in queries.
 */
const partyOnce = cache(getBillingParty);
const statsOnce = cache(getBillingPartyStats);
const linkOnce = cache(getBillingPartyLink);
import { formatMoney } from "@/lib/invoices/manual/config";
import { BillingPartyActions } from "@/components/invoices/customers/BillingPartyActions";
import { BillingPartyDriftNotice } from "@/components/invoices/customers/BillingPartyDriftNotice";
import {
  BillingPartyInvoices,
  BillingPartyInvoicesSkeleton,
} from "@/components/invoices/customers/BillingPartyInvoices";

export const metadata = {
  title: "Customer",
};

/**
 * One billing customer: who they are, what has been billed to them, and what
 * can still be corrected.
 *
 * A flat document rather than a grid of cards, matching the invoice and client
 * detail pages.
 *
 * ── EDITING HERE CANNOT CHANGE AN ISSUED INVOICE ────────────────────────────
 * Every invoice snapshots the party onto itself when it is issued and the
 * rendered PDF is stored, not re-rendered on download. So a correction on this
 * page changes what the NEXT invoice prints and nothing a customer is already
 * holding. That is the correct behaviour for a tax document, and it is why this
 * screen can be handed to whoever answers the phone.
 */
export default async function BillingCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { isArenaAdmin } = await getArenaAuth();
  if (!isArenaAdmin) redirect("/arena-dashboard");

  const { id } = await params;
  const party = await partyOnce(id);
  if (!party) notFound();

  const individual = party.kind === BillingPartyKind.INDIVIDUAL;

  const particulars: Array<[string, string | null]> = [
    ["Trading name", individual ? null : party.tradeName],
    ["Customer code", party.customerCode],
    // "Unregistered" is a real fact about a company and changes what its
    // invoice prints. Against a person's name it would report the absence of
    // something never expected, so it is stated only for a business.
    ["GSTIN", individual ? null : party.gstin ?? "Unregistered"],
    ["PAN", party.pan],
    ["CIN", individual ? null : party.cin],
    ["Contact", party.contactName],
    ["Email", party.email],
    ["Phone", party.phone],
    [
      "Address",
      [party.addressLine1, party.addressLine2, party.city, party.postalCode]
        .filter(Boolean)
        .join(", ") || null,
    ],
    ["State", party.state],
    ["Country", party.country],
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
        <Link href="/arena-dashboard/invoices/customers">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Billing customers
        </Link>
      </Button>

      {/* ── hero ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {party.legalName}
            </h1>
            <Badge variant="secondary" className="gap-1.5">
              {individual ? (
                <User className="h-3 w-3" />
              ) : (
                <Building2 className="h-3 w-3" />
              )}
              {individual ? "Individual" : "Business"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[party.tradeName, party.city, party.state]
              .filter(Boolean)
              .join("  ·  ") || "No address on file"}
          </p>
        </div>

        {/* Money is streamed: it is three aggregate queries, and the customer's
            name and address are what somebody opening this page came for. */}
        <Suspense fallback={<BilledSkeleton />}>
          <BilledTotal id={id} />
        </Suspense>
      </div>

      {/* ── actions ──────────────────────────────────────────────────── */}
      <div className="mt-5">
        <Suspense fallback={<ActionsSkeleton />}>
          <Actions id={id} />
        </Suspense>
      </div>

      {/* ── linked account, and any drift from it ────────────────────── */}
      <Suspense fallback={null}>
        <LinkedAccount id={id} />
      </Suspense>

      {/* ── particulars ──────────────────────────────────────────────── */}
      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Details
      </h2>
      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {particulars
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm break-words">{value}</dd>
            </div>
          ))}
      </dl>

      {party.notes ? (
        <>
          <Separator className="my-7" />
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Notes
          </h2>
          <p className="mt-3 text-sm whitespace-pre-wrap">{party.notes}</p>
        </>
      ) : null}

      {/* ── invoice history ──────────────────────────────────────────── */}
      <Separator className="my-7" />
      <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Invoices
      </h2>
      <div className="mt-4">
        <Suspense fallback={<BillingPartyInvoicesSkeleton />}>
          <History id={id} />
        </Suspense>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streamed sections
// ---------------------------------------------------------------------------

/**
 * The headline figure.
 *
 * "Billed" is issued plus paid: a draft has claimed nothing and a cancelled
 * invoice has un-claimed it. Outstanding sits under it because it is the number
 * somebody actually acts on.
 */
async function BilledTotal({ id }: { id: string }) {
  const stats = await statsOnce(id);

  if (stats.invoiceCount === 0) {
    return (
      <div className="text-right">
        <p className="text-sm text-muted-foreground">Never invoiced</p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-xs text-muted-foreground">
        Billed{stats.mixedCurrency ? ` (${stats.currency} only)` : ""}
      </p>
      <p className="text-3xl font-semibold tabular-nums">
        {formatMoney(stats.billedAmount, stats.currency)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {stats.outstandingAmount > 0 ? (
          <>
            {formatMoney(stats.outstandingAmount, stats.currency)} outstanding
            {stats.overdueCount > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                {" "}
                &middot; {stats.overdueCount} overdue
              </span>
            ) : null}
          </>
        ) : (
          "All settled"
        )}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {stats.issuedCount} invoice{stats.issuedCount === 1 ? "" : "s"} since{" "}
        {formatDate(stats.firstInvoicedAt)}
      </p>
    </div>
  );
}

function BilledSkeleton() {
  return (
    <div className="flex flex-col items-end">
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-2 h-8 w-36" />
      <Skeleton className="mt-2 h-3 w-32" />
      <Skeleton className="mt-1.5 h-3 w-40" />
    </div>
  );
}

/**
 * Remove is offered only to a customer nobody has ever issued an invoice to, so
 * the buttons wait on that count rather than rendering one that would be
 * refused by the action a moment later.
 */
async function Actions({ id }: { id: string }) {
  const [party, stats] = await Promise.all([partyOnce(id), statsOnce(id)]);
  if (!party) return null;

  return <BillingPartyActions party={party} issuedCount={stats.issuedCount} />;
}

function ActionsSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

/**
 * Where this customer came from, when they came from somewhere.
 *
 * Most parties were typed into the invoice form and have no link at all, which
 * is why this section renders nothing rather than saying "not linked": an
 * absence that is the norm is not news.
 */
async function LinkedAccount({ id }: { id: string }) {
  const [link, stats] = await Promise.all([linkOnce(id), statsOnce(id)]);
  if (!link) return null;

  const href =
    link.source === "ORG"
      ? `/arena-dashboard/accounts/${link.id}`
      : `/arena-dashboard/clients/${link.id}`;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span>
          {link.source === "ORG"
            ? "Signed up on the platform as"
            : "A business associate's client"}{" "}
          <span className="font-medium">{link.name}</span>
          {link.ownerName ? (
            <span className="text-muted-foreground"> of {link.ownerName}</span>
          ) : null}
        </span>

        {link.present ? (
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href={href}>
              Open
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            That record has since been deleted
          </span>
        )}
      </div>

      {/* A linked org's booking invoices are a different debt: raised by the
          platform against a shipment and settled from a wallet, not chased on a
          due date. Pointed at, never added in. */}
      {stats.bookingInvoiceCount ? (
        <p className="px-1 text-xs text-muted-foreground">
          They also have {stats.bookingInvoiceCount} booking invoice
          {stats.bookingInvoiceCount === 1 ? "" : "s"} raised automatically
          against their shipments.{" "}
          <Link
            href="/arena-dashboard/invoices"
            className="underline underline-offset-2"
          >
            See all invoices
          </Link>
          .
        </p>
      ) : null}

      <BillingPartyDriftNotice partyId={id} link={link} />
    </div>
  );
}

async function History({ id }: { id: string }) {
  // Every invoice raised to this customer on one screen. Fifty is more than any
  // real customer has, and paging a history somebody is scanning for one number
  // would hide the number.
  const page = await getManualInvoicesPage({
    partyId: id,
    page: 1,
    pageSize: 50,
    sortField: "issueDate",
    sortDir: "desc",
    statusFilter: "ALL",
  });

  return <BillingPartyInvoices rows={page.rows} />;
}
