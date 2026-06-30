"use client";

import { lookupPostalCode } from "@/utils/postalLookup";
import { useEffect, useRef, useState } from "react";
 

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
        onFound(result.city, result.state);
        setState("found");
      } else {
        setState("not_found");
      }
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, postalCode]);

  return state;
}