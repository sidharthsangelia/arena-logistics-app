"use server";

/**
 * BUSINESS ASSOCIATE CLIENT-EMAIL SETTINGS
 * -----------------------------------------------------------------------------
 * Two mutations: the account-wide setting, and the per-client override.
 *
 * Both are gated to business associate orgs. A standard org ships for itself and
 * has no clients to shield, so the setting is meaningless there rather than merely
 * hidden, and letting one write it would leave a value that silently does nothing.
 *
 * The org is resolved from the session in both cases. The client-level mutation
 * additionally checks the client belongs to the caller's org, because a clientId
 * arriving in an argument is not evidence of anything.
 */

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/utils/db";
import { getCurrentOrg } from "@/utils/tenant";
import { getClientEmailRoster, type ClientEmailRoster } from "@/lib/email/queries";
import {
  clientEmailPreferenceSchema,
  clientEmailSettingsSchema,
  type ClientEmailPreferenceInput,
  type ClientEmailSettingsInput,
  type ClientEmailSettingsResult,
} from "@/lib/email/schema";

// One hub route now, with the client-email half on a tab. revalidatePath takes
// the pathname only, so the tab is not part of it.
const SETTINGS_PATH = "/settings";

// zod 4 types `path` as PropertyKey[], which includes symbol. Nothing here uses a
// symbol key, but the signature has to admit one for the call to typecheck.
function fieldErrorsFrom(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function saveClientEmailSettings(
  input: ClientEmailSettingsInput,
): Promise<ClientEmailSettingsResult> {
  const parsed = clientEmailSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Please check the fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const org = await getCurrentOrg();
    if (!org) return { ok: false, error: "We could not find your organisation." };
    if (!org.isBusinessAssociate) {
      return {
        ok: false,
        error: "This setting only applies to business associate accounts.",
      };
    }

    const { enabled, milestones, replyTo } = parsed.data;

    await prisma.org.update({
      where: { id: org.id },
      data: {
        clientEmailsEnabled: enabled,
        // Written even when switched off, so switching back on restores the exact
        // selection rather than resetting to everything.
        clientEmailMilestones: milestones,
        clientEmailReplyTo: replyTo,
      },
    });

    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "saveClientEmailSettings" },
    });
    return { ok: false, error: "Could not save your settings. Please try again." };
  }
}

/**
 * Reads a page of the client roster for the exceptions dialog.
 *
 * A read behind a server action rather than a page prop, because the roster now
 * lives in a dialog: nobody should pay for a paginated query, on every settings
 * load, for a list most people never open. Search and paging happen inside the
 * dialog and never touch the URL, so this is what they call.
 *
 * Same BA gate as the mutations. The org comes from the session, so a caller
 * cannot read another account's clients by asking nicely.
 */
export async function fetchClientEmailRoster(input: {
  page: number;
  query?: string;
  exceptionsOnly?: boolean;
}): Promise<
  { ok: true; roster: ClientEmailRoster } | { ok: false; error: string }
> {
  try {
    const org = await getCurrentOrg();
    if (!org) return { ok: false, error: "We could not find your organisation." };
    if (!org.isBusinessAssociate) {
      return {
        ok: false,
        error: "This setting only applies to business associate accounts.",
      };
    }

    const page =
      Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : 1;

    const roster = await getClientEmailRoster({
      orgId: org.id,
      page,
      query: input.query?.trim() || undefined,
      exceptionsOnly: input.exceptionsOnly === true,
    });

    return { ok: true, roster };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "fetchClientEmailRoster" },
    });
    return { ok: false, error: "Could not load your clients. Please try again." };
  }
}

export async function setClientEmailPreference(
  input: ClientEmailPreferenceInput,
): Promise<ClientEmailSettingsResult> {
  const parsed = clientEmailPreferenceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That is not a valid choice." };
  }

  try {
    const org = await getCurrentOrg();
    if (!org) return { ok: false, error: "We could not find your organisation." };
    if (!org.isBusinessAssociate) {
      return {
        ok: false,
        error: "This setting only applies to business associate accounts.",
      };
    }

    // orgId in the where clause, not just the id. This is the check that stops one
    // BA changing another's client, and doing it as part of the update rather than
    // as a separate read closes the gap between checking and writing.
    const result = await prisma.client.updateMany({
      where: { id: parsed.data.clientId, orgId: org.id, deletedAt: null },
      data: { emailPreference: parsed.data.preference },
    });

    if (result.count === 0) {
      return { ok: false, error: "That client no longer exists." };
    }

    revalidatePath(`/clients/${parsed.data.clientId}`);
    revalidatePath("/clients");
    revalidatePath(SETTINGS_PATH);
    return { ok: true };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "setClientEmailPreference" },
      extra: { clientId: parsed.data.clientId },
    });
    return { ok: false, error: "Could not save that choice. Please try again." };
  }
}
