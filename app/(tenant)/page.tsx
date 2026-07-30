import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";

import type { ShipmentStatus, QuoteStatus, WalletTxnType } from "@/generated/prisma";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import {
  Wallet,
  Truck,
  Clock,
  PackageCheck,
  Users,
  FileText,
  Plus,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  AlertTriangle,
  ShieldCheck,
  Inbox,
  Building2,
  Receipt,
  Plane,
  Hash,
  ChevronRight,
  ExternalLink,
  CalendarClock,
  FileSearch,
} from "lucide-react";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
// Still used by ClientsCard below, which is currently commented out of the page
// but kept intact — see the note at its call site.
import { prisma } from "@/utils/db";
import { getCurrentOrg, getOrgShell } from "@/utils/tenant";
import { getCachedWalletBalance } from "@/lib/wallet/queries";
import { resolveLowBalanceThreshold } from "@/utils/wallet/config";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import {
  getDashboardAlerts,
  getQuotesSummary,
  getRecentShipments,
  getRecentWalletActivity,
  getShipmentStats,
} from "@/lib/dashboard/tenantOverview";

// ─────────────────────────────────────────────────────────────────────────────
// Data flow / streaming model
// ─────────────────────────────────────────────────────────────────────────────
// Each section is an independent async server component behind its own
// <Suspense> boundary, so the page shell renders immediately and every card
// streams in the moment its own data resolves. Nothing on this page blocks the
// shell: the only thing the page body itself awaits is getOrgShell(), a cached
// two-column read that does not go to the database on a warm cache.
//
// The queries behind the cards live in lib/dashboard/tenantOverview.ts, each
// with a TTL picked for how fast that particular card's data actually moves
// (10s for shipment counts, 60s for document-expiry alerts, and so on — the
// reasoning is written up per-fetcher there). The wallet balance is the one
// number with no TTL at all: it is cached until a balance write invalidates it,
// so it is both instant and never stale. See lib/wallet/queries.ts.
//
// The greeting needs the full org row (company name), which is deliberately
// uncached because that row carries mutable, sensitive fields. So it streams
// too, rather than holding up the header it sits in.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatMoney(amount: number | string, currency = "INR") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  // Pin the zone so the server (UTC) and the browser (IST) format the same day.
  // Without this, timestamps near midnight UTC hydrate as different dates.
  timeZone: "Asia/Kolkata",
});

function formatDate(date: Date) {
  return dateFormatter.format(date);
}

function daysUntil(date: Date) {
  const ms = date.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote status styling (mirrors STATUS_CONFIG's pattern for ShipmentStatus)
// ─────────────────────────────────────────────────────────────────────────────

const QUOTE_STATUS_CONFIG: Record<QuoteStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-secondary text-secondary-foreground border-border" },
  SENT: {
    label: "Sent",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  ACCEPTED: {
    label: "Accepted",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  },
  EXPIRED: { label: "Expired", className: "bg-secondary text-muted-foreground border-border" },
  CANCELLED: { label: "Cancelled", className: "bg-secondary text-muted-foreground border-border" },
};

const CREDIT_TXN_TYPES: WalletTxnType[] = ["TOP_UP", "REFUND", "MANUAL_CREDIT"];

const WALLET_TXN_LABELS: Record<WalletTxnType, { label: string; tooltip: string }> = {
  TOP_UP: { label: "Wallet top-up", tooltip: "Funds added to your wallet" },
  SHIPMENT_DEBIT: { label: "Shipment charge", tooltip: "Amount debited to pay for a shipment" },
  REFUND: { label: "Refund", tooltip: "Amount credited back to your wallet" },
  MANUAL_CREDIT: {
    label: "Added by Arena",
    tooltip: "Money our team added to your wallet, usually a payment you made outside the app",
  },
  MANUAL_DEBIT: {
    label: "Corrected by Arena",
    tooltip: "Money our team took out of your wallet to correct an earlier entry",
  },
  ADJUSTMENT: { label: "Adjustment", tooltip: "A manual correction made by our operations team" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational components
// ─────────────────────────────────────────────────────────────────────────────

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const config = QUOTE_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}

// Full-row/card overlay link. Placed inside the first cell/child of a
// position-relative row so the entire row becomes a single click target
// while keeping valid table markup (the <a> only ever lives inside a <td>).
function RowLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    />
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tooltip,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tooltip?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {label}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons — one per streamed section, sized to match its real content so the
// layout never jumps when the data lands.
// ─────────────────────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-7 w-16" />
        <Skeleton className="mt-2 h-3 w-28" />
      </CardContent>
    </Card>
  );
}

function TableCardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ListCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <CardContent className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </CardContent>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Streamed sections — each owns its own query and its own Suspense boundary.
// ─────────────────────────────────────────────────────────────────────────────

async function DashboardAlerts({ orgId }: { orgId: string }) {
  // Both reads are cached — the alerts on a 60s TTL (application status and
  // document expiry dates move on the order of days) and the balance until a
  // wallet write invalidates it.
  const [alerts, wallet] = await Promise.all([
    getDashboardAlerts(orgId),
    getCachedWalletBalance(orgId),
  ]);

  const { pendingBaApplicationAt, expiringDocs } = alerts;
  const walletBalance = Number(wallet.balance);
  const lowBalance = wallet.exists && walletBalance < resolveLowBalanceThreshold();

  if (!pendingBaApplicationAt && !lowBalance && expiringDocs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {pendingBaApplicationAt && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Business Associate application in review</AlertTitle>
          <AlertDescription>
            Submitted on {formatDate(new Date(pendingBaApplicationAt))}. We&apos;ll notify
            you once it&apos;s been reviewed.
          </AlertDescription>
        </Alert>
      )}

      {lowBalance && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Wallet balance is running low</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your balance is {formatMoney(walletBalance, wallet.currency)}. Top up to
              avoid delays booking new shipments.
            </span>
            <Button size="sm" variant="outline" asChild>
              <Link href="/wallet">Top up now</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {expiringDocs.length > 0 && (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>
            {expiringDocs.length === 1 ? "A document is" : "Documents are"} expiring soon
          </AlertTitle>
          <AlertDescription>
            {expiringDocs.map((d) => d.label).join(", ")}{" "}
            {expiringDocs.length === 1 ? "expires" : "expire"} within 30 days.{" "}
            <Link href="/document-vault" className="underline underline-offset-2">
              Review documents
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

async function WalletBalanceCard({ orgId }: { orgId: string }) {
  const wallet = await getCachedWalletBalance(orgId);

  return (
    <StatCard
      label="Wallet Balance"
      value={formatMoney(wallet.balance, wallet.currency)}
      sub={wallet.exists ? "Available to spend" : "Wallet not set up yet"}
      icon={Wallet}
      tooltip="Funds used to pay for shipments and services booked through your account."
    />
  );
}

async function ShipmentStatCards({ orgId }: { orgId: string }) {
  const stats = await getShipmentStats(orgId);

  return (
    <>
      <StatCard
        label="Active Shipments"
        value={stats.activeCount}
        sub="Booked through out-for-delivery"
        icon={Truck}
        tooltip="Shipments currently in progress: booked, processing, in transit, on customs hold, or out for delivery."
      />
      <StatCard
        label="Needs Your Attention"
        value={stats.needsAttentionCount}
        sub="Drafts, payments & documents"
        icon={Clock}
        tooltip="Shipments that are drafted, awaiting payment, or waiting on documents from you."
      />
      <StatCard
        label="Delivered This Month"
        value={stats.deliveredThisMonth}
        sub={`${stats.totalCount} shipments all time`}
        icon={PackageCheck}
        tooltip="Shipments marked delivered since the 1st of this month."
      />
    </>
  );
}

async function RecentShipments({ orgId }: { orgId: string }) {
  const recentShipments = await getRecentShipments(orgId);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-semibold">Recent Shipments</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Your last {recentShipments.length} booking{recentShipments.length === 1 ? "" : "s"}
            . Select one for full details
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
          <Link href="/shipments">
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {recentShipments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No shipments yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Book your first shipment to see it show up here.
              </p>
            </div>
            <Button size="sm" className="gap-1.5 mt-1" asChild>
              <Link href="/book">
                <Plus className="h-3.5 w-3.5" />
                New Shipment
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Shipment</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Tracking
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        House Air Waybill (HAWB) and carrier, once assigned by our
                        operations team.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentShipments.map((s) => (
                <TableRow
                  key={s.id}
                  className="relative cursor-pointer hover:bg-muted/50 transition-colors group"
                >
                  <TableCell className="pl-6 py-3 relative">
                    <RowLink
                      href={`/shipments/${s.id}`}
                      label={`View shipment ${s.shipmentNumber}`}
                    />
                    <p className="text-sm font-medium leading-tight font-mono">
                      {s.shipmentNumber}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.clientName ?? "For your organisation"} ·{" "}
                      {formatDate(new Date(s.createdAt))}
                    </p>
                  </TableCell>
                  <TableCell className="px-3 py-3 font-mono text-xs">
                    {s.fromCity} → {s.toCity}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {s.hawbNumber ? (
                      <>
                        <p className="text-xs font-mono flex items-center gap-1">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          {s.hawbNumber}
                        </p>
                        {s.carrierAirline && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Plane className="h-3 w-3" />
                            {s.carrierAirline}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        Pending assignment
                      </span>
                    )}
                  </TableCell>
                  <TableCell className=" py-3 text-sm tabular-nums font-medium">
                    {s.quotedTotal ? formatMoney(s.quotedTotal, s.currency) : "—"}
                  </TableCell>
                  <TableCell className="pr-6 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <ShipmentStatusBadge status={s.status} />
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

async function WalletActivity({ orgId }: { orgId: string }) {
  const recentWalletTxns = await getRecentWalletActivity(orgId);

  return (
    <Card>
      <CardHeader className="">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Wallet Activity</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Last {recentWalletTxns.length || 0} transactions
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
            <Link href="/wallet">
              <Receipt className="h-3 w-3" />
              Ledger
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentWalletTxns.length === 0 ? (
          <p className="text-xs text-muted-foreground">No transactions yet.</p>
        ) : (
          recentWalletTxns.map((txn, i) => {
            const isCredit = CREDIT_TXN_TYPES.includes(txn.type);
            const meta = WALLET_TXN_LABELS[txn.type];
            return (
              <div key={txn.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-md border flex items-center justify-center shrink-0 ${
                        isCredit ? "text-emerald-600" : "text-muted-foreground"
                      }`}
                    >
                      {isCredit ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm font-medium leading-tight truncate cursor-help w-fit">
                            {meta.label}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px] text-xs">
                          {meta.tooltip}
                        </TooltipContent>
                      </Tooltip>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(new Date(txn.createdAt))}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm tabular-nums font-medium shrink-0 ${
                      isCredit ? "text-emerald-600" : ""
                    }`}
                  >
                    {isCredit ? "+" : "-"}
                    {formatMoney(txn.amount, txn.currency)}
                  </span>
                </div>
                {i < recentWalletTxns.length - 1 && <Separator className="mt-3" />}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

async function QuotesCard({ orgId }: { orgId: string }) {
  const { openCount: openQuotesCount, recent: recentQuotes } =
    await getQuotesSummary(orgId);

  return (
    <Card>
      <CardHeader className=" ">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Recent Quotes</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {openQuotesCount} open quote{openQuotesCount === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
            <Link href="/quotes">
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentQuotes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No quotes generated yet.</p>
        ) : (
          recentQuotes.map((q, i) => {
            const validUntil = new Date(q.validUntil);
            const remaining = daysUntil(validUntil);
            const expiringSoon =
              (q.status === "SENT" || q.status === "DRAFT") && remaining <= 3;
            const hasPdf = Boolean(q.pdfUrl);

            return (
              <div key={q.id}>
                <div
                  className={`relative rounded-md -mx-2 px-2 py-1 transition-colors ${
                    hasPdf ? "hover:bg-muted/50 cursor-pointer" : "opacity-70"
                  }`}
                >
                  {hasPdf && (
                    <RowLink
                      href={q.pdfUrl as string}
                      label={`Open PDF for quote ${q.quoteNumber}`}
                      external
                    />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight truncate flex items-center gap-1">
                        {q.quoteNumber}
                        {hasPdf ? (
                          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <FileSearch className="h-3 w-3 text-muted-foreground shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[200px] text-xs">
                              PDF hasn&apos;t been generated for this quote yet.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {q.clientName ?? "Unassigned"}
                      </p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p
                            className={`text-xs mt-0.5 flex items-center gap-1 w-fit cursor-help ${
                              expiringSoon ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {remaining >= 0
                              ? `Valid for ${remaining} more day${remaining === 1 ? "" : "s"}`
                              : "Expired"}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          Valid until {formatDate(validUntil)}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm tabular-nums font-medium">
                        {formatMoney(q.quotedTotal, q.currency)}
                      </p>
                      <QuoteStatusBadge status={q.status} />
                    </div>
                  </div>
                </div>
                {i < recentQuotes.length - 1 && <Separator className="mt-3" />}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

async function ClientsCard({ orgId }: { orgId: string }) {
  const recentClients = await prisma.client.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      companyName: true,
      companyKind: true,
      createdAt: true,
      _count: { select: { shipments: true } },
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            Your Clients
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">
                Shipments booked on behalf of these clients are billed to your wallet.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Businesses and individuals you book shipments for
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
          <Link href="/clients">
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {recentClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No clients added yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add a client to start booking shipments on their behalf.
              </p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5 mt-1" asChild>
              <Link href="/clients">
                <Plus className="h-3.5 w-3.5" />
                Add Client
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Shipments
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[200px] text-xs">
                        Total shipments booked for this client to date.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead className="pr-6">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentClients.map((c) => (
                <TableRow
                  key={c.id}
                  className="relative cursor-pointer hover:bg-muted/50 transition-colors group"
                >
                  <TableCell className="pl-6 relative">
                    <RowLink href={`/clients/${c.id}`} label={`View client ${c.companyName}`} />
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md border flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">{c.companyName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {c.companyKind === "COMPANY" ? "Company" : "Individual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {c._count.shipments}
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">
                        {formatDate(c.createdAt)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Greeting — the only thing on this page that needs the full (uncached) org row,
// so it streams on its own rather than holding the header back. The date beside
// it is pure computation and renders with the shell.
// ─────────────────────────────────────────────────────────────────────────────

async function Greeting() {
  const org = await getCurrentOrg();
  if (!org) redirect("/onboarding");

  return <>Welcome back, {org.companyName || org.name}</>;
}

async function OnboardingChecklistSection() {
  // Resolves the same memoised org row the greeting does, so the two boundaries
  // share one query rather than issuing two.
  const org = await getCurrentOrg();
  if (!org) return null;

  return <OnboardingChecklist org={org} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page — awaits only the cached org shell, then streams every section.
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardOverviewPage() {
  // Two columns, from cache — this is what the layout above already read, so on
  // a warm cache the page shell reaches the browser without touching Postgres.
  const org = await getOrgShell();

  // No matching Org row yet — send them through onboarding rather than 404.
  if (!org) redirect("/onboarding");

  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-6">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {/* Sized to a typical company name so the line does not reflow
                  when the real greeting lands. */}
              <Suspense fallback={<Skeleton className="h-6 w-64" />}>
                <Greeting />
              </Suspense>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{todayLabel}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/wallet">
                <Wallet className="h-3.5 w-3.5" />
                Top Up Wallet
              </Link>
            </Button>
            <Button size="sm" className="gap-1.5" asChild>
              <Link href="/book">
                <Plus className="h-3.5 w-3.5" />
                New Shipment
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Alerts (streams; renders nothing until known) ───────────── */}
        <Suspense fallback={null}>
          <DashboardAlerts orgId={org.id} />
        </Suspense>

        {/* ── Onboarding checklist (auto-hides once complete) ─────────── */}
        <Suspense fallback={null}>
          <OnboardingChecklistSection />
        </Suspense>

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Balance is cached until a wallet write invalidates it, so this
              lands effectively instantly — but it is still a read, so it gets
              its own boundary rather than blocking the three cards beside it. */}
          <Suspense fallback={<StatCardSkeleton />}>
            <WalletBalanceCard orgId={org.id} />
          </Suspense>
          <Suspense
            fallback={
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            }
          >
            <ShipmentStatCards orgId={org.id} />
          </Suspense>
        </div>

        {/* ── Middle row: Recent shipments + Wallet/Quotes ───────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent shipments — 2/3 width */}
          <Suspense
            fallback={
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-1 h-3 w-56" />
                </CardHeader>
                <TableCardSkeleton rows={5} />
              </Card>
            }
          >
            <RecentShipments orgId={org.id} />
          </Suspense>

          {/* Right column — Wallet + Quotes (Quotes is BA-only) */}
          <div className="space-y-6">
            <Suspense
              fallback={
                <Card>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-4 w-28" />
                  </CardHeader>
                  <ListCardSkeleton rows={3} />
                </Card>
              }
            >
              <WalletActivity orgId={org.id} />
            </Suspense>

            {/* Quotes are generated for Business Associates booking on behalf
                of their clients. Standard orgs don't have quotes, so this card
                is hidden for them — matching the hidden /quotes route. */}
            {org.isBusinessAssociate && (
              <Suspense
                fallback={
                  <Card>
                    <CardHeader className="pb-3">
                      <Skeleton className="h-4 w-20" />
                    </CardHeader>
                    <ListCardSkeleton rows={3} />
                  </Card>
                }
              >
                <QuotesCard orgId={org.id} />
              </Suspense>
            )}
          </div>
        </div>

        {/* ── Bottom row: Clients (BA only) ──────────────────────────────── */}
        {/*
          The "become a Business Associate" promo card was removed here: its
          "Apply now" link pointed at /business-associate/apply, a route that
          does not exist, and there is no BA application flow in the tenant app
          yet. TODO: restore a CTA once a real application flow is built.
        */}
        {/* {org.isBusinessAssociate && (
          <Suspense
            fallback={
              <Card>
                <CardHeader className="pb-3">
                  <Skeleton className="h-4 w-28" />
                </CardHeader>
                <TableCardSkeleton rows={3} />
              </Card>
            }
          >
            <ClientsCard orgId={org.id} />
          </Suspense>
        )} */}
      </div>
    </TooltipProvider>
  );
}
