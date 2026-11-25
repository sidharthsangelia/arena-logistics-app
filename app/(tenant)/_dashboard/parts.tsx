/**
 * app/(tenant)/_dashboard/parts.tsx
 *
 * The dashboard's fixed layout, shared by the page and by (tenant)/loading.tsx.
 * (The underscore keeps this folder out of routing.)
 *
 * Everything that reads the same for every org lives here and renders for real
 * in both: the greeting's "Welcome back,", today's date, the two action
 * buttons, every card's title, icon, tooltip, fixed sub line and "View all"
 * link, and the recent-shipments table header. The page fills the slots with
 * streamed, Suspense-wrapped values; the loading state fills them with the
 * skeletons below. One layout, so the two cannot drift and nothing moves when
 * the data lands.
 */

import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Info,
  PackageCheck,
  Plus,
  Receipt,
  Truck,
  Wallet,
} from "lucide-react";

import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardSlots {
  greetingName: React.ReactNode;
  alerts: React.ReactNode;
  checklist: React.ReactNode;
  wallet: { value: React.ReactNode; sub: React.ReactNode };
  stats: {
    active: React.ReactNode;
    attention: React.ReactNode;
    delivered: React.ReactNode;
    deliveredSub: React.ReactNode;
  };
  recentShipments: { description: React.ReactNode; body: React.ReactNode };
  walletActivity: { description: React.ReactNode; body: React.ReactNode };
  /** Business Associates only. Left out, the card is not drawn. */
  quotes?: { description: React.ReactNode; body: React.ReactNode };
}

export function DashboardLayout(slots: DashboardSlots) {
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
              Welcome back, {slots.greetingName}
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

        {slots.alerts}
        {slots.checklist}

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Wallet Balance"
            value={slots.wallet.value}
            sub={slots.wallet.sub}
            icon={Wallet}
            tooltip="Funds used to pay for shipments and services booked through your account."
          />
          <StatCard
            label="Active Shipments"
            value={slots.stats.active}
            sub="Booked through out-for-delivery"
            icon={Truck}
            tooltip="Shipments currently in progress: booked, processing, in transit, on customs hold, or out for delivery."
          />
          <StatCard
            label="Needs Your Attention"
            value={slots.stats.attention}
            sub="Drafts, payments & documents"
            icon={Clock}
            tooltip="Shipments that are drafted, awaiting payment, or waiting on documents from you."
          />
          <StatCard
            label="Delivered This Month"
            value={slots.stats.delivered}
            sub={slots.stats.deliveredSub}
            icon={PackageCheck}
            tooltip="Shipments marked delivered since the 1st of this month."
          />
        </div>

        {/* ── Middle row: Recent shipments + Wallet/Quotes ───────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">Recent Shipments</CardTitle>
                {slots.recentShipments.description}
              </div>
              <ViewAll href="/shipments" />
            </CardHeader>
            <CardContent className="p-0">{slots.recentShipments.body}</CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Wallet Activity</CardTitle>
                    {slots.walletActivity.description}
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
                    <Link href="/wallet">
                      <Receipt className="h-3 w-3" />
                      Ledger
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">{slots.walletActivity.body}</CardContent>
            </Card>

            {/* Quotes are generated for Business Associates booking on behalf
                of their clients. Standard orgs don't have quotes, so this card
                is hidden for them, matching the hidden /quotes route. */}
            {slots.quotes && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Recent Quotes</CardTitle>
                      {slots.quotes.description}
                    </div>
                    <ViewAll href="/quotes" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">{slots.quotes.body}</CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" asChild>
      <Link href={href}>
        View all
        <ArrowRight className="h-3 w-3" />
      </Link>
    </Button>
  );
}

/** Recent shipments' header row. Fixed, so the skeleton table shows it too. */
export function RecentShipmentsTableHeader() {
  return (
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeletons. Each bar sits in a box of the real line's height, so a block of
// them is exactly as tall as the text that replaces it.
// ─────────────────────────────────────────────────────────────────────────────

function Line({ h, w, className }: { h: string; w: string; className?: string }) {
  return (
    <div className={cn("flex items-center", h, className)}>
      <Skeleton className={cn("h-[65%]", w)} />
    </div>
  );
}

/** Inline in the h1, so a span rather than Skeleton's div. Same look. */
export function GreetingNameSkeleton() {
  return (
    <span
      aria-hidden
      className={cn(
        "relative isolate inline-block h-5 w-44 overflow-hidden rounded-md bg-skeleton align-[-0.15em]",
        "after:absolute after:inset-0 after:content-[''] after:animate-skeleton-sheen",
        "after:bg-[linear-gradient(100deg,transparent_38%,var(--skeleton-sheen)_50%,transparent_62%)]",
        "motion-reduce:after:hidden",
      )}
    />
  );
}

/** A card's one-line description (text-xs, mt-0.5). */
export function CardDescriptionSkeleton({ w = "w-40" }: { w?: string }) {
  return <Line h="h-4" w={w} className="mt-0.5" />;
}

/** Real descriptions use this wrapper, so skeleton and text share the box. */
export function DashCardDescription({ children }: { children: React.ReactNode }) {
  return <CardDescription className="text-xs mt-0.5">{children}</CardDescription>;
}

export function RecentShipmentsBodySkeleton({ rows }: { rows: number }) {
  return (
    <Table>
      <RecentShipmentsTableHeader />
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i} className="hover:bg-transparent">
            <TableCell className="pl-6 py-3">
              <Line h="h-[17.5px]" w="w-32" />
              <Line h="h-4" w="w-40" className="mt-0.5" />
            </TableCell>
            <TableCell className="px-3 py-3">
              <Line h="h-4" w="w-28" />
            </TableCell>
            <TableCell className="px-3 py-3">
              <Line h="h-4" w="w-24" />
            </TableCell>
            <TableCell className="py-3">
              <Line h="h-5" w="w-16" />
            </TableCell>
            <TableCell className="pr-6 py-3">
              <Skeleton className="h-5 w-20 rounded-4xl" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function WalletActivityBodySkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-md border shrink-0" />
              <div className="min-w-0">
                <Line h="h-[17.5px]" w="w-24" />
                <Line h="h-4" w="w-20" className="mt-0.5" />
              </div>
            </div>
            <Line h="h-5" w="w-16" className="shrink-0" />
          </div>
          {i < rows - 1 && <Separator className="mt-3" />}
        </div>
      ))}
    </>
  );
}

export function QuotesBodySkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="rounded-md -mx-2 px-2 py-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Line h="h-[17.5px]" w="w-28" />
                <Line h="h-4" w="w-24" className="mt-0.5" />
                <Line h="h-4" w="w-32" className="mt-0.5" />
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <Line h="h-5" w="w-16" />
                <Skeleton className="h-5 w-14 rounded-4xl" />
              </div>
            </div>
          </div>
          {i < rows - 1 && <Separator className="mt-3" />}
        </div>
      ))}
    </>
  );
}
