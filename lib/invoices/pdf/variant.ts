/**
 * lib/invoices/pdf/variant.ts
 *
 * Which template every invoice this codebase renders is drawn in.
 *
 * ── ONE SETTING, BOTH DOCUMENTS ─────────────────────────────────────────────
 * The booking invoice and the manual invoice are separate templates because
 * they describe different things: one shipment with its boxes, against a month
 * of consignments. What they must NOT differ in is how they look. A customer
 * who receives an automatic invoice for a booking and a manual invoice for the
 * warehousing on the same cargo is holding two documents from the same company,
 * and two house styles reads as two companies.
 *
 * So the variant is read here, once, and both render paths take their default
 * from it. Not a per-invoice column: nobody wants to choose, and the failure
 * mode of letting them is exactly the inconsistency above.
 *
 * ── WHY AN ENV VAR ──────────────────────────────────────────────────────────
 * Same place the issuer's own identity is configured (see tax/config.ts), for
 * the same reason: it is a property of the company rather than of a tenant, it
 * changes about once, and it must be settable without a deploy that touches
 * data. There is no global settings table in this codebase to put it in, and
 * inventing one to hold a single enum would be the larger change.
 *
 * ── ALREADY-ISSUED INVOICES DO NOT MOVE ─────────────────────────────────────
 * Changing this does not restyle anything already issued. The PDF is rendered
 * once at issue, stored, and served back from storage on download
 * (app/api/invoices/[kind]/[id]/download/route.ts). A customer's copy and ours
 * stay byte-identical, which is the correct behaviour for a document somebody
 * is holding. Only invoices issued after the change follow it.
 */

/**
 * "grid"  the bordered, banded format freight customers are used to reading:
 *         blue section heads, ruled cells, zebra rows. The default, and what
 *         Arena issues today.
 * "arena" the restrained typographic house style: structure from whitespace,
 *         alignment and weight, with hairlines instead of borders.
 */
export type InvoiceVariant = "arena" | "grid";

const VARIANTS: readonly InvoiceVariant[] = ["arena", "grid"];

export const DEFAULT_INVOICE_VARIANT: InvoiceVariant = "grid";

/**
 * The configured variant, falling back to the default rather than throwing.
 *
 * A typo in an env var must never be the reason an invoice fails to issue: a
 * document in the wrong style is a cosmetic problem, and a booking that cannot
 * be billed is not. The value is read per call rather than captured at module
 * load so a test can set it around a render.
 */
export function invoiceVariant(): InvoiceVariant {
  const configured = process.env.INVOICE_TEMPLATE_VARIANT?.trim().toLowerCase();

  return VARIANTS.includes(configured as InvoiceVariant)
    ? (configured as InvoiceVariant)
    : DEFAULT_INVOICE_VARIANT;
}
