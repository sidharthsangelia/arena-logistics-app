"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, MailX } from "lucide-react";

import { cn } from "@/lib/utils";
import { setClientEmailPreference } from "@/actions/settings/clientEmails.action";
import {
  CLIENT_EMAIL_PREFERENCES,
  CLIENT_EMAIL_PREFERENCE_CONFIG,
  type ClientEmailPreferenceKey,
} from "@/lib/email/clientEmails";

/**
 * Whether this one client hears from us, shown where the decision naturally comes
 * up: on the client's own record, next to the address the email would go to.
 *
 * The same choice exists in bulk on /settings/client-emails. Both are worth having.
 * That screen is where you set things up; this is where you are when a client says
 * "please stop emailing me" and you want it done in one click without leaving them.
 *
 * The card states the resulting behaviour in a sentence rather than only naming the
 * setting, because "Default" means nothing on its own: the reader has to know what
 * the account-wide switch currently says, and that is one screen away.
 */
export function ClientEmailPreferenceCard({
  clientId,
  clientName,
  clientEmail,
  preference,
  orgEnabled,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  preference: ClientEmailPreferenceKey;
  orgEnabled: boolean;
}) {
  const [current, setCurrent] = React.useState(preference);
  const [isPending, startTransition] = React.useTransition();

  // Keeps the control honest if the row is refetched (an edit elsewhere, a
  // revalidation). Adjusted during render, which is React's documented way to
  // derive state from a changed prop.
  const [lastProp, setLastProp] = React.useState(preference);
  if (preference !== lastProp) {
    setLastProp(preference);
    setCurrent(preference);
  }

  const willBeEmailed =
    current === "ALWAYS" ? true : current === "NEVER" ? false : orgEnabled;

  const hasAddress = Boolean(clientEmail?.trim());

  function change(next: ClientEmailPreferenceKey) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);

    startTransition(async () => {
      const result = await setClientEmailPreference({ clientId, preference: next });
      if (!result.ok) {
        setCurrent(previous); // put the control back where it was
        toast.error("Could not save that", { description: result.error });
        return;
      }
      toast.success("Saved");
    });
  }

  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Shipment emails
        </p>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="flex items-start gap-2.5">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              willBeEmailed && hasAddress
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-600",
            )}
          >
            {willBeEmailed && hasAddress ? (
              <Mail className="h-3.5 w-3.5" />
            ) : (
              <MailX className="h-3.5 w-3.5" />
            )}
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            {!hasAddress ? (
              <>
                {clientName} has no email address on file, so nothing can be sent to
                them. Updates come to you.
              </>
            ) : willBeEmailed ? (
              <>
                {clientName} is emailed about their shipments, under your company
                name.
              </>
            ) : (
              <>
                {clientName} is not emailed. Every update about their shipments comes
                to you instead.
              </>
            )}
          </p>
        </div>

        <div
          role="group"
          aria-label={`Email preference for ${clientName}`}
          className="flex gap-1 rounded-lg border bg-muted/40 p-1"
        >
          {CLIENT_EMAIL_PREFERENCES.map((key) => {
            const meta = CLIENT_EMAIL_PREFERENCE_CONFIG[key];
            const active = key === current;
            const title =
              key === "INHERIT"
                ? orgEnabled
                  ? "Follows your account setting, which is currently on."
                  : "Follows your account setting, which is currently off."
                : meta.hint;

            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                title={title}
                disabled={isPending}
                onClick={() => change(key)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key === "INHERIT" ? "Default" : key === "ALWAYS" ? "Always" : "Never"}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          <Link
            href="/settings/client-emails"
            className="underline hover:text-foreground"
          >
            Account setting
          </Link>{" "}
          is currently {orgEnabled ? "on" : "off"}.
        </p>
      </div>
    </div>
  );
}
