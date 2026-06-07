// actions/quoteEmailEvents.action.ts
"use server";

import { prisma } from "@/utils/db";
import { getDbOrgId } from "@/utils/tenant";
import type { EmailEvent } from "@/generated/prisma";

export type QuoteEmailEventRow = {
  id:           string;
  event:        EmailEvent;
  resendEmailId: string;
  userAgent:    string | null;
  clickedUrl:   string | null;
  createdAt:    string; // ISO string
};

export type GetQuoteEmailEventsResult =
  | { success: true;  events: QuoteEmailEventRow[]; lastEvent: EmailEvent | null }
  | { success: false; message: string };

export async function getQuoteEmailEventsAction(
  quoteId: string,
): Promise<GetQuoteEmailEventsResult> {
  try {
    const orgId = await getDbOrgId();

    const events = await prisma.quoteEmailEvent.findMany({
      where:   { quoteId, orgId },
      orderBy: { createdAt: "asc" },
      select: {
        id:            true,
        event:         true,
        resendEmailId: true,
        userAgent:     true,
        clickedUrl:    true,
        createdAt:     true,
      },
    });

    // The "furthest" event in the delivery lifecycle
    // COMPLAINED > BOUNCED > CLICKED > OPENED > DELIVERED > SENT
    const priority: EmailEvent[] = [
      "COMPLAINED", "BOUNCED", "CLICKED", "OPENED", "DELIVERED", "SENT",
    ];

    const eventTypes = events.map((e) => e.event);
    const lastEvent  = priority.find((p) => eventTypes.includes(p)) ?? null;

    return {
      success:   true,
      lastEvent,
      events: events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    return { success: false, message: "Failed to fetch email events." };
  }
}