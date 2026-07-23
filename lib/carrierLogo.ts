/**
 * carrierLogo
 *
 * Maps a rate's product name to one of the big-4 carrier logos, purely as a
 * lightweight visual cue on international rate cards. When none of the four is
 * detected, falls back to the Arena logo.
 *
 * Detection rules and their order mirror carrierBranding.md §5: Aramex is
 * matched first (it is also a vendor name), and UPS is case-sensitive on
 * purpose so a lowercase "ups" inside another word never matches.
 *
 * Logos live in /public and are served from the site root. Each entry carries
 * its intrinsic pixel dimensions so `next/image` can compute the aspect ratio
 * and serve an optimised, correctly-sized asset instead of shipping the full
 * source PNG (the Arena logo alone is ~670KB) to render at 16px tall.
 */
export type CarrierLogo = { src: string; alt: string; width: number; height: number };

export function carrierLogo(productName: string | null | undefined): CarrierLogo {
  const name = productName ?? "";

  if (/\baramex\b/i.test(name))
    return { src: "/aramex.png", alt: "Aramex", width: 1413, height: 360 };
  if (/\bdhl\b/i.test(name)) return { src: "/dhl.png", alt: "DHL", width: 900, height: 295 };
  if (/fed\s?ex/i.test(name)) return { src: "/fedex.png", alt: "FedEx", width: 1198, height: 457 };
  if (/\bUPS\b/.test(name)) return { src: "/ups.png", alt: "UPS", width: 300, height: 355 };

  return { src: "/arena_logo.png", alt: "Arena", width: 1600, height: 536 };
}
