"use client";

// Authoring form for a tenant notice.
//
// The preview is the point of this screen. It renders the real NoticeBanner from
// live form state, so ops never has to publish something to find out how it
// reads — which is what stops a CRITICAL red bar going out to every customer
// with a typo in it.

import { useMemo, useState } from "react";
import { AlertCircle, Check, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { NoticeBanner } from "@/components/notices/NoticeBanner";
import {
  AUDIENCE_CONFIG,
  DISPLAY_MODE_CONFIG,
  SEVERITY_CONFIG,
  SEVERITY_ORDER,
} from "@/lib/notices/config";
import { NOTICE_PRESETS } from "@/lib/notices/presets";
import { noticeStatus } from "@/lib/notices/visibility";
import type {
  AdminSystemNoticeDTO,
  NoticeAudience,
  NoticeDisplayMode,
  NoticeSeverity,
  SystemNoticeDTO,
} from "@/lib/notices/types";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/format";
import { saveSystemNotice } from "@/actions/notices/systemNotices.action";

const MESSAGE_MAX = 400;

interface FormState {
  title: string;
  message: string;
  severity: NoticeSeverity;
  audience: NoticeAudience;
  displayMode: NoticeDisplayMode;
  isActive: boolean;
  dismissible: boolean;
  priority: string;
  /** Kept in the browser's `datetime-local` format while editing. */
  startsAt: string;
  endsAt: string;
  linkLabel: string;
  linkHref: string;
}

const EMPTY: FormState = {
  title: "",
  message: "",
  severity: "INFO",
  audience: "ALL",
  displayMode: "ALWAYS",
  isActive: false,
  dismissible: true,
  priority: "0",
  startsAt: "",
  endsAt: "",
  linkLabel: "",
  linkHref: "",
};

// ---------------------------------------------------------------------------
// datetime-local plumbing
//
// The input speaks the admin's local wall clock with no timezone; the DB and the
// action speak ISO with an offset. Both conversions go through the browser's own
// local timezone, which for Arena ops is IST — the same zone utils/format pins
// its output to, so what is typed is what the table later reads back.
// ---------------------------------------------------------------------------

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function fromNotice(notice: AdminSystemNoticeDTO): FormState {
  return {
    title: notice.title ?? "",
    message: notice.message,
    severity: notice.severity,
    audience: notice.audience,
    displayMode: notice.displayMode,
    isActive: notice.isActive,
    dismissible: notice.dismissible,
    priority: String(notice.priority),
    startsAt: toLocalInput(notice.startsAt),
    endsAt: toLocalInput(notice.endsAt),
    linkLabel: notice.linkLabel ?? "",
    linkHref: notice.linkHref ?? "",
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Notice being edited, or null for a new one. */
  editing: AdminSystemNoticeDTO | null;
  /**
   * Changes on every open. Remounts the form body so a cancelled edit can never
   * bleed into the next one — the reset lives in useState initialisers rather
   * than an effect that fires after the sheet is already on screen.
   */
  formKey: string;
  onSaved: () => void;
}

export function SystemNoticeFormSheet({
  open,
  onOpenChange,
  editing,
  formKey,
  onSaved,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {/* Keyed, but kept mounted while the sheet animates out. */}
        <NoticeForm
          key={formKey}
          editing={editing}
          onClose={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </SheetContent>
    </Sheet>
  );
}

function NoticeForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: AdminSystemNoticeDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    editing ? fromNotice(editing) : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [presetId, setPresetId] = useState("blank");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const applyPreset = (id: string) => {
    setPresetId(id);
    const preset = NOTICE_PRESETS.find((p) => p.id === id);
    if (!preset) return;

    setForm((current) => ({
      ...current,
      title: preset.values.title ?? "",
      message: preset.values.message,
      severity: preset.values.severity,
      displayMode: preset.values.displayMode,
      dismissible: preset.values.dismissible,
      priority: String(preset.values.priority),
      linkLabel: preset.values.linkLabel ?? "",
      linkHref: preset.values.linkHref ?? "",
    }));
    setErrors({});
  };

  const scheduled = form.displayMode === "SCHEDULED";

  // The shape the preview renders and the schedule copy reads from. Built from
  // live form state so it tracks every keystroke.
  const previewNotice: SystemNoticeDTO = useMemo(
    () => ({
      id: editing?.id ?? "preview",
      title: form.title.trim() || null,
      message: form.message.trim() || "Your message will appear here.",
      severity: form.severity,
      audience: form.audience,
      displayMode: form.displayMode,
      isActive: form.isActive,
      dismissible: form.dismissible,
      priority: Number(form.priority) || 0,
      startsAt: scheduled ? fromLocalInput(form.startsAt) : null,
      endsAt: scheduled ? fromLocalInput(form.endsAt) : null,
      linkLabel: form.linkLabel.trim() || null,
      linkHref: form.linkHref.trim() || null,
      revision: editing?.revision ?? 1,
    }),
    [form, scheduled, editing],
  );

  const status = noticeStatus(previewNotice);

  // Plain-language answer to "will a tenant see this once I save?" — cheaper to
  // read than a status chip plus two timestamps.
  const statusLine = (() => {
    if (!form.isActive) {
      return "Saved but switched off. Nothing reaches tenants until you turn it on.";
    }
    if (status === "SCHEDULED") {
      return `Waiting for its window. Goes live ${formatDateTime(previewNotice.startsAt)}.`;
    }
    if (status === "EXPIRED") {
      return "Its window has already passed, so tenants will not see it. Change the dates or switch to a running notice.";
    }
    return previewNotice.endsAt
      ? `Live as soon as you save, until ${formatDateTime(previewNotice.endsAt)}.`
      : "Live as soon as you save, until you switch it off.";
  })();

  const handleSubmit = async () => {
    setSaving(true);
    setErrors({});

    try {
      const result = await saveSystemNotice({
        id: editing?.id,
        title: form.title,
        message: form.message,
        severity: form.severity,
        audience: form.audience,
        displayMode: form.displayMode,
        isActive: form.isActive,
        dismissible: form.dismissible,
        priority: Number(form.priority),
        startsAt: scheduled ? fromLocalInput(form.startsAt) : null,
        endsAt: scheduled ? fromLocalInput(form.endsAt) : null,
        linkLabel: form.linkLabel,
        linkHref: form.linkHref,
      });

      if (result.ok) {
        toast.success(editing ? "Notice updated" : "Notice created");
        onClose();
        onSaved();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) =>
    errors[key] ? (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3 shrink-0" />
        {errors[key]}
      </p>
    ) : null;

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {editing ? "Edit notice" : "New dashboard notice"}
        </SheetTitle>
        <SheetDescription>
          Shows as a banner at the top of every page on the tenant dashboard.
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 space-y-5 px-4 py-2">
        {/* ── Live preview ───────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </div>
          <div className="overflow-hidden rounded-lg border">
            <NoticeBanner
              notice={previewNotice}
              inert
              onDismiss={form.dismissible ? () => {} : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">{statusLine}</p>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        {!editing && (
          <div className="space-y-1.5">
            <Label className="text-xs">Start from</Label>
            <Select value={presetId} onValueChange={applyPreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {NOTICE_PRESETS.find((p) => p.id === presetId)?.hint}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">
            Headline{" "}
            <span className="font-normal text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Transit delays expected"
            maxLength={80}
          />
          {err("title")}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label className="text-xs">Message</Label>
            <span
              className={cn(
                "text-[11px] tabular-nums",
                form.message.length > MESSAGE_MAX
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {form.message.length}/{MESSAGE_MAX}
            </span>
          </div>
          <Textarea
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            rows={3}
            placeholder="Say what changed and what the tenant should do about it."
            className={cn(errors.message && "border-destructive")}
          />
          {err("message")}
        </div>

        {/* ── Severity and audience ──────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Importance</Label>
            <Select
              value={form.severity}
              onValueChange={(v) => set("severity", v as NoticeSeverity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_ORDER.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {SEVERITY_CONFIG[severity].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {SEVERITY_CONFIG[form.severity].hint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Who sees it</Label>
            <Select
              value={form.audience}
              onValueChange={(v) => set("audience", v as NoticeAudience)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(AUDIENCE_CONFIG) as NoticeAudience[]
                ).map((audience) => (
                  <SelectItem key={audience} value={audience}>
                    {AUDIENCE_CONFIG[audience].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {AUDIENCE_CONFIG[form.audience].hint}
            </p>
          </div>
        </div>

        {/* ── Timing ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label className="text-xs">How long it runs</Label>
          <Select
            value={form.displayMode}
            onValueChange={(v) => set("displayMode", v as NoticeDisplayMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(DISPLAY_MODE_CONFIG) as NoticeDisplayMode[]
              ).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {DISPLAY_MODE_CONFIG[mode].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {DISPLAY_MODE_CONFIG[form.displayMode].hint}
          </p>
        </div>

        {scheduled && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Starts{" "}
                <span className="font-normal text-muted-foreground">
                  (blank = now)
                </span>
              </Label>
              <Input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                className={cn(errors.startsAt && "border-destructive")}
              />
              {err("startsAt")}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Ends{" "}
                <span className="font-normal text-muted-foreground">
                  (blank = never)
                </span>
              </Label>
              <Input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                className={cn(errors.endsAt && "border-destructive")}
              />
              {err("endsAt")}
            </div>
          </div>
        )}

        {/* ── Call to action ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr]">
          <div className="space-y-1.5">
            <Label className="text-xs">
              Link text{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              value={form.linkLabel}
              onChange={(e) => set("linkLabel", e.target.value)}
              placeholder="View revised rates"
              maxLength={40}
            />
            {err("linkLabel")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link destination</Label>
            <Input
              value={form.linkHref}
              onChange={(e) => set("linkHref", e.target.value)}
              placeholder="/domestic-rates or https://..."
              className={cn(errors.linkHref && "border-destructive")}
            />
            {err("linkHref")}
          </div>
        </div>

        {/* ── Behaviour ──────────────────────────────────────────────── */}
        <div className="space-y-3 rounded-lg border p-3">
          <label className="flex items-start justify-between gap-3">
            <span className="text-sm">
              Tenants can dismiss it
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Dismissing hides it for good on that browser. Turn this off to
                pin an urgent notice open.
              </span>
            </span>
            <Switch
              checked={form.dismissible}
              onCheckedChange={(checked) => set("dismissible", checked)}
              className="mt-0.5 shrink-0"
            />
          </label>

          <div className="h-px bg-border" />

          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              className={cn("w-24", errors.priority && "border-destructive")}
            />
            <p className="text-xs text-muted-foreground">
              Breaks ties between notices of equal importance. Higher shows
              first. Importance always wins over priority.
            </p>
            {err("priority")}
          </div>

          <div className="h-px bg-border" />

          <label className="flex items-start justify-between gap-3">
            <span className="text-sm">
              Switched on
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                Leave off to save a draft and publish it later.
              </span>
            </span>
            <Switch
              checked={form.isActive}
              onCheckedChange={(checked) => set("isActive", checked)}
              className="mt-0.5 shrink-0"
            />
          </label>
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Saving
            </>
          ) : (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {editing ? "Save changes" : "Create notice"}
            </>
          )}
        </Button>
      </SheetFooter>
    </>
  );
}
