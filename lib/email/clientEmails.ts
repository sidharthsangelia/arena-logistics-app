/**
 * BUSINESS ASSOCIATE CLIENT EMAILS: SHARED CONFIG AND DECISION LOGIC
 * -----------------------------------------------------------------------------
 * A business associate books on behalf of its own clients. Milestone emails have
 * always gone to those clients, which was never something the BA agreed to: the
 * client hears from Arena directly, about a shipment they think their freight
 * partner is handling.
 *
 * So it is now the BA's decision. Switched off, the same email goes to the BA
 * instead of the client, which matters more than it sounds: turning this off must
 * not make anyone go dark, or a BA will turn it back on just to keep getting
 * updates and expose their clients again as a side effect.
 *
 * Deliberately free of `server-only`, Prisma and React. The send path needs
 * `resolveClientEmailDecision`, and the settings form needs the same labels and
 * the same milestone list, so neither side may own it.
 */

import { EMAIL_MILESTONE_STATUSES } from "./shipment/milestones";
import type { ShipmentStatus } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Milestones a BA can choose from
//
// Exactly the five statuses that have customer-facing copy. The rest of
// ShipmentStatus (CUSTOMS_HOLD, ON_HOLD, CANCELLED and friends) never emails
// anyone, so offering them as checkboxes would promise something the send path
// cannot deliver.
// ---------------------------------------------------------------------------

export const CLIENT_EMAIL_MILESTONES = EMAIL_MILESTONE_STATUSES;

/** A status a BA is allowed to store in Org.clientEmailMilestones. */
export type ClientEmailMilestone = (typeof CLIENT_EMAIL_MILESTONES)[number];

export const MILESTONE_LABELS: Record<
  ClientEmailMilestone,
  { label: string; hint: string }
> = {
  BOOKED: {
    label: "Booking confirmed",
    hint: "Sent as soon as you book. Confirms the shipment and sets expectations.",
  },
  PROCESSING: {
    label: "Being prepared",
    hint: "We are arranging the carrier and getting the airway bill ready.",
  },
  IN_TRANSIT: {
    label: "On its way",
    hint: "The shipment has left. Carries the tracking number once we have it.",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for delivery",
    hint: "Final leg. Useful nudge so somebody is there to receive it.",
  },
  DELIVERED: {
    label: "Delivered",
    hint: "Confirms safe arrival. The one most people want to receive.",
  },
};

/**
 * Narrows an arbitrary status to one a BA may store. Used when reading the DB
 * column, so a value written before the list narrowed cannot break the form.
 */
export function isClientEmailMilestone(
  status: string,
): status is ClientEmailMilestone {
  return (CLIENT_EMAIL_MILESTONES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Per-client override
// ---------------------------------------------------------------------------

export const CLIENT_EMAIL_PREFERENCE_CONFIG = {
  INHERIT: {
    label: "Follow my setting",
    /** Filled in with the live org setting by the UI, which knows it. */
    hint: "Whatever your account-wide setting says, now and if you change it later.",
    chip: "bg-slate-100 text-slate-700",
  },
  ALWAYS: {
    label: "Always email them",
    hint: "This client hears about their shipments even if you switch the account setting off.",
    chip: "bg-emerald-100 text-emerald-800",
  },
  NEVER: {
    label: "Never email them",
    hint: "This client is never emailed, even while the account setting is on. You still get the updates.",
    chip: "bg-amber-100 text-amber-800",
  },
} as const;

export const CLIENT_EMAIL_PREFERENCES = [
  "INHERIT",
  "ALWAYS",
  "NEVER",
] as const;

export type ClientEmailPreferenceKey = (typeof CLIENT_EMAIL_PREFERENCES)[number];

export function coerceClientEmailPreference(
  value: unknown,
): ClientEmailPreferenceKey {
  return typeof value === "string" &&
    (CLIENT_EMAIL_PREFERENCES as readonly string[]).includes(value)
    ? (value as ClientEmailPreferenceKey)
    : "INHERIT";
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

export type ClientEmailDecision =
  /** Not a BA booking for a client. Unchanged behaviour: the consignor is the
   *  customer, and there is nobody to shield. */
  | { route: "direct" }
  /** The client is emailed, under the BA's name. */
  | { route: "client" }
  /** The BA is emailed instead, and told why. */
  | { route: "associate"; reason: AssociateCopyReason };

export type AssociateCopyReason =
  | "org-off" // the account-wide setting is off
  | "client-off" // this client is pinned to Never
  | "milestone-off" // the BA does not send this particular update
  | "no-client-email"; // we simply have no address for the client

export interface ClientEmailDecisionInput {
  isBusinessAssociate: boolean;
  /** Was this booked for a client on the BA's books, rather than for themselves? */
  hasClient: boolean;
  /** Do we actually hold an address for that client? */
  clientEmail: string | null;
  orgEnabled: boolean;
  orgMilestones: readonly ShipmentStatus[];
  clientPreference: ClientEmailPreferenceKey;
  status: ShipmentStatus;
}

/**
 * Who receives this milestone email, and why.
 *
 * The two switches layer rather than compete, and the settings copy says so:
 *
 *   - `orgMilestones` chooses WHICH updates clients hear about. It is account
 *     wide, so an unchecked milestone is silent for every client including the
 *     ones pinned to "Always email them". Pinning a client says "yes, email this
 *     one", not "email them about things I have chosen not to send anybody".
 *   - `clientPreference` chooses WHETHER a given client is in scope at all, and
 *     overrides the account-wide on/off switch in either direction.
 *
 * Pure and total: every path returns, and nothing here reads the clock, the DB
 * or the environment, so the table in scripts/check-notifications.ts can assert
 * the whole matrix.
 */
export function resolveClientEmailDecision(
  input: ClientEmailDecisionInput,
): ClientEmailDecision {
  const {
    isBusinessAssociate,
    hasClient,
    clientEmail,
    orgEnabled,
    orgMilestones,
    clientPreference,
    status,
  } = input;

  // A standard org ships for itself, and a BA shipping for itself is the same
  // situation. Either way the recipient is the customer, not a third party.
  if (!isBusinessAssociate || !hasClient) return { route: "direct" };

  const clientWantsMail =
    clientPreference === "ALWAYS"
      ? true
      : clientPreference === "NEVER"
        ? false
        : orgEnabled;

  if (!clientWantsMail) {
    return {
      route: "associate",
      reason: clientPreference === "NEVER" ? "client-off" : "org-off",
    };
  }

  if (!orgMilestones.includes(status)) {
    return { route: "associate", reason: "milestone-off" };
  }

  // Willing but unable. Worth its own reason so the BA's copy can tell them to
  // add an address rather than leaving them to wonder why nothing arrived.
  if (!clientEmail?.trim()) {
    return { route: "associate", reason: "no-client-email" };
  }

  return { route: "client" };
}

/**
 * The line the BA reads at the top of their copy. Written for the person who
 * has to act on it, so each one names the setting that produced it.
 */
export const ASSOCIATE_COPY_REASON_TEXT: Record<AssociateCopyReason, string> = {
  "org-off":
    "You are receiving this instead of your client, because client updates are switched off for your account.",
  "client-off":
    "You are receiving this instead of your client, because this client is set to never be emailed.",
  "milestone-off":
    "You are receiving this instead of your client, because you do not send your clients this particular update.",
  "no-client-email":
    "You are receiving this instead of your client, because we do not have an email address on file for them.",
};
