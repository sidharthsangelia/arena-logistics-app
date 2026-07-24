import "server-only";

import { prisma } from "@/utils/db";
import {
  isClientEmailMilestone,
  type ClientEmailMilestone,
  type ClientEmailPreferenceKey,
} from "./clientEmails";

/**
 * Reads for the business associate client-email settings screen.
 *
 * Uncached: somebody who has just changed who hears from them needs to see that
 * it took, and this screen is opened rarely enough that a cache would be all cost
 * and no benefit.
 */

export interface ClientEmailSettings {
  enabled: boolean;
  milestones: ClientEmailMilestone[];
  replyTo: string | null;
  /** Shown as the fallback when replyTo is blank. */
  orgEmail: string | null;
  orgDisplayName: string;
}

export async function getClientEmailSettings(
  orgId: string,
): Promise<ClientEmailSettings | null> {
  const org = await prisma.org.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      companyName: true,
      email: true,
      clientEmailsEnabled: true,
      clientEmailMilestones: true,
      clientEmailReplyTo: true,
    },
  });

  if (!org) return null;

  return {
    enabled: org.clientEmailsEnabled,
    // Filtered rather than cast. The column is the full ShipmentStatus enum, so a
    // value written before the choosable set narrowed would otherwise reach a
    // checkbox that does not exist and be silently dropped on the next save.
    milestones: org.clientEmailMilestones.filter(isClientEmailMilestone),
    replyTo: org.clientEmailReplyTo,
    orgEmail: org.email,
    orgDisplayName: org.companyName?.trim() || org.name,
  };
}

export interface ClientEmailRosterRow {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  preference: ClientEmailPreferenceKey;
  /** Shipments booked for this client, so the busy ones can be dealt with first. */
  shipmentCount: number;
}

export interface ClientEmailRoster {
  rows: ClientEmailRosterRow[];
  totalRows: number;
  pageCount: number;
  /** How many clients have been pinned away from the account default. */
  exceptionCount: number;
}

export const ROSTER_PAGE_SIZE = 12;

export async function getClientEmailRoster(params: {
  orgId: string;
  query?: string;
  page: number;
  /** Narrows to clients pinned away from the default, which is the short list. */
  exceptionsOnly?: boolean;
}): Promise<ClientEmailRoster> {
  const { orgId, query, page, exceptionsOnly } = params;

  const where = {
    orgId,
    deletedAt: null,
    ...(exceptionsOnly ? { emailPreference: { not: "INHERIT" as const } } : {}),
    ...(query?.trim()
      ? {
          OR: [
            { companyName: { contains: query.trim(), mode: "insensitive" as const } },
            { contactName: { contains: query.trim(), mode: "insensitive" as const } },
            { email: { contains: query.trim(), mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, totalRows, exceptionCount] = await Promise.all([
    prisma.client.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        contactName: true,
        email: true,
        emailPreference: true,
        _count: { select: { shipments: true } },
      },
      // Busiest first. A client with thirty shipments matters more here than one
      // with none, and alphabetical order would bury them among dormant records.
      orderBy: [{ shipments: { _count: "desc" } }, { companyName: "asc" }],
      skip: Math.max(0, (page - 1) * ROSTER_PAGE_SIZE),
      take: ROSTER_PAGE_SIZE,
    }),
    prisma.client.count({ where }),
    prisma.client.count({
      where: { orgId, deletedAt: null, emailPreference: { not: "INHERIT" } },
    }),
  ]);

  return {
    rows: rows.map((c) => ({
      id: c.id,
      companyName: c.companyName,
      contactName: c.contactName,
      email: c.email,
      preference: c.emailPreference,
      shipmentCount: c._count.shipments,
    })),
    totalRows,
    pageCount: Math.max(1, Math.ceil(totalRows / ROSTER_PAGE_SIZE)),
    exceptionCount,
  };
}
