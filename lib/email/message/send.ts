import "server-only";

import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

import type { NoticeSeverity } from "@/generated/prisma";
import { SHIPMENT_EMAIL_BRAND, absoluteUrl } from "../shipment/brand";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * EMAILING A TARGETED MESSAGE
 * -----------------------------------------------------------------------------
 * The email half of a message ops composes on the notices screen. The inbox entry is
 * the record; this is what reaches somebody who has not logged in this week.
 *
 * Sent one at a time rather than as a single message with many recipients, so nobody
 * sees who else was written to. A bcc list would be one accidental cc away from
 * showing every customer every other customer's address.
 *
 * Never throws. A failed email must not roll back inbox entries that were written
 * successfully, because the inbox is the more reliable half of the delivery.
 */

export interface MessageEmailRecipient {
  orgId: string;
  label: string;
  email: string | null;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Matches the notice banner palette, so severity means the same thing in both places. */
const SEVERITY_ACCENT: Record<NoticeSeverity, string> = {
  INFO: "#0284c7",
  SUCCESS: "#059669",
  WARNING: "#d97706",
  CRITICAL: "#dc2626",
};

function renderHtml(params: {
  title: string;
  body: string;
  severity: NoticeSeverity;
  linkLabel: string | null;
  linkHref: string | null;
}): string {
  const accent = SEVERITY_ACCENT[params.severity];

  // Paragraph breaks are honoured, everything else is escaped. Ops types plain text
  // into a textarea, and treating blank lines as paragraphs is the one bit of
  // formatting they will expect.
  const paragraphs = params.body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(
      (chunk) =>
        `<p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.65;">${esc(chunk).replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");

  const cta =
    params.linkHref && params.linkLabel
      ? `<p style="margin:8px 0 0;"><a href="${esc(absoluteUrl(params.linkHref))}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;">${esc(params.linkLabel)}</a></p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <title>${esc(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <tr><td style="background:#18181b;padding:24px 40px;color:#ffffff;font-size:16px;font-weight:600;">${esc(SHIPMENT_EMAIL_BRAND.companyName)}</td></tr>

        <!-- A thin severity rule rather than a coloured block. It is a cue for
             someone who already opened the email, not a klaxon. -->
        <tr><td style="height:3px;background:${accent};line-height:3px;font-size:0;">&nbsp;</td></tr>

        <tr><td style="padding:36px 40px 8px;">
          <h1 style="margin:0 0 18px;color:#18181b;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.3px;">${esc(params.title)}</h1>
          ${paragraphs}
          ${cta}
        </td></tr>

        <tr><td style="padding:28px 40px 32px;">
          <p style="margin:0;color:#3f3f46;font-size:15px;">Warm regards,</p>
          <p style="margin:4px 0 0;color:#18181b;font-size:15px;font-weight:600;">${esc(SHIPMENT_EMAIL_BRAND.teamName)}</p>
        </td></tr>

        <tr><td style="padding:24px 40px;border-top:1px solid #e4e4e7;background:#fafafa;">
          <p style="margin:0;color:#71717a;font-size:12px;line-height:1.7;">
            This message is also waiting in your dashboard. Reply to this email and a real person will read it.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(params: {
  title: string;
  body: string;
  linkLabel: string | null;
  linkHref: string | null;
}): string {
  const lines = [params.title, "", params.body, ""];
  if (params.linkHref && params.linkLabel) {
    lines.push(`${params.linkLabel}: ${absoluteUrl(params.linkHref)}`, "");
  }
  lines.push("Warm regards,", SHIPMENT_EMAIL_BRAND.teamName, "");
  lines.push("This message is also waiting in your dashboard.");
  return lines.join("\n");
}

/** Number of emails Resend accepted. Zero on a total failure, never an exception. */
export async function sendArenaMessageEmails(params: {
  recipients: MessageEmailRecipient[];
  title: string;
  body: string;
  severity: NoticeSeverity;
  linkLabel: string | null;
  linkHref: string | null;
}): Promise<number> {
  if (!process.env.RESEND_API_KEY) {
    Sentry.addBreadcrumb({
      level: "warning",
      message: "Skipping arena message emails — RESEND_API_KEY not set",
    });
    return 0;
  }

  const html = renderHtml(params);
  const text = renderText(params);
  const from = `${SHIPMENT_EMAIL_BRAND.fromName} <${SHIPMENT_EMAIL_BRAND.fromEmail}>`;

  const deliverable = params.recipients.filter(
    (r) => r.email && EMAIL_RX.test(r.email),
  );

  // Sequential. Resend rate limits, and a message to every org firing dozens of
  // parallel requests is the shape of request that gets throttled and half lost.
  let sent = 0;

  for (const recipient of deliverable) {
    try {
      const { error } = await resend.emails.send({
        from,
        to: recipient.email!,
        subject: params.title,
        html,
        text,
        tags: [
          { name: "type", value: "arena_message" },
          { name: "orgId", value: recipient.orgId },
        ],
      });

      if (error) {
        Sentry.captureException(error, {
          tags: { location: "sendArenaMessageEmails" },
          extra: { orgId: recipient.orgId },
        });
        continue;
      }

      sent += 1;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { location: "sendArenaMessageEmails" },
        extra: { orgId: recipient.orgId },
      });
    }
  }

  return sent;
}
