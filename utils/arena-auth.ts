import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

/**
 * ARENA STAFF AUTHORISATION
 * -----------------------------------------------------------------------------
 * Two levels of access inside the Arena organisation:
 *
 *   member — the ops team. Runs bookings, tracking, documents, rate cards.
 *   admin  — everything a member can do, plus anything to do with money.
 *
 * "Money" means Arena's own commercial position: revenue, margin, markup
 * percentages, wallet balances and the transaction ledger. It deliberately does
 * NOT mean a shipment's quoted total, which stays visible to members because
 * customs paperwork and vendor coordination need the declared value.
 *
 * WHY THIS FILE EXISTS
 * Every money check in the app goes through here rather than reading `orgRole`
 * inline. Today the admin level maps onto Clerk's built-in `org:admin` role,
 * which also carries the ability to invite and remove members. If those two
 * powers ever need separating, this becomes a custom Clerk permission
 * (`org:finance:read`) and the change lands in this one file instead of
 * every page and action that shows a rupee figure.
 *
 * ROUTE GATING IS NOT ENOUGH
 * `proxy.ts` redirects non-admins away from /arena-dashboard/wallets, but the
 * Next.js docs are explicit that proxy is for optimistic checks, not for
 * authorisation. So the page re-checks on render and every mutating action calls
 * `requireArenaAdmin()` for itself. A direct POST to a server action never
 * passes through the route gate.
 */

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

/** Clerk's built-in organisation admin role. */
export const ARENA_ADMIN_ROLE = "org:admin";

export type ArenaAuth = {
  userId: string;
  /** Signed in with the Arena organisation active. */
  isArenaMember: boolean;
  /** Arena staff who may also see money. */
  isArenaAdmin: boolean;
};

/**
 * Thrown when someone reaches a money operation they are not allowed to run.
 * Server actions catch this and return a friendly message rather than letting a
 * raw error reach the user.
 */
export class ArenaForbiddenError extends Error {
  constructor(message = "Only Arena admins can do this.") {
    super(message);
    this.name = "ArenaForbiddenError";
  }
}

/**
 * Resolve the caller's standing inside the Arena org. Never throws, so it is
 * safe to call while rendering a layout or page: a failure degrades to "not
 * staff, not admin" rather than blanking the screen.
 *
 * Costs nothing beyond the `auth()` call Clerk has already resolved for the
 * request. No DB round-trip and no Clerk API call.
 */
export async function getArenaAuth(): Promise<ArenaAuth> {
  try {
    const { userId, orgId, has } = await auth();

    if (!userId || orgId !== ARENA_ORG_ID) {
      return { userId: userId ?? "", isArenaMember: false, isArenaAdmin: false };
    }

    return {
      userId,
      isArenaMember: true,
      isArenaAdmin: has({ role: ARENA_ADMIN_ROLE }),
    };
  } catch (error) {
    Sentry.captureException(error, { tags: { location: "getArenaAuth" } });
    return { userId: "", isArenaMember: false, isArenaAdmin: false };
  }
}

/**
 * Convenience read for the common question a page asks: should this render
 * money? Reads as the thing it controls rather than as a role name, so a call
 * site does not have to know that admin and money happen to be the same thing
 * right now.
 */
export async function canSeeMoney(): Promise<boolean> {
  return (await getArenaAuth()).isArenaAdmin;
}

/** Any Arena staff member. Throws if the caller is not one. */
export async function requireArenaMember(): Promise<ArenaAuth> {
  const arena = await getArenaAuth();
  if (!arena.isArenaMember) {
    throw new ArenaForbiddenError("You need to be signed in as Arena staff.");
  }
  return arena;
}

/**
 * Arena admin only. The gate on every money mutation: manual wallet credits and
 * debits, reversing a collection, writing off a balance.
 */
export async function requireArenaAdmin(): Promise<ArenaAuth> {
  const arena = await requireArenaMember();
  if (!arena.isArenaAdmin) {
    throw new ArenaForbiddenError(
      "Only Arena admins can do this. Ask an admin to make the change.",
    );
  }
  return arena;
}

/**
 * The caller's display name, for stamping onto a record so the history reads
 * without a Clerk lookup per row and still makes sense after they leave the
 * team.
 *
 * Costs one Clerk API call, so call it only when writing, never on a read path.
 * Falls back to the email, then to null, and never throws: failing to resolve a
 * name must not stop money being recorded.
 */
export async function getActorName(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;

    return user.primaryEmailAddress?.emailAddress ?? null;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "getActorName" },
      extra: { userId },
    });
    return null;
  }
}
