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