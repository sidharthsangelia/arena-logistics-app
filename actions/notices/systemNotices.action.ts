"use server";

// Arena-only mutations for the tenant info banner.
//
// No auth check here: /arena-dashboard and the server actions invoked from pages
// under it are already gated to ARENA_ORG_ID staff by clerkMiddleware in
// proxy.ts — same reasoning as actions/business-associates/action.ts. auth() is
// still called, but only to stamp createdBy/updatedBy for the audit trail.

import * as Sentry from "@sentry/nextjs";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { prisma } from "@/utils/db";
import { SYSTEM_NOTICES_TAG } from "@/lib/notices/queries";
import { systemNoticeInputSchema } from "@/lib/notices/schema";
import type {
  SaveSystemNoticeResult,
  SystemNoticeInput,
  SystemNoticeMutationResult,
} from "@/lib/notices/schema";

const ADMIN_PATH = "/arena-dashboard/notices";

// ---------------------------------------------------------------------------
// invalidate
//
// One tag covers every tenant read. "max" gives stale-while-revalidate, which
// is the right trade for the tenant side: a notice appears within moments
// instead of blocking the next page render on a fresh DB round trip. The admin
// list reads the DB directly, so ops always sees the truth immediately.
// ---------------------------------------------------------------------------

function invalidate() {
  revalidateTag(SYSTEM_NOTICES_TAG, "max");
  revalidatePath(ADMIN_PATH);
}

async function currentUserId() {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch {
    // Audit stamp only — never fail a save because the session lookup hiccuped.
    return null;
  }
}

// Fields whose change means a tenant is looking at different content, and so
// should see the notice again even if they dismissed the earlier version.
// Scheduling, priority and audience are deliberately absent: extending a
// window or re-targeting a notice is not new information.
function contentChanged(
  before: {
    title: string | null;
    message: string;
    severity: string;
    linkLabel: string | null;
    linkHref: string | null;
  },
  after: {
    title: string | null;
    message: string;
    severity: string;
    linkLabel: string | null;
    linkHref: string | null;
  },
) {
  return (
    before.title !== after.title ||
    before.message !== after.message ||
    before.severity !== after.severity ||
    before.linkLabel !== after.linkLabel ||
    before.linkHref !== after.linkHref
  );
}

// ---------------------------------------------------------------------------
// saveSystemNotice — create when `id` is absent, update when present
// ---------------------------------------------------------------------------

export async function saveSystemNotice(
  input: SystemNoticeInput,
): Promise<SaveSystemNoticeResult> {
  const parsed = systemNoticeInputSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the fields.",
      fieldErrors,
    };
  }

  const { id, startsAt, endsAt, displayMode, ...rest } = parsed.data;
  const userId = await currentUserId();

  // Dates only mean anything for a scheduled notice. Clearing them when the
  // mode is ALWAYS keeps the row honest, so noticeStatus never has to guess.
  const window =
    displayMode === "SCHEDULED"
      ? {
          startsAt: startsAt ? new Date(startsAt) : null,
          endsAt: endsAt ? new Date(endsAt) : null,
        }
      : { startsAt: null, endsAt: null };

  try {
    if (!id) {
      const created = await prisma.systemNotice.create({
        data: {
          ...rest,
          displayMode,
          ...window,
          createdBy: userId,
          updatedBy: userId,
        },
        select: { id: true },
      });

      invalidate();
      return { ok: true, id: created.id };
    }

    const existing = await prisma.systemNotice.findFirst({
      where: { id, deletedAt: null },
      select: {
        title: true,
        message: true,
        severity: true,
        linkLabel: true,
        linkHref: true,
        revision: true,
      },
    });

    if (!existing) return { ok: false, error: "That notice no longer exists." };

    const updated = await prisma.systemNotice.update({
      where: { id },
      data: {
        ...rest,
        displayMode,
        ...window,
        updatedBy: userId,
        revision: contentChanged(existing, rest)
          ? existing.revision + 1
          : existing.revision,
      },
      select: { id: true },
    });

    invalidate();
    return { ok: true, id: updated.id };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "saveSystemNotice" },
      extra: { noticeId: id ?? null },
    });
    return { ok: false, error: "Could not save the notice. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// setSystemNoticeActive — the switch in the admin table
// ---------------------------------------------------------------------------

export async function setSystemNoticeActive(
  id: string,
  isActive: boolean,
): Promise<SystemNoticeMutationResult> {
  try {
    const existing = await prisma.systemNotice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) return { ok: false, error: "That notice no longer exists." };

    await prisma.systemNotice.update({
      where: { id },
      data: { isActive, updatedBy: await currentUserId() },
    });

    invalidate();
    return { ok: true };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "setSystemNoticeActive" },
      extra: { noticeId: id, isActive },
    });
    return { ok: false, error: "Could not update the notice." };
  }
}

// ---------------------------------------------------------------------------
// cloneSystemNotice
//
// Seasonal notices repeat: the Diwali closure goes out every year with two
// dates changed. Clones land switched off so nothing reaches tenants until the
// copy has been reviewed.
// ---------------------------------------------------------------------------

export async function cloneSystemNotice(
  id: string,
): Promise<SaveSystemNoticeResult> {
  try {
    const source = await prisma.systemNotice.findFirst({
      where: { id, deletedAt: null },
    });

    if (!source) return { ok: false, error: "That notice no longer exists." };

    const userId = await currentUserId();

    const created = await prisma.systemNotice.create({
      data: {
        title: source.title,
        message: source.message,
        severity: source.severity,
        audience: source.audience,
        displayMode: source.displayMode,
        isActive: false,
        dismissible: source.dismissible,
        priority: source.priority,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        linkLabel: source.linkLabel,
        linkHref: source.linkHref,
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true },
    });

    revalidatePath(ADMIN_PATH);
    return { ok: true, id: created.id };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "cloneSystemNotice" },
      extra: { noticeId: id },
    });
    return { ok: false, error: "Could not duplicate the notice." };
  }
}

// ---------------------------------------------------------------------------
// deleteSystemNotice — soft delete, so what was announced stays auditable
// ---------------------------------------------------------------------------

export async function deleteSystemNotice(
  id: string,
): Promise<SystemNoticeMutationResult> {
  try {
    const existing = await prisma.systemNotice.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) return { ok: true }; // already gone — nothing to undo

    await prisma.systemNotice.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        updatedBy: await currentUserId(),
      },
    });

    invalidate();
    return { ok: true };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "deleteSystemNotice" },
      extra: { noticeId: id },
    });
    return { ok: false, error: "Could not delete the notice." };
  }
}
