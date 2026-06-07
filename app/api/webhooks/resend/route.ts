// app/api/webhooks/resend/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/utils/db";
import * as Sentry from "@sentry/nextjs";

// Resend webhook event shape (relevant fields only)
type ResendWebhookEvent = {
  type: string;
  data: {
    email_id:   string;
    from:       string;
    to:         string[];
    subject:    string;
    click?:     { link: string };
    tags?:      { name: string; value: string }[];
    // Resend sends these for open/click events
    user_agent?: string;
    ip_address?: string;
  };
};

// Map Resend event types to our DB enum
const EVENT_MAP: Record<string, string> = {
  "email.sent":       "SENT",
  "email.delivered":  "DELIVERED",
  "email.opened":     "OPENED",
  "email.clicked":    "CLICKED",
  "email.bounced":    "BOUNCED",
  "email.complained": "COMPLAINED",
};

export async function POST(req: NextRequest) {
  // ── Verify webhook signature ─────────────────────────────────────────────
  // Resend signs webhooks with the svix library — same as Clerk
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "RESEND_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const svixId        = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();

  // Verify signature
  const { Webhook } = await import("svix");
  const wh = new Webhook(webhookSecret);

  let event: ResendWebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id":        svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── Map event type ───────────────────────────────────────────────────────
  const dbEvent = EVENT_MAP[event.type];
  if (!dbEvent) {
    // Event type we don't handle — acknowledge and move on
    return NextResponse.json({ received: true });
  }

  const { email_id, tags, click, user_agent, ip_address } = event.data;

  // ── Extract quoteId and orgId from tags ──────────────────────────────────
  // We embedded these when sending — no DB lookup needed to correlate
  const quoteId = tags?.find((t) => t.name === "quoteId")?.value;
  const orgId   = tags?.find((t) => t.name === "orgId")?.value;

  if (!quoteId || !orgId) {
    // Old email sent before tracking was added — skip gracefully
    return NextResponse.json({ received: true });
  }

  try {
    // ── Record the event ────────────────────────────────────────────────────
    await prisma.quoteEmailEvent.create({
      data: {
        orgId,
        quoteId,
        resendEmailId: email_id,
        event:         dbEvent as any,
        userAgent:     user_agent  ?? null,
        ipAddress:     ip_address  ?? null,
        clickedUrl:    click?.link ?? null,
      },
    });

    // ── Side effects per event ──────────────────────────────────────────────
    if (event.type === "email.bounced") {
      // Mark the quote so ops team knows the email didn't reach the client
      await prisma.quote.update({
        where: { id: quoteId, orgId },
        data:  { status: "SENT" }, // keep SENT — bounce is surfaced via events
      });
    }

    // For OPENED: no status change — just the event record is enough.
    // The quotes table UI will show "Opened" based on the event log.

  } catch (err) {
    Sentry.captureException(err, {
      tags:  { location: "resend-webhook" },
      extra: { quoteId, orgId, event: event.type, email_id },
    });
    // Return 500 so Resend retries the webhook
    return NextResponse.json(
      { error: "Failed to record email event" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}