"use client";

/**
 * Tells the user a rate search has finished, since the cards land below the
 * form, often out of view.
 *
 *   • On Get live rates: scroll to the results area, where RateResultsLoading
 *     shows skeleton cards.
 *   • When the search ends (rates, an error, or no rates): scroll there again,
 *     unless the user scrolled away while waiting. Then, only if the results
 *     are off screen, show a toast with a View button instead of pulling the
 *     page out from under them.
 *
 * "Scrolled away" is a wheel, touch or scrolling key during the search. Our own
 * scrollIntoView fires none of those, so it never counts as the user's.
 */

import { useEffect, useRef, type RefObject } from "react";
import { toast } from "sonner";

import { useAppStore } from "@/store";

const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);

function scrollToTarget(el: HTMLElement | null) {
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function isOnScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}

export function useRateResultsCue(target: RefObject<HTMLElement | null>) {
  const loading = useAppStore((s) => s.loading);
  const wasLoading = useRef(false);
  const userScrolled = useRef(false);

  // Search started: jump to the skeletons and start watching for the user
  // taking over the scroll.
  useEffect(() => {
    if (!loading) return;
    userScrolled.current = false;
    scrollToTarget(target.current);

    const markScrolled = () => {
      userScrolled.current = true;
    };
    const onKey = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) markScrolled();
    };
    window.addEventListener("wheel", markScrolled, { passive: true });
    window.addEventListener("touchmove", markScrolled, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", markScrolled);
      window.removeEventListener("touchmove", markScrolled);
      window.removeEventListener("keydown", onKey);
    };
  }, [loading, target]);

  // Search finished.
  useEffect(() => {
    const finished = wasLoading.current && !loading;
    wasLoading.current = loading;
    if (!finished) return;

    const el = target.current;
    if (!el) return;

    if (!userScrolled.current) {
      scrollToTarget(el);
      return;
    }
    if (isOnScreen(el)) return;

    const { error, quotes } = useAppStore.getState();
    const view = { label: "View", onClick: () => scrollToTarget(target.current) };
    if (error || quotes.length === 0) {
      toast.error("No rates this time", {
        description: error ?? "See the message below the form.",
        action: view,
      });
    } else {
      toast.success("Your rates are ready", { action: view });
    }
  }, [loading, target]);
}
