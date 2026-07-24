"use client";

import Link from "next/link";
import { Inbox, Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Chooses between the two ways of telling tenants something.
 *
 * Both live on this screen because they answer the same question and ops should be
 * choosing between them, not remembering which of two menu items to click. The
 * difference is worth stating on the control itself rather than in a heading nobody
 * reads twice:
 *
 *   - A BANNER is ambient and for everybody. It sits at the top of the dashboard
 *     until it is switched off, and it is dismissible unless pinned. Good for
 *     "rates change on Monday".
 *   - A MESSAGE is addressed and durable. It goes to chosen organisations, stays in
 *     their history, and can be checked for whether it was read. Good for "your
 *     shipment is affected by the port strike".
 *
 * Links rather than buttons, so each mode is a real URL that can be bookmarked and
 * shared, and so a plain middle click opens it in a new tab.
 */
export function NoticeModeSwitch({
  mode,
  basePath = "/arena-dashboard/notices",
}: {
  mode: "banner" | "inbox";
  basePath?: string;
}) {
  const options = [
    {
      key: "banner" as const,
      href: basePath,
      icon: Megaphone,
      label: "Dashboard banner",
      hint: "Everyone sees it, at the top of the app",
    },
    {
      key: "inbox" as const,
      href: `${basePath}?mode=inbox`,
      icon: Inbox,
      label: "Inbox message",
      hint: "Chosen organisations, kept in their history",
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="How to tell tenants"
      className="grid gap-2 sm:grid-cols-2"
    >
      {options.map((option) => {
        const active = option.key === mode;
        const Icon = option.icon;

        return (
          <Link
            key={option.key}
            href={option.href}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {option.label}
              </span>
              <span className="block text-xs text-muted-foreground">
                {option.hint}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
