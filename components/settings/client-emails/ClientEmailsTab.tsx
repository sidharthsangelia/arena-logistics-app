"use client";

import * as React from "react";
import { toast } from "sonner";
import { CornerUpLeft, ListChecks, MailCheck, MailX, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  SettingRow,
  SettingValue,
  SettingsSection,
} from "@/components/settings/SettingRow";
import { ClientExceptionsPanel } from "@/components/settings/client-emails/ClientExceptionsPanel";
import {
  CLIENT_EMAIL_MILESTONES,
  MILESTONE_LABELS,
  type ClientEmailMilestone,
} from "@/lib/email/clientEmails";
import { saveClientEmailSettings } from "@/actions/settings/clientEmails.action";
import type { ClientEmailSettings } from "@/lib/email/queries";

/**
 * CLIENT EMAILS TAB
 * -----------------------------------------------------------------------------
 * The screen answers "who currently gets emailed" before it asks anything. That
 * panel at the top is the whole point: the setting is abstract in the wording and
 * concrete in the consequence, and the consequence is what people are actually
 * deciding about.
 *
 * The switch saves the moment it moves, because it is one reversible boolean and
 * the panel it sits in restates the outcome as it moves. The two forms behind it
 * keep an explicit Save, because a half-typed reply-to address is not a decision.
 */

export function ClientEmailsTab({
  settings,
  /**
   * Server-rendered and streamed in its own boundary, so the exceptions row is on
   * screen with its label and description while only the count is still loading.
   */
  exceptionsValue,
}: {
  settings: ClientEmailSettings;
  exceptionsValue: React.ReactNode;
}) {
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [milestones, setMilestones] = React.useState<ClientEmailMilestone[]>(
    settings.milestones,
  );
  const [replyTo, setReplyTo] = React.useState(settings.replyTo);
  const [togglePending, setTogglePending] = React.useState(false);

  const replyToFallback = settings.orgEmail?.trim() || null;

  // Shared by all three savers. The action takes the whole settings object, so
  // every partial edit sends the current value of the other two.
  const persist = React.useCallback(
    async (next: {
      enabled: boolean;
      milestones: ClientEmailMilestone[];
      replyTo: string | null;
    }) => saveClientEmailSettings(next),
    [],
  );

  async function toggleEnabled(nextEnabled: boolean) {
    // Switching on with nothing ticked is refused by the schema, and rightly so:
    // it would claim to be informing clients while sending nothing. Turning the
    // switch on plainly means "start telling them", so that is what we save, and
    // the toast says which updates that turned out to be.
    const nextMilestones =
      nextEnabled && milestones.length === 0
        ? [...CLIENT_EMAIL_MILESTONES]
        : milestones;

    setTogglePending(true);
    const previous = { enabled, milestones };
    setEnabled(nextEnabled);
    setMilestones(nextMilestones);

    const result = await persist({
      enabled: nextEnabled,
      milestones: nextMilestones,
      replyTo,
    });
    setTogglePending(false);

    if (!result.ok) {
      setEnabled(previous.enabled);
      setMilestones(previous.milestones);
      toast.error("Could not save", { description: result.error });
      return;
    }

    if (!nextEnabled) {
      toast.success("Client emails are off", {
        description: "Every update comes to you instead. Nothing is lost.",
      });
      return;
    }

    toast.success("Client emails are on", {
      description:
        previous.milestones.length === 0
          ? "Your clients get all five updates. Narrow that under Which updates they get."
          : "Your clients hear about the updates you chose.",
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Who gets emailed right now ─────────────────────────────────── */}
      <div
        className={cn(
          "flex flex-col gap-4 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between",
          enabled
            ? "border-emerald-200 bg-emerald-50/50"
            : "border-slate-200 bg-slate-50/60",
        )}
      >
        <div className="flex gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              enabled
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-600",
            )}
          >
            {enabled ? (
              <MailCheck className="h-4 w-4" />
            ) : (
              <MailX className="h-4 w-4" />
            )}
          </div>

          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">
              {enabled
                ? "Your clients hear about their shipments"
                : "Only you hear about your clients' shipments"}
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              {enabled ? (
                <>
                  Emails go out as{" "}
                  <span className="font-medium text-foreground">
                    {settings.orgDisplayName}
                  </span>{" "}
                  and replies come back to you. You are not copied, so open a
                  shipment here to see where it is.
                </>
              ) : (
                <>
                  Every update comes to you instead of your client. Your clients
                  never hear from us directly.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:pl-4">
          <Label
            htmlFor="client-emails-enabled"
            className="text-sm font-medium text-muted-foreground"
          >
            {enabled ? "On" : "Off"}
          </Label>
          <Switch
            id="client-emails-enabled"
            checked={enabled}
            disabled={togglePending}
            onCheckedChange={toggleEnabled}
          />
        </div>
      </div>

      {/* ── What gets sent ─────────────────────────────────────────────── */}
      <SettingsSection
        title="What gets sent"
        description={
          enabled
            ? "Applies to every client except the ones you have set differently below."
            : "Set these up now if you like. They take effect when you switch client emails on."
        }
      >
        <SettingRow
          icon={ListChecks}
          label="Which updates they get"
          hint="Anything left out comes to you instead."
          muted={!enabled}
          value={
            <SettingValue tone={enabled ? "set" : "default"}>
              {milestones.length === CLIENT_EMAIL_MILESTONES.length
                ? "All five"
                : `${milestones.length} of ${CLIENT_EMAIL_MILESTONES.length}`}
            </SettingValue>
          }
          dialogTitle="Which updates they get"
          dialogDescription="Pick the moments worth an email. Anything you leave unticked still comes to you, so you always know where a shipment is."
        >
          {(close) => (
            <MilestonesForm
              enabled={enabled}
              value={milestones}
              replyTo={replyTo}
              onSave={persist}
              onSaved={(next) => {
                setMilestones(next);
                close();
              }}
              onCancel={close}
            />
          )}
        </SettingRow>

        <SettingRow
          icon={CornerUpLeft}
          label="Where replies go"
          hint="Clients never see an Arena address."
          muted={!enabled}
          value={
            replyTo ? (
              <SettingValue tone={enabled ? "set" : "default"}>
                {replyTo}
              </SettingValue>
            ) : replyToFallback ? (
              <SettingValue>{replyToFallback}</SettingValue>
            ) : (
              <SettingValue tone="attention">No address</SettingValue>
            )
          }
          dialogTitle="Where replies go"
          dialogDescription="When a client replies to one of these emails, this is the inbox it lands in."
        >
          {(close) => (
            <ReplyToForm
              enabled={enabled}
              milestones={milestones}
              value={replyTo}
              fallback={replyToFallback}
              onSave={persist}
              onSaved={(next) => {
                setReplyTo(next);
                close();
              }}
              onCancel={close}
            />
          )}
        </SettingRow>
      </SettingsSection>

      {/* ── Per client ─────────────────────────────────────────────────── */}
      <SettingsSection
        title="Exceptions"
        description="Most clients should follow the setting above. Use this when one needs the opposite."
      >
        <SettingRow
          icon={Users}
          label="Clients set differently"
          hint="Overrides the switch above, in either direction."
          value={exceptionsValue}
          dialogTitle="Exceptions by client"
          dialogDescription="A client set to always or never is pinned there, whatever the account-wide switch says. Each change saves on its own."
          dialogClassName="sm:max-w-2xl"
        >
          {() => <ClientExceptionsPanel orgEnabled={enabled} />}
        </SettingRow>
      </SettingsSection>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestones
// ─────────────────────────────────────────────────────────────────────────────

function MilestonesForm({
  enabled,
  value,
  replyTo,
  onSave,
  onSaved,
  onCancel,
}: {
  enabled: boolean;
  value: ClientEmailMilestone[];
  replyTo: string | null;
  onSave: (next: {
    enabled: boolean;
    milestones: ClientEmailMilestone[];
    replyTo: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onSaved: (next: ClientEmailMilestone[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = React.useState<Set<ClientEmailMilestone>>(
    () => new Set(value),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (key: ClientEmailMilestone, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    setError(null);
  };

  async function handleSave() {
    const next = CLIENT_EMAIL_MILESTONES.filter((m) => selected.has(m));

    setSaving(true);
    const result = await onSave({ enabled, milestones: next, replyTo });
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Could not save. Please try again.");
      return;
    }

    toast.success("Saved");
    onSaved(next);
  }

  return (
    <div className="space-y-5">
      <div className="-mx-2 space-y-0.5">
        {CLIENT_EMAIL_MILESTONES.map((key) => {
          const meta = MILESTONE_LABELS[key];
          return (
            <label
              key={key}
              htmlFor={`milestone-${key}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
            >
              <Checkbox
                id={`milestone-${key}`}
                checked={selected.has(key)}
                onCheckedChange={(v) => toggle(key, v === true)}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-foreground">
                  {meta.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {meta.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p
        className={cn(
          "text-xs",
          error ? "font-medium text-destructive" : "text-muted-foreground",
        )}
        role={error ? "alert" : undefined}
      >
        {error ??
          (selected.size === CLIENT_EMAIL_MILESTONES.length
            ? "Your clients get the full picture."
            : `${selected.size} chosen. The rest come to you.`)}
      </p>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply-to
// ─────────────────────────────────────────────────────────────────────────────

function ReplyToForm({
  enabled,
  milestones,
  value,
  fallback,
  onSave,
  onSaved,
  onCancel,
}: {
  enabled: boolean;
  milestones: ClientEmailMilestone[];
  value: string | null;
  fallback: string | null;
  onSave: (next: {
    enabled: boolean;
    milestones: ClientEmailMilestone[];
    replyTo: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onSaved: (next: string | null) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(value ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSave() {
    const next = draft.trim() || null;

    setSaving(true);
    const result = await onSave({ enabled, milestones, replyTo: next });
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Could not save. Please try again.");
      return;
    }

    toast.success("Saved");
    onSaved(next);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="reply-to">Reply-to address</Label>
        <Input
          id="reply-to"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={draft}
          placeholder={fallback ?? "you@yourcompany.com"}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
        />
        <p
          className={cn(
            "text-xs",
            error ? "font-medium text-destructive" : "text-muted-foreground",
          )}
          role={error ? "alert" : undefined}
        >
          {error ??
            (fallback
              ? `Leave this blank to use ${fallback}.`
              : "Add an address so a client's reply reaches you.")}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
