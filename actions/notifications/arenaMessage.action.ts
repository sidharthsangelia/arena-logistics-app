"use server";

/**
 * SENDING A TARGETED MESSAGE
 * -----------------------------------------------------------------------------
 * The inbox counterpart to the dashboard banner. A banner shouts at everybody who
 * happens to open the app; this reaches chosen organisations and stays in their
 * history until they have dealt with it.
 *
 * Arena staff only. Every route and action under /arena-dashboard is already gated to
 * arena members by proxy.ts, and this one calls requireArenaMember on top because a
 * server action is a public endpoint whatever route it was written for.
 *
 * Ops, not admin. Telling customers about a carrier delay is the job, not a money
 * decision, and requiring an admin would mean the person who knows about the delay
 * has to go and find one.
 */

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";

import { ArenaForbiddenError, requireArenaMember } from "@/utils/arena-auth";
import { notifyArenaMessage } from "@/lib/notifications/emit";
import { resolveTargetOrgIds } from "@/lib/notifications/arenaMessages";
import {
  arenaMessageSchema,
  type ArenaMessageInput,
  type ArenaMessageResult,
} from "@/lib/notifications/messageSchema";
import { sendArenaMessageEmails } from "@/lib/email/message/send";

const ADMIN_PATH = "/arena-dashboard/notices";

export async function sendArenaMessage(
  input: ArenaMessageInput,
): Promise<ArenaMessageResult> {
  const parsed = arenaMessageSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.map(String).join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the fields.",
      fieldErrors,
    };
  }

  const data = parsed.data;

  try {
    const { userId } = await requireArenaMember();

    const targets = await resolveTargetOrgIds(data.target, data.orgIds);

    if (targets.length === 0) {
      return {
        ok: false,
        error: "That selection matches no organisations, so nothing was sent.",
      };
    }

    // Inbox first, and always. It is the durable half: if the email step falls over,
    // the message is still waiting for them in the app, which is the outcome we
    // would choose if we could only have one.
    const delivered = await notifyArenaMessage({
      orgIds: targets.map((org) => org.id),
      title: data.title,
      body: data.body,
      severity: data.severity,
      linkHref: data.linkHref,
      createdBy: userId,
    });

    let emailed: number | null = null;
    if (data.alsoEmail) {
      emailed = await sendArenaMessageEmails({
        recipients: targets.map((org) => ({
          orgId: org.id,
          label: org.label,
          email: org.email,
        })),
        title: data.title,
        body: data.body,
        severity: data.severity,
        linkLabel: data.linkLabel,
        linkHref: data.linkHref,
      });
    }

    revalidatePath(ADMIN_PATH);
    return { ok: true, delivered, emailed };
  } catch (error) {
    if (error instanceof ArenaForbiddenError) {
      return { ok: false, error: "You do not have access to send messages." };
    }

    Sentry.captureException(error, {
      tags: { location: "sendArenaMessage" },
      extra: { target: data.target, recipients: data.orgIds.length },
    });
    return { ok: false, error: "Could not send the message. Please try again." };
  }
}
