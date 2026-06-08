// app/api/webhooks/resend/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/utils/db";
import * as Sentry from "@sentry/nextjs";
import { Webhook } from "svix";

// ---------------------------------------------------------------------------
// Actual Resend webhook payload shape (from live payload inspection)
// ---------------------------------------------------------------------------

type ResendWebhookEvent = {
  type: string;
  created_at: string;
  data: {
    email_id:   string;
    from:       string;
    subject:    string;
    to:         string[];
    created_at: string;

    // Tags come as a plain key-value object, NOT an array
    tags?: Record<string, string>;

    // Click data is nested under data.click (not top-level)
    click?: {
      ipAddress: string;
      link:      string;
      timestamp: string;
      userAgent: string;
    };

    // Open data (for email.opened)
    open?: {
      ipAddress: string;
      timestamp: string;
      userAgent: string;
    };
  };
};

// ---------------------------------------------------------------------------
// Map Resend event type → DB enum value
// ---------------------------------------------------------------------------

const EVENT_MAP: Record<string, string> = {
  "email.sent":       "SENT",
  "email.delivered":  "DELIVERED",
  "email.opened":     "OPENED",
  "email.clicked":    "CLICKED",
  "email.bounced":    "BOUNCED",
  "email.complained": "COMPLAINED",
};

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // ── Verify svix signature ──────────────────────────────────────────────
  const svixId        = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: "Missing svix signature headers" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: ResendWebhookEvent;
  try {
    event = wh.verify(rawBody, {
      "svix-id":        svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendWebhookEvent;
  } catch (err) {
    console.error("[resend-webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  // ── Map event type ─────────────────────────────────────────────────────
  const dbEvent = EVENT_MAP[event.type];
  if (!dbEvent) {
    // Unknown event type — acknowledge so Resend doesn't retry
    return NextResponse.json({ received: true });
  }

  const { data } = event;

  // ── Extract quoteId + orgId from tags object ───────────────────────────
  // Resend sends tags as { key: value } plain object, not [{name, value}]
  const quoteId = data.tags?.quoteId;
  const orgId   = data.tags?.orgId;

  if (!quoteId || !orgId) {
    // Email sent before tracking tags were added — skip gracefully
    console.warn(
      "[resend-webhook] No quoteId/orgId tags on email:",
      data.email_id
    );
    return NextResponse.json({ received: true });
  }

  // ── Extract event-specific metadata ───────────────────────────────────
  // click and open data are nested under data.click / data.open
  const clickedUrl = data.click?.link      ?? null;
  const ipAddress  = data.click?.ipAddress ?? data.open?.ipAddress ?? null;
  const userAgent  = data.click?.userAgent ?? data.open?.userAgent ?? null;

  try {
    // ── Write event to DB ────────────────────────────────────────────────
    await prisma.quoteEmailEvent.create({
      data: {
        orgId,
        quoteId,
        resendEmailId: data.email_id,
        event:         dbEvent as any,
        clickedUrl,
        ipAddress,
        userAgent,
      },
    });

    // ── Side effects ─────────────────────────────────────────────────────
    // On bounce: no status change but Sentry alert so you can act on it
    if (event.type === "email.bounced") {
      Sentry.captureMessage(`Quote email bounced: ${quoteId}`, {
        level: "warning",
        extra: { quoteId, orgId, emailId: data.email_id, to: data.to },
      });
    }

    console.log(
      `[resend-webhook] ${event.type} recorded for quote ${quoteId}`
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags:  { location: "resend-webhook" },
      extra: { quoteId, orgId, event: event.type, emailId: data.email_id },
    });

    // Return 500 so Resend retries
    return NextResponse.json(
      { error: "Failed to record email event" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}