"use client";

import { lookupPostalCode } from "@/utils/postalLookup";
import { useEffect, useEffectEvent, useRef, useState } from "react";


export type PostalLookupState = "idle" | "loading" | "found" | "not_found";

/**
 * Debounced postal code → city/state lookup.
 *
 * Fixes a real race condition from the original implementation: if the
 * user changes the country or postal code again before an in-flight
 * lookup resolves, the stale response is now discarded instead of
 * silently overwriting newer city/state values.
 */
export function usePostalLookup(
  country: string,
  postalCode: string,
  onFound: (city: string, state: string) => void,
): PostalLookupState {
  const [state, setState] = useState<PostalLookupState>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  /**
   * `onFound` is a new function on almost every render — callers pass an inline
   * arrow — so listing it as a dependency would restart the 600ms debounce on
   * every keystroke anywhere in the form and the lookup would never fire. That
   * is why the dependency was suppressed; the cost was a stale closure, since
   * the effect kept whichever `onFound` existed when the postal code last
   * changed.
   *
   * useEffectEvent is the fix rather than a workaround: the callback is read at
   * call time, always the latest one, and it is not a reactive dependency by
   * construction — so there is nothing left to suppress.
   */
  const notifyFound = useEffectEvent((city: string, region: string) => {
    onFound(city, region);
  });

  useEffect(() => {
    if (!country || postalCode.trim().length < 3) {
      setState("idle");
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setState("loading");

    const thisRequestId = ++requestIdRef.current;

    debounceRef.current = setTimeout(async () => {
      const result = await lookupPostalCode(country, postalCode);

      // Discard if a newer request has started since this one fired —
      // prevents a slow, stale response from overwriting fresher input.
      if (thisRequestId !== requestIdRef.current) return;

      if (result) {
        notifyFound(result.city, result.state);
        setState("found");
      } else {
        setState("not_found");
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [country, postalCode]);

  return state;
}