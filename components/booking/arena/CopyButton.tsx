"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Inline copy-to-clipboard control for ops. Wrap a value (AWB, shipment number,
// email, phone) so the ops team can drop it into carrier portals without
// re-typing. Renders the value with a copy affordance; shows a tick on success.
// ---------------------------------------------------------------------------

export function CopyButton({
  value,
  label,
  mono,
  className,
}: {
  value: string;
  /** What to announce in the toast, e.g. "AWB number". Defaults to "Value". */
  label?: string;
  mono?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label ?? "Value"} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Please copy manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label ?? "value"}`}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "truncate text-foreground",
          mono && "font-mono",
        )}
      >
        {value}
      </span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  );
}
