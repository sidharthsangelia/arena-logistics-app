/**
 * rateVariants.ts
 * -----------------------------------------------------------------------------
 * Variant presets for the shared rate-result UI (RateResultList / RateResultCard),
 * modelled on shadcn's button `variant` prop: the caller passes a single
 * `variant` and the component reads its config here instead of juggling a pile
 * of individual booleans.
 *
 * The variant name is the calculator scope ("international" | "domestic"), so
 * threading it through is just `variant={scope}`.
 *
 * Add a knob here (kept to simple flags for now) whenever the two calculators
 * need to diverge — e.g. when the domestic calculator later gets its own
 * carrier logos, flip `showCarrierLogo` on for it and point the card at the
 * domestic logo source.
 */

import type { RateScope } from "@/lib/types";

export type RateVariant = RateScope;

export interface RateVariantConfig {
  /** Render the carrier logo in the result card header. */
  showCarrierLogo: boolean;
  /**
   * White-label Shipmozo's own-brand service names as "Arena" for customers.
   * International only — domestic names are courier names we don't rebrand.
   */
  brandServiceNames: boolean;
}

export const RATE_VARIANTS: Record<RateVariant, RateVariantConfig> = {
  international: {
    showCarrierLogo: true,
    brandServiceNames: true,
  },
  domestic: {
    // No carrier logos on domestic today. When domestic logos land, flip this
    // on and wire the domestic logo source in RateResultCard.
    showCarrierLogo: false,
    brandServiceNames: false,
  },
};
