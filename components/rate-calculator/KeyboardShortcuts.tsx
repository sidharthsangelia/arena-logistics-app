"use client";

/**
 * Keyboard help for the rate calculator.
 *
 *   • KeyboardShortcuts   icon button + "?" key, opens the cheat sheet
 *   • SubmitShortcutHint  the small ⌘↵ / Ctrl↵ hint inside Get live rates
 *
 * The behaviour itself lives in RateCalculatorForm (box-grid arrows, ⌘/Ctrl
 * Enter). Both pieces here render identically on the server, so the route's
 * loading replica shows them for real.
 */

import * as React from "react";
import { Keyboard } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

const noopSubscribe = () => () => {};

/**
 * ⌘ on Apple devices, Ctrl elsewhere. The server (and first paint) assumes ⌘;
 * a Windows browser corrects it straight after hydration, inside a box wide
 * enough that the button does not change size.
 */
export function useModKeyLabel(): string {
  const isApple = React.useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => true,
  );
  return isApple ? "⌘" : "Ctrl";
}

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Cheat sheet
// ---------------------------------------------------------------------------

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function KeyboardShortcuts({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const mod = useModKeyLabel();

  // "?" opens the list, but never while the user is typing in a field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows: { keys: React.ReactNode; text: string }[] = [
    {
      keys: (
        <>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
        </>
      ),
      text: "Move between Qty, weight and L, B, H once the cursor reaches the end of the number",
    },
    {
      keys: (
        <>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
        </>
      ),
      text: "Same field in the box row above or below",
    },
    {
      keys: (
        <>
          <Kbd>{mod}</Kbd>
          <Kbd>↵</Kbd>
        </>
      ),
      text: "Get live rates, from anywhere in the form",
    },
    {
      keys: (
        <>
          <Kbd>Tab</Kbd>
        </>
      ),
      text: "Next field. Add Shift to go back",
    },
    { keys: <Kbd>?</Kbd>, text: "Show or hide this list" },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Keyboard shortcuts"
              className={cn(
                "hidden h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex",
                className,
              )}
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="text-xs">
          Keyboard shortcuts <Kbd className="ml-1 border-transparent">?</Kbd>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-3 p-4">
        <p className="text-sm font-medium text-foreground">Keyboard shortcuts</p>
        <ul className="space-y-2.5">
          {rows.map((r, i) => (
            <li key={i} className="grid grid-cols-[4.5rem_1fr] items-start gap-3 text-xs">
              <span className="flex gap-1">{r.keys}</span>
              <span className="leading-5 text-muted-foreground">{r.text}</span>
            </li>
          ))}
        </ul>
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Enter on its own does not search, so a stray key never sends a half-filled form.
        </p>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Submit hint
// ---------------------------------------------------------------------------

/** "⌘ ↵" inside the primary button. Hidden on phones, which have no such keys. */
export function SubmitShortcutHint() {
  const mod = useModKeyLabel();
  return (
    <kbd
      aria-hidden
      className="ml-3 hidden h-5 min-w-10 items-center justify-center gap-0.5 rounded border border-primary-foreground/25 px-1 font-sans text-[10px] font-medium text-primary-foreground/80 sm:inline-flex"
    >
      {mod} ↵
    </kbd>
  );
}
