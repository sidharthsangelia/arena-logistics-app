import "server-only";

import { SHIPMENT_EMAIL_BRAND } from "./brand";

/**
 * WHO A MILESTONE EMAIL APPEARS TO BE FROM
 * -----------------------------------------------------------------------------
 * Previously the template read SHIPMENT_EMAIL_BRAND directly, which was correct
 * while every email came from Arena. Once a business associate's clients are
 * emailed under the BA's name, the identity becomes per-send, so the template
 * takes it as an argument instead of importing it.
 *
 * Doing only half of this would be worse than not doing it: a From header saying
 * "Kabir Exports" over a body signed "Arena Cargo Logistics" tells the client
 * exactly what the BA was trying not to tell them. The header, the signature and
 * the footer all move together, or none of them do.
 *
 * What is NOT here is a per-BA sending domain. Resend will only send from a
 * domain it has verified, so the envelope address stays Arena's verified sender
 * whatever the display name says. Replies are routed by Reply-To, which is
 * enough for the conversation to reach the BA. True white labelling needs a
 * verified domain per associate and is a separate piece of work.
 */

export interface EmailIdentity {
  /** Company name in the header bar and the footer. */
  displayName: string;
  /** The Resend `from` header: `"Display Name <verified@domain>"`. */
  fromHeader: string;
  /** Where a reply goes. Null means replies come back to the from address. */
  replyTo: string | null;
  /** Address printed in the footer as the way to reach a human. */
  supportEmail: string;
  /** Named signer. Null when we cannot honestly name a person. */
  signerName: string | null;
  signerRole: string | null;
  /** Signed-off-by line, e.g. "The Arena Cargo Logistics Team". */
  teamName: string;
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && EMAIL_RX.test(trimmed) ? trimmed : null;
}

/** Arena writing to its own customer. The original behaviour, unchanged. */
export function arenaIdentity(): EmailIdentity {
  const brand = SHIPMENT_EMAIL_BRAND;
  return {
    displayName: brand.companyName,
    fromHeader: `${brand.fromName} <${brand.fromEmail}>`,
    replyTo: null,
    supportEmail: brand.supportEmail,
    signerName: brand.signerName,
    signerRole: brand.signerRole,
    teamName: brand.teamName,
  };
}

export interface AssociateBranding {
  /** Trading name, preferred over the Clerk org name when the BA has set one. */
  companyName: string | null;
  name: string;
  /** Org.clientEmailReplyTo, falling back to Org.email at the call site. */
  replyTo: string | null;
}

/**
 * A BA writing to its own client. Display name and replies are theirs; the
 * envelope sender stays Arena's verified address, for the reason in the header.
 *
 * Signed by "the team" rather than by a named person: Arena's founder is not the
 * client's contact, and inventing a name for the BA would be worse.
 */
export function associateIdentity(ba: AssociateBranding): EmailIdentity {
  const brand = SHIPMENT_EMAIL_BRAND;
  const display = ba.companyName?.trim() || ba.name.trim() || brand.companyName;
  const replyTo = validEmail(ba.replyTo);

  return {
    displayName: display,
    fromHeader: `${sanitiseDisplayName(display)} <${brand.fromEmail}>`,
    replyTo,
    // Without a reply-to we would print Arena's address in a BA-branded email,
    // handing the client the very contact the BA is standing between.
    supportEmail: replyTo ?? "",
    signerName: null,
    signerRole: null,
    teamName: `The ${display} Team`,
  };
}

/**
 * Quotes and strips what would break a From header. A comma or a quote in a
 * company name turns one address into two malformed ones, and the display name
 * comes from a text field a BA typed.
 */
function sanitiseDisplayName(value: string): string {
  const cleaned = value.replace(/["\\\r\n]/g, "").trim();
  return /[,;:<>@]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}
