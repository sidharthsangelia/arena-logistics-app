"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileClock,
  HandCoins,
  Megaphone,
  PackageCheck,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";

import type { NoticeSeverity } from "@/generated/prisma";
import type { NotificationKindKey } from "@/lib/notifications/config";

/**
 * Icons and tones for notification rows.
 *
 * A client module because these are React components, kept out of
 * lib/notifications/config.ts for the same reason the sidebar keeps its icons out
 * of the nav config: a `server-only` boundary sits between the two, and the config
 * is imported by the query layer.
 *
 * Colour is a functional cue and nothing else. Severity is the only thing that
 * changes the palette, every row keeps the same layout and type scale, and a
 * CRITICAL row reads as urgent because of its colour rather than because it is
 * built differently. That consistency is what lets the red mean something.
 */

export const KIND_ICONS: Record<NotificationKindKey, LucideIcon> = {
  BOOKING_PLACED: PackagePlus,
  PAYMENT_FAILED: CreditCard,
  COLLECTION_OVERDUE: HandCoins,
  SHIPMENT_STUCK: Clock,
  QUOTE_EXPIRING: FileClock,
  SHIPMENT_STATUS: PackageCheck,
  ARENA_MESSAGE: Megaphone,
};

export interface SeverityTone {
  /** Icon bubble. */
  bubble: string;
  /** Left rail on the row, which is what makes a failure impossible to scroll past. */
  rail: string;
  /** Row background when unread. */
  unreadBg: string;
  /** Fallback icon when severity matters more than the kind. */
  icon: LucideIcon | null;
}

export const SEVERITY_TONES: Record<NoticeSeverity, SeverityTone> = {
  INFO: {
    bubble: "bg-slate-100 text-slate-600",
    rail: "bg-transparent",
    unreadBg: "bg-sky-50/60",
    icon: null,
  },
  SUCCESS: {
    bubble: "bg-emerald-100 text-emerald-700",
    rail: "bg-transparent",
    unreadBg: "bg-emerald-50/50",
    icon: CheckCircle2,
  },
  WARNING: {
    bubble: "bg-amber-100 text-amber-700",
    rail: "bg-amber-400",
    unreadBg: "bg-amber-50/60",
    icon: AlertTriangle,
  },
  CRITICAL: {
    bubble: "bg-red-100 text-red-700",
    rail: "bg-red-500",
    unreadBg: "bg-red-50/70",
    icon: AlertTriangle,
  },
};

/**
 * The icon for a row. Severity wins for WARNING and CRITICAL, because at that
 * point "something is wrong" is more useful at a glance than "this is about a
 * quote"; the title says which soon enough.
 *
 * A component rather than a function returning one. Every icon it can resolve to is
 * declared at module scope, so the reference is always stable, but a caller doing
 * `const Icon = iconFor(...)` and rendering `<Icon />` is indistinguishable to
 * react-hooks/static-components from declaring a component inside render. Resolving
 * inside a component keeps the rule satisfied and moves the choice out of every
 * caller besides.
 */
export function NotificationKindIcon({
  kind,
  severity,
  className,
}: {
  kind: NotificationKindKey;
  severity: NoticeSeverity;
  className?: string;
}) {
  const severityIcon = SEVERITY_TONES[severity].icon;
  const Icon =
    severity === "WARNING" || severity === "CRITICAL"
      ? (severityIcon ?? KIND_ICONS[kind] ?? AlertTriangle)
      : (KIND_ICONS[kind] ?? AlertTriangle);

  return <Icon className={className} />;
}
