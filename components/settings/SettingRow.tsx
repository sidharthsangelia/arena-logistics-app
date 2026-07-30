"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * THE SETTINGS ROW
 * -----------------------------------------------------------------------------
 * Every setting on this screen is one line: what it is, what it is set to right
 * now, and a way in. The detail lives in a dialog.
 *
 * This exists because the two screens it replaced were stacks of full cards, one
 * per setting, each carrying its own form. Read top to bottom that says nothing
 * about what you can change here — you had to parse four forms to find out. A
 * list of rows answers that in one glance, and the value on the right means you
 * can confirm a setting without opening anything.
 *
 * The rule the rows follow: the label says what it is, the value says what it is
 * set to, and neither is a sentence. Explanation belongs in the dialog, where
 * somebody has already said they want to know more.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Section — a titled group of rows
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {/* One border around the group rather than a card per setting, so a group
          of three reads as three settings and not as three screens. */}
      <div className="divide-y overflow-hidden rounded-xl border bg-background">
        {children}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row internals, shared by the clickable and static variants
// ─────────────────────────────────────────────────────────────────────────────

interface RowContentProps {
  label: string;
  /** One short line under the label. Optional: most rows do not need one. */
  hint?: React.ReactNode;
  /** The current value. A skeleton goes here while it loads, nothing else does. */
  value?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  muted?: boolean;
}

function RowContent({
  label,
  hint,
  value,
  icon: Icon,
  muted,
  interactive,
}: RowContentProps & { interactive: boolean }) {
  return (
    <>
      {Icon && (
        <Icon
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            muted ? "text-muted-foreground/60" : "text-muted-foreground",
          )}
        />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
        </p>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>

      {value !== undefined && (
        <div className="flex min-w-0 shrink-0 items-center text-sm text-muted-foreground">
          {value}
        </div>
      )}

      {interactive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover/row:translate-x-0.5" />
      )}
    </>
  );
}

const ROW_BASE =
  "flex w-full items-start gap-3 px-4 py-3.5 text-left sm:items-center";

// ─────────────────────────────────────────────────────────────────────────────
// SettingRow — opens a dialog
// ─────────────────────────────────────────────────────────────────────────────

export function SettingRow({
  label,
  hint,
  value,
  icon,
  muted,
  dialogTitle,
  dialogDescription,
  dialogClassName,
  children,
}: RowContentProps & {
  dialogTitle: string;
  /** The one place on this screen where a full explanation belongs. */
  dialogDescription?: React.ReactNode;
  dialogClassName?: string;
  /**
   * Render prop so a form inside can close the dialog once its save lands, which
   * is the only honest moment to close one.
   */
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          ROW_BASE,
          "group/row cursor-pointer transition-colors hover:bg-muted/50",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
        )}
      >
        <RowContent
          label={label}
          hint={hint}
          value={value}
          icon={icon}
          muted={muted}
          interactive
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn("gap-0 p-0 sm:max-w-lg", dialogClassName)}
        >
          {/* The header stays put and the body scrolls under it, rather than the
              dialog scrolling as a whole: that would carry the close button off
              the top of a long form. pr-12 keeps the title clear of it. */}
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle>{dialogTitle}</DialogTitle>
            {dialogDescription && (
              <DialogDescription className="text-sm">
                {dialogDescription}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="max-h-[70svh] overflow-y-auto px-5 py-5">
            {children(close)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StaticSettingRow — a row that shows something without opening anything
// ─────────────────────────────────────────────────────────────────────────────

export function StaticSettingRow({
  label,
  hint,
  value,
  icon,
  muted,
  action,
}: RowContentProps & { action?: React.ReactNode }) {
  return (
    <div className={ROW_BASE}>
      <RowContent
        label={label}
        hint={hint}
        value={value}
        icon={icon}
        muted={muted}
        interactive={false}
      />
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Value presentation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The right-hand side of a row.
 *
 * `tone` is the only colour on these screens and it always means something:
 * amber is the one state that wants the user to do something about it. A set
 * value is plain grey, because "correct" is not news.
 */
export function SettingValue({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "attention" | "set";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "max-w-56 truncate sm:max-w-72",
        tone === "attention" && "text-amber-700",
        tone === "set" && "font-medium text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Stands in for a value while it loads, and only for the value.
 *
 * The label, the hint, the icon and the chevron are the same on every account
 * and every load, so they render for real immediately. Only the part that is
 * genuinely this user's data waits.
 */
export function SettingValueSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-28", className)} />;
}
