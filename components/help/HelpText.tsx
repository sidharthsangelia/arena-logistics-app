import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG } from "@/utils/statusConfigColors";
import { cn } from "@/lib/utils";

/**
 * Renders the help inline syntax (documented in lib/help/types.ts).
 *
 * No hooks and no "use client", so it renders on the server for the article
 * pages and in the browser inside the "?" sheet without a second copy.
 */

export interface HelpLinkContext {
  /** "" for the tenant app, "/arena-dashboard" for the ops console. */
  base: string;
  /**
   * False when an Arena viewer reads a customer article: its "app:" links
   * point at customer screens staff cannot open, so they render as text.
   */
  appLinks: boolean;
  /** Called when a link is followed, so the "?" sheet can close itself. */
  onNavigate?: () => void;
}

const STATUS_BY_LABEL = new Map(
  Object.values(STATUS_CONFIG).map((c) => [c.label.toLowerCase(), c]),
);

const TOKEN =
  /(\*\*[^*]+\*\*|`[^`]+`|\[\[(?:button|badge|key):[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;

export function resolveHelpHref(href: string, ctx: HelpLinkContext): string | null {
  if (href.startsWith("help:")) return `${ctx.base}/help/${href.slice(5)}`;
  if (href.startsWith("app:")) {
    if (!ctx.appLinks) return null;
    const path = href.slice(4);
    return path === "/" ? ctx.base || "/" : `${ctx.base}${path}`;
  }
  return href;
}

export function HelpText({ text, ctx }: { text: string; ctx: HelpLinkContext }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{renderToken(part, ctx)}</Fragment>
      ))}
    </>
  );
}

function renderToken(part: string, ctx: HelpLinkContext): ReactNode {
  if (!part) return null;

  if (part.startsWith("**") && part.endsWith("**")) {
    return <strong className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
  }

  if (part.startsWith("`") && part.endsWith("`")) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
        {part.slice(1, -1)}
      </code>
    );
  }

  const ui = /^\[\[(button|badge|key):([^\]]+)\]\]$/.exec(part);
  if (ui) {
    const [, kind, label] = ui;
    if (kind === "button") {
      return (
        <span className="mx-0.5 inline-flex h-6 items-center rounded-md border bg-background px-2 align-middle text-xs font-medium text-foreground shadow-xs">
          {label}
        </span>
      );
    }
    if (kind === "key") {
      return (
        <kbd className="mx-0.5 inline-flex h-5 items-center rounded border bg-muted px-1.5 align-middle font-mono text-[11px] font-medium text-foreground">
          {label}
        </kbd>
      );
    }
    const status = STATUS_BY_LABEL.get(label.toLowerCase());
    return (
      <Badge
        variant="outline"
        className={cn("mx-0.5 align-middle text-[11px]", status?.className)}
      >
        {label}
      </Badge>
    );
  }

  const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
  if (link) {
    const [, label, href] = link;
    const resolved = resolveHelpHref(href, ctx);
    if (!resolved) return <span className="font-medium text-foreground">{label}</span>;
    const external = /^https?:\/\//.test(resolved);
    return (
      <Link
        href={resolved}
        onClick={ctx.onNavigate}
        className="font-medium text-primary underline underline-offset-4 hover:no-underline"
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {label}
      </Link>
    );
  }

  return part;
}
