"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * "Something new in What's new" for this browser.
 *
 * A per-viewer convenience, so browser storage is the right home: no table, no
 * request. Storage can be missing or throw (private windows, blocked site
 * data); every access is guarded and the worst case is a dot that shows until
 * the page is visited, never a broken page.
 *
 * Read through useSyncExternalStore with a null server snapshot, so the server
 * render and the first client render agree (no dot) and there is no hydration
 * mismatch. The dot is absolutely positioned by its callers, so it appearing
 * after hydration never moves anything.
 */

const STORAGE_KEY = "arena-help-last-seen";
const EVENT = "arena-help-seen";

function readSeen(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True when `latest` is newer than what this browser last saw. */
export function useHelpUnread(latest: string | null | undefined): boolean {
  const seen = useSyncExternalStore(subscribe, readSeen, () => "server");
  if (!latest || seen === "server") return false;
  // Versions are "YYYY.MM.DD", so string order is date order.
  return seen === null || seen < latest;
}

/** Rendered on the What's new page: marks the newest release as seen. */
export function MarkHelpSeen({ version }: { version: string }) {
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen || seen < version) window.localStorage.setItem(STORAGE_KEY, version);
    } catch {
      // Storage unavailable: the dot simply stays, nothing else depends on it.
    }
    window.dispatchEvent(new Event(EVENT));
  }, [version]);
  return null;
}
