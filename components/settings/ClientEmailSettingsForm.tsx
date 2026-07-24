"use client";

import * as React from "react";
import { toast } from "sonner";
import { Mail, MailCheck, MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import {
  CLIENT_EMAIL_MILESTONES,
  MILESTONE_LABELS,
  type ClientEmailMilestone,
} from "@/lib/email/clientEmails";
import { saveClientEmailSettings } from "@/actions/settings/clientEmails.action";
import type { ClientEmailSettings } from "@/lib/email/queries";

/**
 * The account-wide half of the client email decision.
 *
 * The design problem here is that the setting is genuinely confusing in the
 * abstract: "should we email your clients" invites the answer "email them what,
 * exactly, and what happens if I say no?". So the screen answers both before
 * asking. The panel at the top always states, in one sentence, who receives
 * updates under the current selection, and it changes as the switch moves. Nobody
 * should have to save and then book a shipment to find out what they chose.
 *
 * Form state is local and saved explicitly rather than on every keystroke. This
 * changes what lands in a customer's inbox, so a deliberate Save with a visible
 * dirty state is worth more than the convenience of autosaving.
 */
export function ClientEmailSettingsForm({
  settings,
}: {
  settings: ClientEmailSettings;
}) {
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [milestones, setMilestones] = React.useState<Set<ClientEmailMilestone>>(
    () => new Set(settings.milestones),
  );
  const [replyTo, setReplyTo] = React.useState(settings.replyTo ?? "");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Compared against the props rather than tracked with a flag, so it cannot drift
  // out of step with the fields it describes.
  const isDirty =
    enabled !== settings.enabled ||
    replyTo.trim() !== (settings.replyTo ?? "") ||
    milestones.size !== settings.milestones.length ||
    settings.milestones.some((m) => !milestones.has(m));

  const toggleMilestone = (key: ClientEmailMilestone, checked: boolean) => {
    setMilestones((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    setErrors((prev) => ({ ...prev, milestones: "" }));
  };

  const selectedCount = milestones.size;
  const replyToFallback = settings.orgEmail?.trim() || null;

  async function handleSave() {
    setSaving(true);
    setErrors({});

    const result = await saveClientEmailSettings({
      enabled,
      milestones: [...milestones],
      replyTo: replyTo.trim() || null,
    });

    setSaving(false);

    if (result.ok) {
      toast.success("Saved", {
        description: enabled
          ? "Your clients will hear about the updates you chose."
          : "Your clients will not be emailed. You still get every update.",
      });
      return;
    }

    setErrors(result.fieldErrors ?? {});
    toast.error("Could not save", { description: result.error });
  }

  return (
    <div className="space-y-6">
      {/* ── What happens right now ────────────────────────────────────────
          Deliberately the first thing on the page. The setting is abstract; a
          plain sentence about who gets email is not. */}
      <Card
        className={cn(
          "border-2 shadow-none transition-colors",
          enabled ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50/60",
        )}
      >
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600",
              )}
            >
              {enabled ? (
                <MailCheck className="h-5 w-5" />
              ) : (
                <MailX className="h-5 w-5" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {enabled
                  ? "Your clients hear about their shipments"
                  : "Only you hear about your clients' shipments"}
              </p>
              <p className="max-w-prose text-sm text-muted-foreground">
                {enabled ? (
                  <>
                    Emails go to your client, from{" "}
                    <span className="font-medium text-foreground">
                      {settings.orgDisplayName}
                    </span>
                    , and replies come back to you. You are not copied, so check a
                    shipment here if you want to see where it is.
                  </>
                ) : (
                  <>
                    Every update comes to you instead of your client. Nothing is lost,
                    and your clients never hear from us directly.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:pl-4">
            <Label htmlFor="client-emails-enabled" className="text-sm font-medium">
              {enabled ? "On" : "Off"}
            </Label>
            <Switch
              id="client-emails-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-describedby="client-emails-help"
            />
          </div>
        </CardContent>
      </Card>

      <p id="client-emails-help" className="sr-only">
        When on, shipment updates are emailed to your clients under your company
        name. When off, the same updates are emailed to you instead.
      </p>

      {/* ── Which updates ─────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Which updates they get</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pick the moments worth an email. Anything you leave unticked comes to you
            instead, so you always know where a shipment is.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="pt-5">
          <fieldset
            disabled={!enabled}
            className={cn(
              "space-y-1 transition-opacity",
              !enabled && "pointer-events-none opacity-50",
            )}
          >
            <legend className="sr-only">Shipment updates to email clients about</legend>

            {CLIENT_EMAIL_MILESTONES.map((key) => {
              const meta = MILESTONE_LABELS[key];
              const checked = milestones.has(key);

              return (
                <label
                  key={key}
                  htmlFor={`milestone-${key}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 transition-colors",
                    "hover:bg-muted/50",
                  )}
                >
                  <Checkbox
                    id={`milestone-${key}`}
                    checked={checked}
                    onCheckedChange={(value) => toggleMilestone(key, value === true)}
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
          </fieldset>

          {enabled && (
            <p
              className={cn(
                "mt-3 px-3 text-xs",
                errors.milestones
                  ? "font-medium text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {errors.milestones ||
                (selectedCount === CLIENT_EMAIL_MILESTONES.length
                  ? "Your clients get the full picture."
                  : `${selectedCount} of ${CLIENT_EMAIL_MILESTONES.length} chosen. The rest come to you.`)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Reply-to ──────────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Where replies go</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            When a client replies to one of these emails, this is the inbox it lands
            in. They never see an Arena address.
          </p>
        </CardHeader>
        <Separator />
        <CardContent className="space-y-2 pt-5">
          <Label htmlFor="reply-to">Reply-to address</Label>
          <Input
            id="reply-to"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={replyTo}
            placeholder={replyToFallback ?? "you@yourcompany.com"}
            onChange={(e) => {
              setReplyTo(e.target.value);
              setErrors((prev) => ({ ...prev, replyTo: "" }));
            }}
            aria-invalid={Boolean(errors.replyTo)}
            className="max-w-md"
          />
          {errors.replyTo ? (
            <p className="text-xs font-medium text-destructive">{errors.replyTo}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {replyToFallback
                ? `Leave this blank to use ${replyToFallback}.`
                : "Add an address so a client's reply reaches you."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sticky so the Save button is reachable without scrolling back up after
          working through the checkboxes. Only rendered when there is something to
          save, so it never sits there as furniture. */}
      {isDirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm text-muted-foreground">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setEnabled(settings.enabled);
                setMilestones(new Set(settings.milestones));
                setReplyTo(settings.replyTo ?? "");
                setErrors({});
              }}
            >
              Discard
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
