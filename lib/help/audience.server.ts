import "server-only";

import { auth } from "@clerk/nextjs/server";

import { getArenaAuth } from "@/utils/arena-auth";
import { getOrgShell } from "@/utils/tenant";
import type { HelpAudience } from "./types";

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

/**
 * Who is reading, from the session. Never from anything the browser sends.
 *
 * Arena role comes from the Clerk session (no round trip). BA standing comes
 * from the DB-backed org shell, the same cached read the tenant layout already
 * made, because BA standing is a security boundary and the Clerk metadata
 * mirror is not trusted for it.
 *
 * Fails closed to "standard", the audience that sees the least.
 */
export async function resolveHelpAudience(): Promise<HelpAudience> {
  const { orgId } = await auth();
  if (orgId && orgId === ARENA_ORG_ID) {
    const { isArenaAdmin } = await getArenaAuth();
    return isArenaAdmin ? "arena-admin" : "arena-ops";
  }
  const org = await getOrgShell();
  return org?.isBusinessAssociate ? "ba" : "standard";
}
