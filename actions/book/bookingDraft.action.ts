"use server";

/**
 * actions/book/bookingDraft.action.ts
 *
 * Persistence for the "Save & Next" booking wizard. A BookingDraft holds the
 * entire wizard state as JSON plus the step the user is on, so a half-finished
 * booking survives a page reload / navigating away and can be resumed later.
 *
 * The real Shipment + Address rows are NOT created here — they're only
 * materialised at final submit (createShipment.action.ts). This keeps the
 * Shipment table free of DRAFT clutter and nullable address FKs.
 *
 * One in-progress draft per (org, user) is the intent. There's no DB unique
 * constraint on that pair (kept the migration additive/non-destructive), so
 * "one draft" is enforced here: find the existing row and update it, else
 * create. A single user isn't realistically racing their own saves; worst
 * case is a duplicate row, which is harmless and cleaned up on submit.
 */

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/utils/db";
import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { ok, fail, type ActionResult } from "@/types/booking";

export interface BookingDraftPayload {
  id: string;
  currentStep: number;
  data: unknown;
  updatedAt: Date;
}

/**
 * The current user's in-progress draft for the active org, or null if none.
 * Used to offer "resume your booking" when the wizard mounts.
 */
export async function getBookingDraft(): Promise<
  ActionResult<BookingDraftPayload | null>
> {
  try {
    const { org, userId } = await getCurrentOrgContext();

    const draft = await prisma.bookingDraft.findFirst({
      where: { orgId: org.id, userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, currentStep: true, data: true, updatedAt: true },
    });

    return ok(draft ?? null);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not load your saved booking.");
  }
}

/**
 * Upsert the current user's draft. Called by "Save & Next" after each step
 * validates. `data` is the whole BookingFormData; typed as unknown here since
 * the wizard shape evolves and the column is JSON.
 */
export async function saveBookingDraft(
  currentStep: number,
  data: unknown,
): Promise<ActionResult<BookingDraftPayload>> {
  try {
    const { org, userId } = await getCurrentOrgContext();

    const jsonData = data as Prisma.InputJsonValue;

    const existing = await prisma.bookingDraft.findFirst({
      where: { orgId: org.id, userId },
      select: { id: true },
    });

    const draft = existing
      ? await prisma.bookingDraft.update({
          where: { id: existing.id },
          data: { currentStep, data: jsonData },
          select: { id: true, currentStep: true, data: true, updatedAt: true },
        })
      : await prisma.bookingDraft.create({
          data: { orgId: org.id, userId, currentStep, data: jsonData },
          select: { id: true, currentStep: true, data: true, updatedAt: true },
        });

    return ok(draft);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not save your booking progress.");
  }
}

/**
 * Delete the current user's draft(s) for the active org. Called on successful
 * booking submit, or when the user explicitly discards a resumed draft.
 */
export async function clearBookingDraft(): Promise<ActionResult<{ cleared: number }>> {
  try {
    const { org, userId } = await getCurrentOrgContext();

    const result = await prisma.bookingDraft.deleteMany({
      where: { orgId: org.id, userId },
    });

    return ok({ cleared: result.count });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not clear your saved booking.");
  }
}
