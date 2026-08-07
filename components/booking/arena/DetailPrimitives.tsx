import { MapPin, Phone, ChevronDown } from "lucide-react";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeading } from "@/components/layout/SectionHeading";
import { cn } from "@/lib/utils";
import { ShipmentStatus } from "@/generated/prisma";
import { CopyButton } from "@/components/booking/CopyButton";

// ---------------------------------------------------------------------------
// Shared building blocks for the two ops booking-detail pages
// (/arena-dashboard/bookings/[id] and /arena-dashboard/domestic-bookings/[id]).
//
// The two pages are deliberately separate — an export and a domestic parcel put
// different work in front of ops, and mixing their panels made both harder to
// read. But they should still LOOK like the same product, so everything purely
// presentational lives here: the hero stat, the collapsible card, the address
// block, the status accent. Anything that encodes what a shipment MEANS stays
// on its own page.
//
// The two pages read as one flat document down the review column and keep
// cards in the operate rail. That split is deliberate: a card around a form
// tells ops where the control starts and ends, and a card around a fact they
// are only reading is a box for its own sake. So there are two families here —
// SectionBlock / CollapsibleSection for review content, Card / CollapsibleCard
// for the rail — and picking between them is picking "read this" or "do this".
//
// All server components. Nothing here holds state or needs client JS; the
// collapsibles use a native <details> for exactly that reason.
// ---------------------------------------------------------------------------

// ── Formatters ─────────────────────────────────────────────────────────────

/** Prisma Decimal, string or number → number. Never NaN. */
export function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && "toNumber" in (v as object))
    return (v as { toNumber(): number }).toNumber();
  return Number(v) || 0;
}

export function fmtDatetime(d: Date | null | undefined) {
  if (!d) return "Not set";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMoney(amount: unknown, currency = "INR") {
  if (amount == null) return "Not set";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(num(amount));
}

export function fmtNum(v: unknown, suffix = "") {
  if (v == null) return "Not set";
  return `${num(v).toFixed(2)}${suffix}`;
}

// ── Status accent ──────────────────────────────────────────────────────────

// Solid left-accent per status, used on the hero. Accent only — the page stays
// neutral; the colour is a functional read of state, not decoration.
export const STATUS_ACCENT: Record<ShipmentStatus, string> = {
  DRAFT: "border-l-border",
  PENDING_PAYMENT: "border-l-amber-400",
  BOOKED: "border-l-blue-400",
  PROCESSING: "border-l-indigo-400",
  DOCUMENTS_PENDING: "border-l-orange-400",
  IN_TRANSIT: "border-l-sky-400",
  CUSTOMS_HOLD: "border-l-red-500",
  OUT_FOR_DELIVERY: "border-l-violet-400",
  DELIVERED: "border-l-emerald-500",
  CANCELLED: "border-l-muted-foreground/30",
  ON_HOLD: "border-l-yellow-400",
};

// ── Blocks ─────────────────────────────────────────────────────────────────

/**
 * One at-a-glance fact in the hero strip: quiet eyebrow label over a strong
 * value, so ops reads the whole shipment in one sweep.
 */
export function HeroStat({
  icon: Icon,
  label,
  value,
  strong,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  /** Bump the value to headline weight (used for the price). */
  strong?: boolean;
  /** Amber the value when it flags a gap ops must fill (e.g. no carrier). */
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </p>
      <p
        title={value}
        className={cn(
          "mt-1.5 truncate text-base font-semibold tabular-nums text-foreground",
          strong && "text-lg tracking-tight",
          warn && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * A flat review section: heading over a hairline, then content. The review
 * column is built from these — no card, because ops is reading here, not
 * operating.
 */
export function SectionBlock({
  icon,
  title,
  right,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  /** Short meta string, or a node when the section owns a control. */
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <SectionHeading icon={icon} right={right}>
        {title}
      </SectionHeading>
      {children}
    </section>
  );
}

/**
 * The same section, folded behind its heading. For reference ops only
 * occasionally opens (wallet rows, raw meta, an audit trail) — present and one
 * click away, without eating the column.
 */
export function CollapsibleSection({
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  /** Muted one-liner shown on the right while collapsed. */
  summary?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <details open={defaultOpen || undefined} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 border-b pb-2.5 [&::-webkit-details-marker]:hidden">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            {title}
          </h2>
          <span className="ml-auto flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-foreground">
            {summary && (
              <span className="text-xs group-open:hidden">{summary}</span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
          </span>
        </summary>
        <div className="pt-4">{children}</div>
      </details>
    </section>
  );
}

/**
 * A card whose body collapses behind its header. Native <details> keeps this a
 * server component (no client JS) while still nesting the client action panels.
 * Rail only: secondary controls ops opens to act on.
 */
export function CollapsibleCard({
  icon: Icon,
  title,
  summary,
  badge,
  defaultOpen = false,
  contentClassName,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** Muted one-liner shown on the right while collapsed. */
  summary?: string;
  /** Optional chip beside the title (e.g. a count). */
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 py-0">
      <details open={defaultOpen || undefined} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {badge}
          <span className="ml-auto flex items-center gap-2">
            {summary && (
              <span className="text-xs text-muted-foreground group-open:hidden">
                {summary}
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </span>
        </summary>
        <div className={cn("border-t px-4 py-4", contentClassName)}>
          {children}
        </div>
      </details>
    </Card>
  );
}

export function CardTitleRow({
  icon: Icon,
  title,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <CardHeader className="border-b py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        {right}
      </div>
    </CardHeader>
  );
}

export function InfoRow({
  icon: Icon,
  label,
  value,
  copyLabel,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
  /** When set, render the value as a copyable field for ops. */
  copyLabel?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 text-sm">
      {Icon && (
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <span className="text-muted-foreground">{label}: </span>
        {copyLabel ? (
          <CopyButton
            value={value}
            label={copyLabel}
            className="align-middle text-sm font-medium"
          />
        ) : (
          <span className="font-medium text-foreground">{value}</span>
        )}
      </div>
    </div>
  );
}

export function AddressCard({
  title,
  address,
  flag,
}: {
  title: string;
  /** Optional attention chip after the title, e.g. a separate billing party. */
  flag?: string;
  address: {
    contactName?: string | null;
    contactPhone?: string | null;
    companyName?: string | null;
    line1: string;
    line2?: string | null;
    city: string;
    state?: string | null;
    country: string;
    postalCode: string;
  };
}) {
  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(", "),
    [address.postalCode, address.country].filter(Boolean).join(" "),
  ].filter(Boolean);

  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {title}
        {/* The one chip left on an address: a party who is not the one being
            delivered to is a thing ops must not read past. */}
        {flag && (
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {flag}
          </span>
        )}
      </p>
      {address.contactName && (
        <p className="mt-1.5 text-base font-semibold text-foreground">
          {address.contactName}
        </p>
      )}
      {/* Whether this party gave a trading name is what decides a domestic
          shipment's GST paperwork, so it is shown rather than left implicit. */}
      {address.companyName && (
        <p className="text-sm text-muted-foreground">{address.companyName}</p>
      )}
      {address.contactPhone && (
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          <span className="tabular-nums">{address.contactPhone}</span>
        </p>
      )}
      <div className="mt-3 flex items-start gap-2">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="text-sm leading-relaxed text-muted-foreground">
          {lines.map((l, i) => (
            <p
              key={i}
              className={
                i === lines.length - 1 ? "font-medium text-foreground" : ""
              }
            >
              {l}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value?: string | null;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-sm font-medium tabular-nums text-foreground",
          strong && "text-base font-semibold",
          !value && "font-normal text-muted-foreground/60",
        )}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}
