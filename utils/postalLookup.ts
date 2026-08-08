import { COUNTRIES } from "@/utils/data";

// ---------------------------------------------------------------------------
// Postal code → city/state lookup
//
// India:  api.postalpincode.in — official India Post data, free, no key.
// Others: api.zippopotam.us    — free, no key, ~60 countries.
//
// Both are best-effort. Callers should always leave city/state editable —
// a "not found" result is common and expected (new pincodes, partial typing,
// etc.), not an error state.
// ---------------------------------------------------------------------------

const ISO_BY_NAME: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.name, c.code]),
);

// ---------------------------------------------------------------------------
// Where a lookup is even possible
// ---------------------------------------------------------------------------
//
// Zippopotam covers about sixty countries and no more, and several of the
// places Arena ships to most (the UAE, Hong Kong, Ireland outside Dublin) have
// no usable postal system to look up in the first place.
//
// Without this a form cannot tell "that pincode is wrong" apart from "nobody
// offers this service for Dubai", and it shows the same discouraging "not
// found" for both. Knowing which one it is lets the UI ask for the city
// directly instead of leaving someone retyping a ZIP that was never going to
// resolve. India is on the list separately: it goes to India Post, not here.

const ZIPPOPOTAM_ISO = new Set([
  "AD", "AR", "AS", "AT", "AU", "AX", "BD", "BE", "BG", "BR", "CA", "CH",
  "CZ", "DE", "DK", "DO", "ES", "FI", "FO", "FR", "GB", "GF", "GG", "GL",
  "GP", "GT", "GU", "GY", "HR", "HU", "IM", "IS", "IT", "JE", "JP", "LI",
  "LK", "LT", "LU", "MC", "MD", "MH", "MK", "MP", "MQ", "MT", "MX", "MY",
  "NC", "NL", "NO", "NZ", "PH", "PK", "PL", "PM", "PR", "PT", "RE", "RO",
  "RU", "SE", "SI", "SJ", "SK", "SM", "TH", "TR", "US", "VA", "VI", "YT",
  "ZA",
]);

/**
 * True when a postal code typed for this country can actually resolve to a
 * city. Callers should use it to change what they ASK for, never to block:
 * a country with no lookup still needs a city, it just has to be typed.
 */
export function hasPostalLookup(countryName: string | null | undefined): boolean {
  const iso = countryName ? ISO_BY_NAME[countryName] : undefined;
  if (!iso) return false;
  return iso === "IN" || ZIPPOPOTAM_ISO.has(iso);
}

export interface PostalLookupResult {
  city: string;
  state: string;
}

async function lookupIndiaPincode(
  pincode: string,
): Promise<PostalLookupResult | null> {
  try {
    const res = await fetch(
      `https://api.postalpincode.in/pincode/${encodeURIComponent(pincode.trim())}`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const entry = Array.isArray(data) ? data[0] : null;
    const postOffice = entry?.PostOffice?.[0];

    if (!entry || entry.Status !== "Success" || !postOffice) return null;

    return {
      city: postOffice.District ?? postOffice.Name ?? "",
      state: postOffice.State ?? "",
    };
  } catch {
    return null;
  }
}

async function lookupZippopotam(
  iso: string,
  postalCode: string,
): Promise<PostalLookupResult | null> {
  try {
    const res = await fetch(
      `https://api.zippopotam.us/${iso.toLowerCase()}/${encodeURIComponent(postalCode.trim())}`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;

    return {
      city: place["place name"] ?? "",
      state: place["state"] ?? place["state abbreviation"] ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Looks up city/state for a given country name + postal code.
 * Returns null if the country isn't recognised, the code is too short,
 * or the lookup found nothing — callers should treat null as "let the
 * user fill it in manually", not as an error.
 */
export async function lookupPostalCode(
  countryName: string,
  postalCode: string,
): Promise<PostalLookupResult | null> {
  const iso = ISO_BY_NAME[countryName];
  if (!iso || postalCode.trim().length < 3) return null;

  if (iso === "IN") {
    return lookupIndiaPincode(postalCode);
  }
  return lookupZippopotam(iso, postalCode);
}