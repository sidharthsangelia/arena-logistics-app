"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Mail, Search, Send, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { SEVERITY_CONFIG, SEVERITY_ORDER } from "@/lib/notices/config";
import type { NoticeSeverity } from "@/lib/notices/types";
import {
  MESSAGE_TARGETS,
  MESSAGE_TARGET_CONFIG,
  type MessageTarget,
} from "@/lib/notifications/messageSchema";
import { sendArenaMessage } from "@/actions/notifications/arenaMessage.action";
import type { MessageRecipientOption } from "@/lib/notifications/arenaMessages";
import { NotificationRow } from "@/components/notifications/NotificationRow";

/**
 * COMPOSING A TARGETED MESSAGE
 * -----------------------------------------------------------------------------
 * The counterpart to the banner form on the same screen. Same severities and the
 * same live preview, because a message and a banner are two ways of saying something
 * and ops should not have to learn two tools.
 *
 * The preview is the load-bearing part of the design. This form sends something
 * irreversible to real customers, and the preview renders through the actual
 * NotificationRow component rather than an approximation, so what ops approves is
 * literally what lands in the inbox.
 *
 * Three deliberate frictions, because sending cannot be undone:
 *
 *   1. The recipient count is stated on the button itself, not tucked in a corner.
 *      "Send to 34 organisations" is a different decision from "Send".
 *   2. Emailing as well is off by default and separately confirmed in the summary
 *      line, because it reaches people outside the app.
 *   3. The form clears only after a confirmed success, so a failed send never loses
 *      what somebody wrote.
 */
export function ArenaMessageComposer({
  recipients,
}: {
  recipients: MessageRecipientOption[];
}) {
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [severity, setSeverity] = React.useState<NoticeSeverity>("INFO");
  const [target, setTarget] = React.useState<MessageTarget>("ALL");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [linkLabel, setLinkLabel] = React.useState("");
  const [linkHref, setLinkHref] = React.useState("");
  const [alsoEmail, setAlsoEmail] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const baCount = recipients.filter((r) => r.isBusinessAssociate).length;

  // Resolved here only to state the count before sending. The action resolves it
  // again server side, which is the copy that decides who is written to: an org
  // onboarded while this form was open should be included in "Everyone".
  const targeted = React.useMemo(() => {
    switch (target) {
      case "ALL":
        return recipients;
      case "BUSINESS_ASSOCIATES":
        return recipients.filter((r) => r.isBusinessAssociate);
      case "STANDARD":
        return recipients.filter((r) => !r.isBusinessAssociate);
      case "PICK":
        return recipients.filter((r) => picked.has(r.id));
    }
  }, [target, recipients, picked]);

  const withoutEmail = targeted.filter((r) => !r.email).length;

  const filteredRecipients = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return recipients;
    return recipients.filter((r) => r.label.toLowerCase().includes(needle));
  }, [recipients, search]);

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrors((prev) => ({ ...prev, orgIds: "" }));
  }

  async function handleSend() {
    setSending(true);
    setErrors({});

    const result = await sendArenaMessage({
      title,
      body,
      severity,
      target,
      orgIds: [...picked],
      linkLabel: linkLabel.trim() || null,
      linkHref: linkHref.trim() || null,
      alsoEmail,
    });

    setSending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error("Not sent", { description: result.error });
      return;
    }

    toast.success(
      `Sent to ${result.delivered} ${result.delivered === 1 ? "organisation" : "organisations"}`,
      {
        description:
          result.emailed === null
            ? "It is waiting in their notifications."
            : `In their notifications, and ${result.emailed} ${result.emailed === 1 ? "email" : "emails"} went out.`,
      },
    );

    setTitle("");
    setBody("");
    setLinkLabel("");
    setLinkHref("");
    setPicked(new Set());
    setAlsoEmail(false);
    setSeverity("INFO");
  }

  const canSend =
    title.trim().length > 0 && body.trim().length > 0 && targeted.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── Compose ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What are you telling them</CardTitle>
            <p className="text-sm text-muted-foreground">
              This lands in their notifications and stays there until they have read
              it.
            </p>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4 pt-5">
            <div className="space-y-1.5">
              <Label htmlFor="message-title">Subject</Label>
              <Input
                id="message-title"
                value={title}
                maxLength={120}
                placeholder="Air freight delays out of Delhi this week"
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrors((p) => ({ ...p, title: "" }));
                }}
                aria-invalid={Boolean(errors.title)}
              />
              {errors.title && (
                <p className="text-xs font-medium text-destructive">{errors.title}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message-body">Message</Label>
              <Textarea
                id="message-body"
                value={body}
                rows={6}
                maxLength={1000}
                placeholder="Write it the way you would say it. Leave a blank line between paragraphs."
                onChange={(e) => {
                  setBody(e.target.value);
                  setErrors((p) => ({ ...p, body: "" }));
                }}
                aria-invalid={Boolean(errors.body)}
              />
              <div className="flex justify-between">
                {errors.body ? (
                  <p className="text-xs font-medium text-destructive">{errors.body}</p>
                ) : (
                  <span />
                )}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {body.length} / 1000
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>How urgent is it</Label>
              <div className="flex flex-wrap gap-2">
                {SEVERITY_ORDER.slice()
                  .reverse()
                  .map((key) => {
                    const config = SEVERITY_CONFIG[key];
                    const Icon = config.icon;
                    const active = key === severity;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        title={config.hint}
                        onClick={() => setSeverity(key)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          active
                            ? config.banner
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        <Icon
                          className={cn("h-3.5 w-3.5", active && config.iconClass)}
                        />
                        {config.label}
                      </button>
                    );
                  })}
              </div>
              <p className="text-xs text-muted-foreground">
                {SEVERITY_CONFIG[severity].hint}
              </p>
            </div>

            <Separator />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="message-link-label">Link text (optional)</Label>
                <Input
                  id="message-link-label"
                  value={linkLabel}
                  maxLength={40}
                  placeholder="View your shipments"
                  onChange={(e) => {
                    setLinkLabel(e.target.value);
                    setErrors((p) => ({ ...p, linkLabel: "" }));
                  }}
                  aria-invalid={Boolean(errors.linkLabel)}
                />
                {errors.linkLabel && (
                  <p className="text-xs font-medium text-destructive">
                    {errors.linkLabel}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="message-link-href">Where it goes</Label>
                <Input
                  id="message-link-href"
                  value={linkHref}
                  placeholder="/shipments"
                  onChange={(e) => {
                    setLinkHref(e.target.value);
                    setErrors((p) => ({ ...p, linkHref: "" }));
                  }}
                  aria-invalid={Boolean(errors.linkHref)}
                />
                {errors.linkHref ? (
                  <p className="text-xs font-medium text-destructive">
                    {errors.linkHref}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    An in-app path, like /wallet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Who ───────────────────────────────────────────────────────── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Who hears it</CardTitle>
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {MESSAGE_TARGETS.map((key) => {
                const meta = MESSAGE_TARGET_CONFIG[key];
                const active = key === target;
                const count =
                  key === "ALL"
                    ? recipients.length
                    : key === "BUSINESS_ASSOCIATES"
                      ? baCount
                      : key === "STANDARD"
                        ? recipients.length - baCount
                        : picked.size;

                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTarget(key)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {count}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {meta.hint}
                    </span>
                  </button>
                );
              })}
            </div>

            {target === "PICK" && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find an organisation"
                    className="pl-8"
                    aria-label="Find an organisation"
                  />
                </div>

                <div className="max-h-64 space-y-px overflow-y-auto rounded-lg border p-1">
                  {filteredRecipients.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No organisation matches that.
                    </p>
                  ) : (
                    filteredRecipients.map((org) => (
                      <label
                        key={org.id}
                        htmlFor={`org-${org.id}`}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                      >
                        <Checkbox
                          id={`org-${org.id}`}
                          checked={picked.has(org.id)}
                          onCheckedChange={() => togglePicked(org.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{org.label}</span>
                          {!org.email && (
                            <span className="block text-[11px] text-amber-700">
                              No email address on file
                            </span>
                          )}
                        </span>
                        {org.isBusinessAssociate && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            BA
                          </Badge>
                        )}
                      </label>
                    ))
                  )}
                </div>

                {errors.orgIds && (
                  <p className="text-xs font-medium text-destructive">
                    {errors.orgIds}
                  </p>
                )}
              </div>
            )}

            <Separator />

            <label
              htmlFor="also-email"
              className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1"
            >
              <Checkbox
                id="also-email"
                checked={alsoEmail}
                onCheckedChange={(v) => setAlsoEmail(v === true)}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email it as well
                </span>
                <span className="block text-xs text-muted-foreground">
                  Reaches people who are not logged in. Use it when waiting for
                  somebody to open the dashboard is not good enough.
                  {alsoEmail && withoutEmail > 0 && (
                    <span className="mt-1 block text-amber-700">
                      {withoutEmail} of these {withoutEmail === 1 ? "has" : "have"} no
                      email address on file and will only get the notification.
                    </span>
                  )}
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      {/* ── Preview and send ─────────────────────────────────────────────
          Sticky, so the preview and the count stay in view while the form above
          is being filled in. */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How it will look</CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-0">
            {/* The real row component, not a mockup, so approving the preview means
                approving the thing itself. */}
            <NotificationRow
              item={{
                id: "preview",
                kind: "ARENA_MESSAGE",
                severity,
                title: title.trim() || "Your subject appears here",
                body: body.trim() || "And your message, in full, right here.",
                linkHref: null,
                createdAt: new Date().toISOString(),
                readAt: null,
              }}
              isNew
            />
          </CardContent>
        </Card>

        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm">
            {targeted.length === 0 ? (
              <span className="text-muted-foreground">
                Nobody selected yet.
              </span>
            ) : (
              <>
                Going to{" "}
                <span className="font-semibold">
                  {targeted.length}{" "}
                  {targeted.length === 1 ? "organisation" : "organisations"}
                </span>
                {alsoEmail ? ", by notification and email." : ", by notification."}
              </>
            )}
          </p>

          <Button
            className="w-full gap-2"
            disabled={!canSend || sending}
            onClick={handleSend}
          >
            {sending ? (
              "Sending…"
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send to {targeted.length}{" "}
                {targeted.length === 1 ? "organisation" : "organisations"}
              </>
            )}
          </Button>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Check className="mt-0.5 h-3 w-3 shrink-0" />
            Sending cannot be undone. Read the preview once more before you do.
          </p>
        </div>
      </div>
    </div>
  );
}
