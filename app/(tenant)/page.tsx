import { auth } from "@clerk/nextjs/server";
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
} from "lucide-react";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { prisma } from "@/utils/db";

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
});

function formatDate(date: Date) {
  return dateFormatter.format(date);
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

const CREDIT_TXN_TYPES: WalletTxnType[] = ["TOP_UP", "REFUND"];

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
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardOverviewPage() {
  const { orgId } = await auth();
  if (!orgId) redirect("/sign-in");

  const org = await prisma.org.findUnique({
    where: { clerkOrgId: orgId },
    include: { wallet: true },
  });

  // No matching Org row yet — send them through onboarding rather than 404.
  if (!org) redirect("/onboarding");

  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    statusGroups,
    recentShipments,
    recentWalletTxns,
    quoteGroups,
    recentQuotes,
    recentClients,
    expiringDocs,
    latestBaApplication,
    deliveredThisMonth,
  ] = await Promise.all([
    prisma.shipment.groupBy({
      by: ["status"],
      where: { orgId: org.id },
      _count: { _all: true },
    }),
    prisma.shipment.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        shipmentNumber: true,
        status: true,
        quotedTotal: true,
        currency: true,
        createdAt: true,
        client: { select: { companyName: true } },
        pickupAddress: { select: { city: true, country: true } },
        deliveryAddress: { select: { city: true, country: true } },
      },
    }),
    org.wallet
      ? prisma.walletTransaction.findMany({
          where: { walletId: org.wallet.id },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
    prisma.quote.groupBy({
      by: ["status"],
      where: { orgId: org.id },
      _count: { _all: true },
    }),
    prisma.quote.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        vendorName: true,
        quotedTotal: true,
        currency: true,
        validUntil: true,
        client: { select: { companyName: true } },
      },
    }),
    org.isBusinessAssociate
      ? prisma.client.findMany({
          where: { orgId: org.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            companyName: true,
            companyKind: true,
            createdAt: true,
            _count: { select: { shipments: true } },
          },
        })
      : Promise.resolve([]),
    prisma.kycDocument.findMany({
      where: {
        orgId: org.id,
        partyType: "ORG",
        expiresAt: { not: null, lte: thirtyDaysOut },
      },
      orderBy: { expiresAt: "asc" },
      take: 3,
      select: { id: true, label: true, expiresAt: true },
    }),
    prisma.baApplication.findFirst({
      where: { orgId: org.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.shipment.count({
      where: { orgId: org.id, status: "DELIVERED", updatedAt: { gte: startOfMonth } },
    }),
  ]);

  // ── Derived shipment stats ──
  const statusCountMap = Object.fromEntries(
    statusGroups.map((g) => [g.status, g._count._all])
  ) as Partial<Record<ShipmentStatus, number>>;

  const sumStatuses = (statuses: ShipmentStatus[]) =>
    statuses.reduce((total, s) => total + (statusCountMap[s] ?? 0), 0);

  const activeShipmentsCount = sumStatuses([
    "BOOKED",
    "PROCESSING",
    "IN_TRANSIT",
    "CUSTOMS_HOLD",
    "OUT_FOR_DELIVERY",
  ]);
  const needsAttentionCount = sumStatuses(["DRAFT", "PENDING_PAYMENT", "DOCUMENTS_PENDING"]);
  const totalShipments = Object.values(statusCountMap).reduce((a, b) => a + (b ?? 0), 0);

  // ── Derived quote stats ──
  const quoteCountMap = Object.fromEntries(
    quoteGroups.map((g) => [g.status, g._count._all])
  ) as Partial<Record<QuoteStatus, number>>;
  const openQuotesCount = (quoteCountMap.DRAFT ?? 0) + (quoteCountMap.SENT ?? 0);

  // ── Wallet ──
  const walletBalance = org.wallet ? Number(org.wallet.balance) : 0;
  const walletCurrency = org.wallet?.currency ?? "INR";
  const lowBalance = org.wallet != null && walletBalance < 5000;

  const displayName = org.companyName || org.name;
  const todayLabel = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const showBaPromo = !org.isBusinessAssociate && !latestBaApplication;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-6">
        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Welcome back, {displayName}
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

        {/* ── Alerts ──────────────────────────────────────────────────── */}
        {(latestBaApplication?.status === "PENDING" || lowBalance || expiringDocs.length > 0) && (
          <div className="space-y-3">
            {latestBaApplication?.status === "PENDING" && (
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Business Associate application in review</AlertTitle>
                <AlertDescription>
                  Submitted on {formatDate(latestBaApplication.createdAt)}. We&apos;ll notify you
                  once it&apos;s been reviewed.
                </AlertDescription>
              </Alert>
            )}

            {lowBalance && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Wallet balance is running low</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    Your balance is {formatMoney(walletBalance, walletCurrency)}. Top up to avoid
                    delays booking new shipments.
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
                  <Link href="/quotes" className="underline underline-offset-2">
                    Review documents
                  </Link>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Wallet Balance"
            value={formatMoney(walletBalance, walletCurrency)}
            sub={org.wallet ? "Available to spend" : "Wallet not set up yet"}
            icon={Wallet}
            tooltip="Funds used to pay for shipments and services booked through your account."
          />
          <StatCard
            label="Active Shipments"
            value={activeShipmentsCount}
            sub="Booked through out-for-delivery"
            icon={Truck}
          />
          <StatCard
            label="Needs Your Attention"
            value={needsAttentionCount}
            sub="Drafts, payments & documents"
            icon={Clock}
            tooltip="Shipments that are drafted, awaiting payment, or waiting on documents from you."
          />
          <StatCard
            label="Delivered This Month"
            value={deliveredThisMonth}
            sub={`${totalShipments} shipments all time`}
            icon={PackageCheck}
          />
        </div>

        {/* ── Middle row: Recent shipments + Wallet/Quotes ───────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent shipments — 2/3 width */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">Recent Shipments</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Your latest bookings and their current status
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
                      <TableHead>Amount</TableHead>
                      <TableHead className="pr-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentShipments.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer">
                        <TableCell className="pl-6">
                          <p className="text-sm font-medium leading-tight font-mono">
                            {s.shipmentNumber}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.client?.companyName ?? "For your organisation"}
                          </p>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {s.pickupAddress.city} → {s.deliveryAddress.city}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums font-medium">
                          {s.quotedTotal ? formatMoney(s.quotedTotal.toString(), s.currency) : "—"}
                        </TableCell>
                        <TableCell className="pr-6">
                          <ShipmentStatusBadge status={s.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Right column — Wallet + Quotes */}
          <div className="space-y-6">
            {/* Wallet activity */}
            <Card>
              <CardHeader className="pb-3">
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
                              <p className="text-sm font-medium leading-tight truncate">
                                {txn.type.replace("_", " ")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDate(txn.createdAt)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-sm tabular-nums font-medium shrink-0 ${
                              isCredit ? "text-emerald-600" : ""
                            }`}
                          >
                            {isCredit ? "+" : "-"}
                            {formatMoney(txn.amount.toString(), txn.currency)}
                          </span>
                        </div>
                        {i < recentWalletTxns.length - 1 && <Separator className="mt-3" />}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Quotes */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Quotes</CardTitle>
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
                  recentQuotes.map((q, i) => (
                    <div key={q.id}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-tight truncate">
                            {q.quoteNumber}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {q.vendorName} · {q.client?.companyName ?? "Unassigned"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm tabular-nums font-medium">
                            {formatMoney(q.quotedTotal.toString(), q.currency)}
                          </p>
                          <QuoteStatusBadge status={q.status} />
                        </div>
                      </div>
                      {i < recentQuotes.length - 1 && <Separator className="mt-3" />}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Bottom row: Clients (BA) or BA promo ───────────────────────── */}
        {org.isBusinessAssociate ? (
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
                      <TableHead>Shipments</TableHead>
                      <TableHead className="pr-6">Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentClients.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer">
                        <TableCell className="pl-6">
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
                        <TableCell className="pr-6 text-sm text-muted-foreground">
                          {formatDate(c.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : (
          showBaPromo && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md border flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Book shipments on behalf of clients</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Apply to become a Business Associate for a lower markup and access to the
                      client management tools.
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/business-associate/apply">Apply now</Link>
                </Button>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </TooltipProvider>
  );
}