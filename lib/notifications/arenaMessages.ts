import "server-only";

import { prisma } from "@/utils/db";
import type { NoticeSeverity } from "@/generated/prisma";
import type { MessageTarget } from "./messageSchema";

/**
 * Reads for the targeted inbox message composer on the arena notices screen.
 *
 * Uncached. Ops is about to send something to real customers, so the recipient list
 * has to be the one that exists right now, not one from a minute ago.
 */

export interface MessageRecipientOption {
  id: string;
  label: string;
  isBusinessAssociate: boolean;
  /** Null when we have no address, so the composer can say emailing will skip them. */
  email: string | null;
}

export async function getMessageRecipients(): Promise<MessageRecipientOption[]> {
  const orgs = await prisma.org.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      companyName: true,
      email: true,
      isBusinessAssociate: true,
    },
    orderBy: [{ isBusinessAssociate: "desc" }, { name: "asc" }],
  });

  return orgs.map((org) => ({
    id: org.id,
    label: org.companyName?.trim() || org.name,
    isBusinessAssociate: org.isBusinessAssociate,
    email: org.email?.trim() || null,
  }));
}

/**
 * Turns a target choice into concrete org ids.
 *
 * Resolved server side on every send rather than snapshotted in the UI, so an org
 * onboarded five minutes ago is included in an "Everyone" message. The picked list is
 * intersected with the live set for the same reason in reverse: an id for an org that
 * has since been deleted is dropped rather than written as an orphan row.
 */
export async function resolveTargetOrgIds(
  target: MessageTarget,
  pickedIds: string[],
): Promise<{ id: string; label: string; email: string | null }[]> {
  const where =
    target === "BUSINESS_ASSOCIATES"
      ? { deletedAt: null, isBusinessAssociate: true }
      : target === "STANDARD"
        ? { deletedAt: null, isBusinessAssociate: false }
        : target === "PICK"
          ? { deletedAt: null, id: { in: pickedIds } }
          : { deletedAt: null };

  const orgs = await prisma.org.findMany({
    where,
    select: { id: true, name: true, companyName: true, email: true },
  });

  return orgs.map((org) => ({
    id: org.id,
    label: org.companyName?.trim() || org.name,
    email: org.email?.trim() || null,
  }));
}

export interface SentMessageSummary {
  /** Groups the per-org rows one send produced back into a single entry. */
  key: string;
  title: string;
  body: string | null;
  severity: NoticeSeverity;
  linkHref: string | null;
  sentAt: string;
  orgCount: number;
  readCount: number;
}

/**
 * What ops has sent, newest first, with how many recipients have read it.
 *
 * The read count is the reason this list is worth having at all: "I told everyone"
 * and "everyone knows" are different claims, and only one of them is checkable.
 *
 * One send becomes one row per org, so they are grouped back together on
 * title + body + the second they were created in. A synthetic batch id on the
 * notification would be tidier, but it would be a column that exists only to
 * support this screen, and second-level grouping is exact for anything a human
 * composes and sends by hand.
 */
export async function listSentMessages(limit = 25): Promise<SentMessageSummary[]> {
  const rows = await prisma.notification.findMany({
    where: { kind: "ARENA_MESSAGE" },
    select: {
      id: true,
      title: true,
      body: true,
      severity: true,
      linkHref: true,
      createdAt: true,
      orgId: true,
      _count: { select: { receipts: true } },
    },
    orderBy: { createdAt: "desc" },
    // Over-fetch, because grouping collapses many rows into one entry and we want
    // `limit` entries out rather than `limit` rows in.
    take: limit * 40,
  });

  const groups = new Map<string, SentMessageSummary>();

  for (const row of rows) {
    const bucket = `${row.title}|${row.body ?? ""}|${Math.floor(row.createdAt.getTime() / 1000)}`;
    const existing = groups.get(bucket);

    if (existing) {
      existing.orgCount += 1;
      existing.readCount += row._count.receipts > 0 ? 1 : 0;
      continue;
    }

    groups.set(bucket, {
      key: row.id,
      title: row.title,
      body: row.body,
      severity: row.severity,
      linkHref: row.linkHref,
      sentAt: row.createdAt.toISOString(),
      orgCount: 1,
      readCount: row._count.receipts > 0 ? 1 : 0,
    });
  }

  return [...groups.values()].slice(0, limit);
}
