// Presentation config for system notices.
//
// Colour is the functional cue here and nothing else: severity is the only
// thing that changes the palette, and every severity keeps the same layout,
// icon slot and type scale so a CRITICAL notice reads as urgent because of its
// colour, not because it is styled differently.

import type { ElementType } from "react";
import {
  CheckCircle2,
  Info,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";

import type {
  NoticeAudience,
  NoticeDisplayMode,
  NoticeSeverity,
  NoticeStatus,
} from "./types";

export interface SeverityConfig {
  label: string;
  /** What this severity is for, shown as help text in the admin form. */
  hint: string;
  icon: ElementType;
  /** Banner surface — background, border and text together. */
  banner: string;
  /** Icon tint, one step stronger than the body text. */
  iconClass: string;
  /** Inline link / CTA colour inside the banner. */
  link: string;
  /** Hover tint for the dismiss button. */
  dismiss: string;
  /** Admin table chip. */
  chip: string;
}

export const SEVERITY_CONFIG: Record<NoticeSeverity, SeverityConfig> = {
  INFO: {
    label: "Info",
    hint: "Neutral update. New feature, general information.",
    icon: Info,
    banner: "border-sky-200 bg-sky-50 text-sky-900",
    iconClass: "text-sky-600",
    link: "text-sky-900 decoration-sky-400 hover:decoration-sky-700",
    dismiss: "text-sky-600 hover:bg-sky-100 hover:text-sky-900",
    chip: "bg-sky-100 text-sky-800",
  },
  SUCCESS: {
    label: "Resolved",
    hint: "Good news. Service restored, backlog cleared.",
    icon: CheckCircle2,
    banner: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconClass: "text-emerald-600",
    link: "text-emerald-900 decoration-emerald-400 hover:decoration-emerald-700",
    dismiss: "text-emerald-600 hover:bg-emerald-100 hover:text-emerald-900",
    chip: "bg-emerald-100 text-emerald-800",
  },
  WARNING: {
    label: "Warning",
    hint: "Needs planning. Rate revision, cut-off change, expected delay.",
    icon: TriangleAlert,
    banner: "border-amber-200 bg-amber-50 text-amber-900",
    iconClass: "text-amber-600",
    link: "text-amber-900 decoration-amber-400 hover:decoration-amber-700",
    dismiss: "text-amber-600 hover:bg-amber-100 hover:text-amber-900",
    chip: "bg-amber-100 text-amber-800",
  },
  CRITICAL: {
    label: "Critical",
    hint: "Acting now matters. Carrier hold, payments down, shipments stopped.",
    icon: OctagonAlert,
    banner: "border-red-200 bg-red-50 text-red-900",
    iconClass: "text-red-600",
    link: "text-red-900 decoration-red-400 hover:decoration-red-700",
    dismiss: "text-red-600 hover:bg-red-100 hover:text-red-900",
    chip: "bg-red-100 text-red-800",
  },
};

/** Most urgent first. Drives which notice wins the top slot. */
export const SEVERITY_ORDER: NoticeSeverity[] = [
  "CRITICAL",
  "WARNING",
  "INFO",
  "SUCCESS",
];

export function severityRank(severity: NoticeSeverity) {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

export const AUDIENCE_CONFIG: Record<
  NoticeAudience,
  { label: string; hint: string }
> = {
  ALL: {
    label: "Everyone",
    hint: "Every organisation on the tenant dashboard.",
  },
  BUSINESS_ASSOCIATES: {
    label: "Business associates",
    hint: "Only partners who book on behalf of their own clients.",
  },
  STANDARD: {
    label: "Standard orgs",
    hint: "Only organisations shipping for themselves.",
  },
};

export const DISPLAY_MODE_CONFIG: Record<
  NoticeDisplayMode,
  { label: string; hint: string }
> = {
  ALWAYS: {
    label: "Until switched off",
    hint: "Shows from the moment it is switched on. You decide when it ends.",
  },
  SCHEDULED: {
    label: "For a set period",
    hint: "Shows only inside the window below. Set it up in advance and forget it.",
  },
};

export const STATUS_CONFIG: Record<
  NoticeStatus,
  { label: string; chip: string }
> = {
  LIVE: { label: "Live", chip: "bg-emerald-100 text-emerald-800" },
  SCHEDULED: { label: "Scheduled", chip: "bg-sky-100 text-sky-800" },
  EXPIRED: { label: "Expired", chip: "bg-slate-100 text-slate-600" },
  OFF: { label: "Off", chip: "bg-slate-100 text-slate-600" },
};
