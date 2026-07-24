// Starting points for the notices ops actually send. Freight runs on the same
// handful of disruptions every year, so the form opens with these rather than a
// blank textarea and a severity dropdown nobody wants to reason about at 9pm.

import type { SystemNoticeInput } from "./schema";

export interface NoticePreset {
  id: string;
  label: string;
  /** What the preset is for, shown under its name in the picker. */
  hint: string;
  values: Pick<
    SystemNoticeInput,
    | "title"
    | "message"
    | "severity"
    | "displayMode"
    | "dismissible"
    | "priority"
    | "linkLabel"
    | "linkHref"
  >;
}

export const NOTICE_PRESETS: NoticePreset[] = [
  {
    id: "blank",
    label: "Blank notice",
    hint: "Start from scratch.",
    values: {
      title: null,
      message: "",
      severity: "INFO",
      displayMode: "ALWAYS",
      dismissible: true,
      priority: 0,
      linkLabel: null,
      linkHref: null,
    },
  },
  {
    id: "holiday-closure",
    label: "Holiday closure",
    hint: "Office and pickups shut for a known date range.",
    values: {
      title: "Holiday closure",
      message:
        "Our offices and pickup network are closed for the holiday. Bookings placed during this period will be collected on the next working day.",
      severity: "WARNING",
      displayMode: "SCHEDULED",
      dismissible: true,
      priority: 10,
      linkLabel: null,
      linkHref: null,
    },
  },
  {
    id: "carrier-delay",
    label: "Carrier delay",
    hint: "Airline, port or courier disruption affecting transit times.",
    values: {
      title: "Transit delays expected",
      message:
        "Carrier capacity on this lane is constrained and transit times are running longer than usual. Plan for extra days on time-sensitive cargo.",
      severity: "WARNING",
      displayMode: "ALWAYS",
      dismissible: true,
      priority: 20,
      linkLabel: "Track your shipments",
      linkHref: "/shipments",
    },
  },
  {
    id: "rate-revision",
    label: "Rate revision",
    hint: "New rate card or fuel surcharge takes effect.",
    values: {
      title: "Rates revised",
      message:
        "Updated rates are now live in the calculator. Quotes generated before today may no longer match what you are charged.",
      severity: "INFO",
      displayMode: "ALWAYS",
      dismissible: true,
      priority: 5,
      linkLabel: "Open rate calculator",
      linkHref: "/rates",
    },
  },
  {
    id: "customs-hold",
    label: "Customs or compliance hold",
    hint: "Shipments stopped. Cannot be dismissed.",
    values: {
      title: "Shipments on hold",
      message:
        "Outbound cargo on this lane is held pending customs clearance. Do not book new shipments on this route until this notice is lifted.",
      severity: "CRITICAL",
      displayMode: "ALWAYS",
      dismissible: false,
      priority: 50,
      linkLabel: null,
      linkHref: null,
    },
  },
  {
    id: "maintenance",
    label: "Maintenance window",
    hint: "Portal or payments unavailable for a set period.",
    values: {
      title: "Scheduled maintenance",
      message:
        "The portal will be briefly unavailable while we carry out scheduled maintenance. Bookings in progress are saved as drafts.",
      severity: "WARNING",
      displayMode: "SCHEDULED",
      dismissible: false,
      priority: 30,
      linkLabel: null,
      linkHref: null,
    },
  },
  {
    id: "wallet",
    label: "Wallet or payments notice",
    hint: "Top-ups delayed, or a payment gateway issue.",
    values: {
      title: "Wallet top-ups delayed",
      message:
        "Our payment gateway is reporting delays, so wallet top-ups may take longer than usual to reflect. Your money is safe and balances will settle automatically.",
      severity: "CRITICAL",
      displayMode: "ALWAYS",
      dismissible: true,
      priority: 40,
      linkLabel: "Open wallet",
      linkHref: "/wallet",
    },
  },
  {
    id: "service-restored",
    label: "Service restored",
    hint: "Close out a disruption you announced earlier.",
    values: {
      title: "Service restored",
      message:
        "The disruption reported earlier is resolved and the network is running normally again. Thank you for your patience.",
      severity: "SUCCESS",
      displayMode: "SCHEDULED",
      dismissible: true,
      priority: 0,
      linkLabel: null,
      linkHref: null,
    },
  },
];
