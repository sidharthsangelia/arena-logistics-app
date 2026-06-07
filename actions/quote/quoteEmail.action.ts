"use server";

import { Resend } from "resend";
import { prisma } from "@/utils/db";
import { revalidatePath } from "next/cache";
import { getDbOrgId } from "@/utils/tenant";
import * as Sentry from "@sentry/nextjs";

const resend = new Resend(process.env.RESEND_API_KEY);

export type SendQuoteEmailInput = {
  quoteId:    string;
  to:         string;
  subject:    string;
  body:       string;
  pdfUrl:     string;
  markAsSent: boolean;
};

export type SendQuoteEmailResult =
  | { success: true }
  | { success: false; error: string };

export async function sendQuoteEmailAction(
  input: SendQuoteEmailInput,
): Promise<SendQuoteEmailResult> {
  const { quoteId, to, subject, body, pdfUrl, markAsSent } = input;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return { success: false, error: "Invalid email address." };
  }

  const orgId = await getDbOrgId();

  let resendEmailId: string | null = null;

  try {
    const { data, error } = await resend.emails.send({
      from:    process.env.RESEND_FROM_EMAIL ?? "quotes@yourdomain.com",
      to,
      subject,
      html:    bodyToHtml(body, pdfUrl),
      // Tag with quoteId and orgId so webhook can correlate without a DB lookup
      tags: [
        { name: "quoteId", value: quoteId },
        { name: "orgId",   value: orgId   },
      ],
    });

    if (error) {
      Sentry.captureException(error, {
        tags:  { location: "sendQuoteEmailAction" },
        extra: { quoteId, to },
      });
      return { success: false, error: error.message };
    }

    resendEmailId = data?.id ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    Sentry.captureException(err, {
      tags:  { location: "sendQuoteEmailAction" },
      extra: { quoteId, to },
    });
    return { success: false, error: message };
  }

  // Update quote: status + store the Resend email ID for webhook correlation
  if (markAsSent || resendEmailId) {
    try {
      await prisma.quote.update({
        where: { id: quoteId, orgId },
        data: {
          ...(markAsSent    ? { status: "SENT" }            : {}),
          ...(resendEmailId ? { lastResendEmailId: resendEmailId } : {}),
        },
      });

      // Record the SENT event immediately — don't wait for webhook
      if (resendEmailId) {
        await prisma.quoteEmailEvent.create({
          data: {
            orgId,
            quoteId,
            resendEmailId,
            event: "SENT",
          },
        });
      }

      revalidatePath("/quotes");
    } catch (err) {
      // Email sent successfully — don't fail the action over a DB update
      Sentry.captureException(err, {
        tags:  { location: "sendQuoteEmailAction:postSend" },
        extra: { quoteId, resendEmailId },
      });
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
    const orgId = await getDbOrgId();
 
    await prisma.quote.update({
      where: { id: quoteId, orgId },   // ← org-scoped
      data:  { status: "SENT" },
    });
 
    revalidatePath("/quotes");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update status.";
    return { success: false, error: message };
  }
}
 
export type GetQuoteClientEmailResult =
  | { success: true; email: string | null; contactName: string | null; companyName: string }
  | { success: false; error: string };
 
export async function getQuoteClientEmailAction(
  quoteId: string,
): Promise<GetQuoteClientEmailResult> {
  try {
    const orgId = await getDbOrgId();
 
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, orgId },   // ← org-scoped; findFirst not findUnique
      select: {
        client: {
          select: {
            email:       true,
            contactName: true,
            companyName: true,
          },
        },
      },
    });
 
    if (!quote) return { success: false, error: "Quote not found." };
 
    return {
      success:     true,
      email:       quote.client?.email       ?? null,
      contactName: quote.client?.contactName ?? null,
      companyName: quote.client?.companyName ?? "",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch client details.";
    return { success: false, error: message };
  }
}
 
// ── Helper ───────────────────────────────────────────────────────────────────
 
function bodyToHtml(text: string, pdfUrl: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
 
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 16px 0">${para.replace(/\n/g, "<br/>")}</p>`)
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
          <tr>
            <td style="background:#18181b;padding:28px 40px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.3px;">Arena Logistics</p>
              <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px;">Quote Document</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;color:#18181b;font-size:15px;line-height:1.7;">
              ${paragraphs}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;">
              <a href="${pdfUrl}"
                 style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:500;">
                View Quote PDF
              </a>
              <p style="margin-top:16px;font-size:12px;color:#71717a;word-break:break-all;">${pdfUrl}</p>
            </td>
          </tr>
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
 