"use client";

import {
  AlertTriangle,
  Mail,
  MailOpen,
  MailX,
  MousePointerClick,
  Send,
} from "lucide-react";

import type { EmailEvent } from "@/generated/prisma";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Where a quote's last outbound email got to. Extracted from the tables so both
 * dashboards read the same event the same way.
 */
const EMAIL_EVENT_CONFIG: Record<
  EmailEvent,
  { icon: React.ElementType; label: string; className: string; tooltip: string }
> = {
  SENT: {
    icon: Send,
    label: "Sent",
    className: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    tooltip: "Email delivered to server",
  },
  DELIVERED: {
    icon: Mail,
    label: "Delivered",
    className: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    tooltip: "Email delivered to inbox",
  },
  OPENED: {
    icon: MailOpen,
    label: "Opened",
    className:
      "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    tooltip: "Client opened the email",
  },
  CLICKED: {
    icon: MousePointerClick,
    label: "Clicked",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    tooltip: "Client clicked the PDF link",
  },
  BOUNCED: {
    icon: MailX,
    label: "Bounced",
    className: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    tooltip: "Email bounced, check the address",
  },
  COMPLAINED: {
    icon: AlertTriangle,
    label: "Complained",
    className:
      "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    tooltip: "Client marked email as spam",
  },
};

export function EmailEventBadge({ event }: { event: EmailEvent | null }) {
  if (!event) {
    return (
      <span className="text-[11px] text-muted-foreground">No event yet</span>
    );
  }

  const config = EMAIL_EVENT_CONFIG[event];
  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.className}`}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
