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

/** `"Arena Cargo Logistics <shipments@…>"` — the header Resend expects. */
export function shipmentFromHeader(): string {
  return `${SHIPMENT_EMAIL_BRAND.fromName} <${SHIPMENT_EMAIL_BRAND.fromEmail}>`;
}
