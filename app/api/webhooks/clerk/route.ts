// app/api/webhooks/clerk/route.ts
// Handles Clerk org lifecycle events and keeps the DB in sync.
// Acts as a safety net — the onboarding action creates the row first,
// this upserts it so nothing is ever out of sync.

import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { prisma } from "@/utils/db";
import { syncOrgTypeMetadata } from "@/lib/org-type.server";

type ClerkOrgEvent = {
  type: string;
  data: {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    deleted?: boolean;
  };
};

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "CLERK_WEBHOOK_SECRET not set" },
      { status: 500 }
    );
  }

  // Verify the webhook signature using svix
  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(webhookSecret);

  let event: ClerkOrgEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkOrgEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;

  try {
    switch (type) {
      // ── Org created ──────────────────────────────────────────────────────
      case "organization.created": {
        const org = await prisma.org.upsert({
          where: { clerkOrgId: data.id },
          update: {
            name: data.name,
            slug: data.slug,
            logoUrl: data.logo_url ?? null,
          },
          create: {
            clerkOrgId: data.id,
            slug: data.slug,
            name: data.name,
            logoUrl: data.logo_url ?? null,
          },
          select: { isBusinessAssociate: true },
        });

        // Seed the Clerk metadata mirror so tenant-side checks never need the
        // DB just to learn the org's classification. Best-effort: failures are
        // logged inside the helper and reconciled later by the lazy backfill,
        // so they must not fail the webhook (which would trigger Clerk retries).
        await syncOrgTypeMetadata(data.id, org.isBusinessAssociate);
        break;
      }

      // ── Org updated (name / slug / logo changed) ─────────────────────────
      case "organization.updated": {
        await prisma.org.update({
          where: { clerkOrgId: data.id },
          data: {
            name: data.name,
            slug: data.slug,
            logoUrl: data.logo_url ?? null,
          },
        });
        break;
      }

      // ── Org deleted ───────────────────────────────────────────────────────
      // Soft-delete so org data is preserved for legal / billing reasons
      case "organization.deleted": {
        if (data.deleted) {
          await prisma.org.update({
            where: { clerkOrgId: data.id },
            data: { deletedAt: new Date() },
          });
        }
        break;
      }

      default:
        // Ignore all other Clerk events (user.created, session.*, etc.)
        break;
    }
  } catch (err) {
    console.error(`Clerk webhook handler failed for event ${type}:`, err);
    // Return 500 so Clerk retries the webhook
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}