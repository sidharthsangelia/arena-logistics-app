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
 * Logos live in /public and are served from the site root.
 */
export type CarrierLogo = { src: string; alt: string };

export function carrierLogo(productName: string | null | undefined): CarrierLogo {
  const name = productName ?? "";

  if (/\baramex\b/i.test(name)) return { src: "/aramex.png", alt: "Aramex" };
  if (/\bdhl\b/i.test(name)) return { src: "/dhl.png", alt: "DHL" };
  if (/fed\s?ex/i.test(name)) return { src: "/fedex.png", alt: "FedEx" };
  if (/\bUPS\b/.test(name)) return { src: "/ups.png", alt: "UPS" };

  return { src: "/arena_logo.png", alt: "Arena" };
}
