/**
 * lib/invoices/manual/email.ts
 *
 * Sends an issued manual invoice to the customer.
 *
 * Its own small template rather than the shipment one. That template is built
 * around a milestone in a shipment's life, with a shipment summary block and a
 * tracking link, and none of that exists here: the recipient may have no
 * account, no shipment on the platform and no reason to click through to
 * anything. What they need is the PDF, the amount and when it is due.
 */

import "server-only";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

import { ManualInvoiceDocType } from "@/generated/prisma";
import { SHIPMENT_EMAIL_BRAND, shipmentFromHeader } from "@/lib/email/shipment/brand";
import { formatMoney } from "./config";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const C = {
  ink: "#111827",
  body: "#374151",
  muted: "#6b7280",
  border: "#e5e7eb",
  subtleBg: "#f9fafb",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export interface ManualInvoiceEmailInput {
  to: string;
  invoiceNumber: string;
  partyName: string;
  total: number;
  currency: string;
  dueDate: Date | null;
  docType: ManualInvoiceDocType;
  fileUrl: string;
  fileName: string;
}

/**
 * Returns true only when Resend accepted the message, so a caller can honestly
 * record that the customer was sent their invoice. Never throws: a failed send
 * is reported, not raised, because the invoice itself is already issued and
 * valid whether or not the email landed.
 */
export async function sendManualInvoiceEmail(
  input: ManualInvoiceEmailInput,
): Promise<boolean> {
  if (!EMAIL_RX.test(input.to)) return false;
  if (!process.env.RESEND_API_KEY) {
    Sentry.captureMessage("RESEND_API_KEY missing; manual invoice not emailed", {
      level: "warning",
      tags: { location: "sendManualInvoiceEmail" },
    });
    return false;
  }

  const isCreditNote = input.docType === ManualInvoiceDocType.CREDIT_NOTE;
  const noun = isCreditNote ? "credit note" : "invoice";
  const amount = formatMoney(input.total, input.currency);

  const subject = isCreditNote
    ? `Credit note ${input.invoiceNumber} from ${SHIPMENT_EMAIL_BRAND.companyName}`
    : `Invoice ${input.invoiceNumber} from ${SHIPMENT_EMAIL_BRAND.companyName}`;

  const dueLine = isCreditNote
    ? null
    : input.dueDate
      ? `Payable by ${formatDate(input.dueDate)}.`
      : "Payable on receipt.";

  try {
    const result = await resend.emails.send({
      from: shipmentFromHeader(),
      to: input.to,
      replyTo: SHIPMENT_EMAIL_BRAND.supportEmail,
      subject,
      html: renderHtml(input, { noun, amount, dueLine }),
      text: renderText(input, { noun, amount, dueLine }),
      // Resend fetches the URL itself, so a few hundred kilobytes never pass
      // through this process. Same approach as the booking confirmation.
      attachments: [{ filename: input.fileName, path: input.fileUrl }],
    });

    if (result.error) {
      Sentry.captureMessage("Resend rejected a manual invoice email", {
        level: "error",
        tags: { location: "sendManualInvoiceEmail" },
        extra: { error: result.error, invoiceNumber: input.invoiceNumber },
      });
      return false;
    }

    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { location: "sendManualInvoiceEmail" },
      extra: { invoiceNumber: input.invoiceNumber },
    });
    return false;
  }
}

interface Copy {
  noun: string;
  amount: string;
  dueLine: string | null;
}

function renderHtml(input: ManualInvoiceEmailInput, copy: Copy): string {
  const rows = [
    [copy.noun === "credit note" ? "Credit note" : "Invoice", input.invoiceNumber],
    ["Amount", copy.amount],
    ...(copy.dueLine ? [["Due", copy.dueLine.replace(/^Payable by /, "").replace(/\.$/, "")]] : []),
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 0;color:${C.muted};font-size:13px;">${esc(label)}</td>
          <td style="padding:8px 0;color:${C.ink};font-size:14px;font-weight:600;text-align:right;">${esc(value)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${C.subtleBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.subtleBg};padding:32px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid ${C.border};border-radius:12px;max-width:560px;">
            <tr>
              <td style="padding:32px 40px 0;">
                <p style="margin:0;color:${C.ink};font-size:16px;font-weight:700;">${esc(SHIPMENT_EMAIL_BRAND.companyName)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 0;">
                <p style="margin:0 0 18px;color:${C.body};font-size:15px;line-height:1.65;">Hello ${esc(input.partyName)},</p>
                <p style="margin:0 0 18px;color:${C.body};font-size:15px;line-height:1.65;">
                  Your ${esc(copy.noun)} is attached as a PDF.${copy.dueLine ? ` ${esc(copy.dueLine)}` : ""}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 40px 0;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.subtleBg};border:1px solid ${C.border};border-radius:10px;">
                  <tr><td style="padding:8px 18px;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table></td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 32px;">
                <p style="margin:0 0 18px;color:${C.body};font-size:15px;line-height:1.65;">
                  If anything on it looks wrong, reply to this email within 7 days and we will put it right.
                </p>
                <p style="margin:0;color:${C.ink};font-size:15px;font-weight:600;">${esc(SHIPMENT_EMAIL_BRAND.teamName)}</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:${C.muted};font-size:12px;">
            ${esc(SHIPMENT_EMAIL_BRAND.companyName)} &middot; ${esc(SHIPMENT_EMAIL_BRAND.supportEmail)}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(input: ManualInvoiceEmailInput, copy: Copy): string {
  return [
    `Hello ${input.partyName},`,
    "",
    `Your ${copy.noun} is attached as a PDF.${copy.dueLine ? ` ${copy.dueLine}` : ""}`,
    "",
    `${copy.noun === "credit note" ? "Credit note" : "Invoice"}: ${input.invoiceNumber}`,
    `Amount: ${copy.amount}`,
    "",
    "If anything on it looks wrong, reply to this email within 7 days and we will put it right.",
    "",
    SHIPMENT_EMAIL_BRAND.teamName,
    `${SHIPMENT_EMAIL_BRAND.companyName} - ${SHIPMENT_EMAIL_BRAND.supportEmail}`,
  ].join("\n");
}
