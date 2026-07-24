import "server-only";

/**
 * Single source of truth for the identity that customer-facing shipment
 * emails are sent under. Kept here (not scattered through the template) so the
 * founder's name, support address and reply-to can change in one place.
 */
export const SHIPMENT_EMAIL_BRAND = {
  companyName: "Arena Cargo Logistics",
  /** Signs off every email — a real person, so it never reads as automated. */
  signerName: "Adnan Ahmad",
  signerRole: "Founder",
  teamName: "The Arena Cargo Logistics Team",
  /** From/reply-to. RESEND_FROM_EMAIL is the verified sender used elsewhere. */
  fromEmail: process.env.RESEND_FROM_EMAIL ?? "shipments@arenalogistics.co.in",
  fromName: "Arena Cargo Logistics",
  /** Shown in the footer so customers know where to reach a human. */
  supportEmail: process.env.RESEND_FROM_EMAIL ?? "shipments@arenalogistics.co.in",
} as const;

/**
 * Absolute base for links inside emails. A relative path is useless in a mail
 * client, so anything linked from an email has to be resolved against this.
 *
 * Resolution order, first hit wins:
 *   1. NEXT_PUBLIC_APP_URL, if you set it. This is the one to use for a custom
 *      domain, and the only one that needs setting by hand.
 *   2. VERCEL_PROJECT_PRODUCTION_URL, which Vercel injects on every build. This is
 *      why leaving NEXT_PUBLIC_APP_URL unset is fine on Vercel: links still point at
 *      the real deployment rather than at a guess.
 *   3. A production-host fallback, so a stray misconfigured build never mails a
 *      partner a link to localhost, which is a worse failure than a dev seeing a
 *      production link.
 *
 * Note only links that travel INSIDE an email use this. Inbox notifications store a
 * relative path and are opened through the app, so they never touch it.
 */
function resolveAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;

  return "https://app.arenalogistics.co.in";
}

export const APP_BASE_URL = resolveAppBaseUrl().replace(/\/+$/, "");

/** Turns an in-app path into a link an email client can follow. */
export function absoluteUrl(path: string): string {
  return `${APP_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** `"Arena Cargo Logistics <shipments@…>"` — the header Resend expects. */
export function shipmentFromHeader(): string {
  return `${SHIPMENT_EMAIL_BRAND.fromName} <${SHIPMENT_EMAIL_BRAND.fromEmail}>`;
}
