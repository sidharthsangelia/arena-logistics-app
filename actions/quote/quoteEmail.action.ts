"use server";

import { Resend } from "resend";
import { prisma } from "@/utils/db";
import { revalidateTag } from "next/cache";

const resend = new Resend(process.env.RESEND_API_KEY);

export type SendQuoteEmailInput = {
  quoteId: string;
  to: string;
  subject: string;
  body: string;
  pdfUrl: string;
  markAsSent: boolean;
};

export type SendQuoteEmailResult =
  | { success: true }
  | { success: false; error: string };

export async function sendQuoteEmailAction(
  input: SendQuoteEmailInput,
): Promise<SendQuoteEmailResult> {
  const { quoteId, to, subject, body, pdfUrl, markAsSent } = input;

  // ── Validate email ────────────────────────────────────────────────────────
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return { success: false, error: "Invalid email address." };
  }

  // ── Send via Resend ───────────────────────────────────────────────────────
  try {
    const htmlBody = bodyToHtml(body, pdfUrl);

    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "quotes@yourdomain.com",
      to,
      subject,
      html: htmlBody,
      // PDF sent as a prominent link in the body — no attachment size limits,
      // works in all email clients, and the URL is already accessible.
    });

    if (error) {
      console.error("[sendQuoteEmail] Resend error:", error);
      return { success: false, error: error.message };
    }
  } catch (err: any) {
    console.error("[sendQuoteEmail] Unexpected error:", err);
    return { success: false, error: err?.message ?? "Failed to send email." };
  }

  // ── Optionally mark quote as SENT ─────────────────────────────────────────
  if (markAsSent) {
    try {
      await prisma.quote.update({
        where: { id: quoteId },
        data: { status: "SENT" },
      });
      revalidateTag("quotes", undefined as any);
      revalidateTag("clients", undefined as any);
    } catch (err: any) {
      // Email was sent — don't fail the whole action over a status update.
      // Caller can surface this as a soft warning if needed.
      console.error("[sendQuoteEmail] Failed to mark as sent:", err);
    }
  }

  return { success: true };
}

export type MarkQuoteSentResult =
  | { success: true }
  | { success: false; error: string };

export async function markQuoteAsSentAction(
  quoteId: string,
): Promise<MarkQuoteSentResult> {
  try {
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "SENT" },
    });
    revalidateTag("quotes", undefined as any);
    revalidateTag("clients", undefined as any);
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "Failed to update status.",
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert plain-text body (with \n line breaks) into a clean HTML email. */
function bodyToHtml(text: string, pdfUrl: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p style="margin:0 0 16px 0">${para.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Quote</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header bar -->
          <tr>
            <td style="background:#18181b;padding:28px 40px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Arena Logistics</p>
              <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px;">Quote Document</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;color:#18181b;font-size:15px;line-height:1.7;">
              ${paragraphs}
            </td>
          </tr>
         <tr>
  <td style="padding:0 40px 32px;">
    <a ...>
      View Quote PDF
    </a>

    <p
      style="
        margin-top:16px;
        font-size:12px;
        color:#71717a;
        word-break:break-all;
      "
    >
      ${pdfUrl}
    </p>
  </td>
</tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f4f4f5;background:#fafafa;">
              <p style="margin:0;color:#71717a;font-size:12px;line-height:1.6;">
                This email was sent by Arena Logistics. If you have any questions, please reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Get client email by quote ID ─────────────────────────────────────────────

export type GetQuoteClientEmailResult =
  | {
      success: true;
      email: string | null;
      contactName: string | null;
      companyName: string;
    }
  | { success: false; error: string };

export async function getQuoteClientEmailAction(
  quoteId: string,
): Promise<GetQuoteClientEmailResult> {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        client: {
          select: {
            email: true,
            contactName: true,
            companyName: true,
          },
        },
      },
    });

    if (!quote) return { success: false, error: "Quote not found." };

    return {
      success: true,
      email: quote.client?.email ?? null,
      contactName: quote.client?.contactName ?? null,
      companyName: quote.client?.companyName ?? "",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? "Failed to fetch client details.",
    };
  }
}
