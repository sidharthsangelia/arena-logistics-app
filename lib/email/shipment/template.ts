import "server-only";

import { SHIPMENT_EMAIL_BRAND } from "./brand";
import type { MilestoneCopy, ShipmentEmailContext } from "./copy";

// ── HTML escaping ──────────────────────────────────────────────────────────
// Every interpolated value (names, route, service) may contain user input, so
// escape before it reaches the markup.
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function greetingName(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "there";
  // First name only keeps it personal without feeling like a mail merge.
  return trimmed.split(/\s+/)[0];
}

// Design tokens — a restrained, monochrome palette. One dark accent for the
// header, badge and button; everything else is neutral. No gradients.
const C = {
  pageBg: "#f4f4f5",
  cardBg: "#ffffff",
  ink: "#18181b",
  body: "#3f3f46",
  muted: "#71717a",
  faint: "#a1a1aa",
  border: "#e4e4e7",
  subtleBg: "#fafafa",
} as const;

/** A single "label / value" row inside the shipment summary card. */
function summaryRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${C.border};color:${C.muted};font-size:13px;vertical-align:top;width:42%;">${esc(label)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${C.border};color:${C.ink};font-size:14px;font-weight:600;text-align:right;vertical-align:top;">${esc(value)}</td>
    </tr>`;
}

function nextStepsBlock(steps: string[]): string {
  if (steps.length === 0) return "";
  const items = steps
    .map(
      (step) => `
      <tr>
        <td style="padding:0 12px 0 0;vertical-align:top;">
          <div style="width:22px;height:22px;border-radius:11px;background:${C.ink};color:#ffffff;font-size:12px;font-weight:600;line-height:22px;text-align:center;">&bull;</div>
        </td>
        <td style="padding:0 0 14px 0;color:${C.body};font-size:14px;line-height:1.5;vertical-align:top;">${esc(step)}</td>
      </tr>`,
    )
    .join("");
  return `
    <tr>
      <td style="padding:8px 40px 0;">
        <p style="margin:0 0 14px;color:${C.ink};font-size:13px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;">What happens next</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${items}</table>
      </td>
    </tr>`;
}

function trackingBlock(ctx: ShipmentEmailContext, copy: MilestoneCopy): string {
  if (!copy.showTracking) return "";
  const hasNumber = Boolean(ctx.trackingNumber);
  const hasUrl = Boolean(ctx.trackingUrl);
  if (!hasNumber && !hasUrl) return "";

  const numberRow = hasNumber
    ? `<p style="margin:0 0 ${hasUrl ? "18px" : "0"};color:${C.muted};font-size:13px;">Tracking number<br/><span style="color:${C.ink};font-size:16px;font-weight:600;letter-spacing:0.02em;">${esc(ctx.trackingNumber!)}</span></p>`
    : "";

  const button = hasUrl
    ? `<a href="${esc(ctx.trackingUrl!)}" style="display:inline-block;background:${C.ink};color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:14px;font-weight:600;">Track your shipment</a>`
    : "";

  return `
    <tr>
      <td style="padding:8px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.subtleBg};border:1px solid ${C.border};border-radius:12px;">
          <tr><td style="padding:20px 24px;">
            ${numberRow}
            ${button}
          </td></tr>
        </table>
      </td>
    </tr>`;
}

/**
 * Renders the full HTML email for a shipment milestone. Table-based and
 * inline-styled so it survives Gmail, Outlook and Apple Mail.
 */
export function renderShipmentEmailHtml(
  copy: MilestoneCopy,
  ctx: ShipmentEmailContext,
): string {
  const brand = SHIPMENT_EMAIL_BRAND;
  const name = greetingName(ctx.senderName);

  const paragraphs = copy.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 18px;color:${C.body};font-size:15px;line-height:1.65;">${esc(p)}</p>`,
    )
    .join("");

  const summaryRows = [
    summaryRow("Shipment number", ctx.shipmentNumber),
    summaryRow("Route", `${ctx.originLabel}  →  ${ctx.destinationLabel}`),
    ctx.serviceName ? summaryRow("Service", ctx.serviceName) : "",
    summaryRow("Pieces", String(ctx.pieces)),
    ctx.weightLabel ? summaryRow("Total weight", ctx.weightLabel) : "",
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <title>${esc(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(copy.preheader)}</div>
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.pageBg};padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;background:${C.cardBg};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

          <!-- header -->
          <tr>
            <td style="background:${C.ink};padding:28px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="color:#ffffff;font-size:17px;font-weight:600;letter-spacing:-0.2px;">${esc(brand.companyName)}</td>
                  <td align="right">
                    <span style="display:inline-block;background:rgba(255,255,255,0.14);color:#ffffff;font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;letter-spacing:0.02em;">${esc(copy.statusLabel)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- greeting + headline -->
          <tr>
            <td style="padding:40px 40px 8px;">
              <p style="margin:0 0 6px;color:${C.muted};font-size:15px;">Hi ${esc(name)},</p>
              <h1 style="margin:0 0 20px;color:${C.ink};font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.4px;">${esc(copy.headline)}</h1>
              ${paragraphs}
            </td>
          </tr>

          <!-- shipment summary -->
          <tr>
            <td style="padding:8px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid ${C.border};border-radius:12px;">
                <tr><td style="padding:6px 24px 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    ${summaryRows}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          ${trackingBlock(ctx, copy)}
          ${nextStepsBlock(copy.nextSteps)}

          <!-- signature -->
          <tr>
            <td style="padding:32px 40px 8px;">
              <p style="margin:0 0 4px;color:${C.body};font-size:15px;line-height:1.6;">Warm regards,</p>
              <p style="margin:0;color:${C.ink};font-size:15px;font-weight:600;">${esc(brand.signerName)}</p>
              <p style="margin:2px 0 0;color:${C.muted};font-size:13px;">${esc(brand.signerRole)}, ${esc(brand.companyName)}</p>
              <p style="margin:14px 0 0;color:${C.muted};font-size:13px;line-height:1.6;">On behalf of ${esc(brand.teamName)}</p>
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="padding:28px 40px;border-top:1px solid ${C.border};background:${C.subtleBg};">
              <p style="margin:0;color:${C.muted};font-size:12px;line-height:1.7;">
                Questions about this shipment? Just reply to this email and our team will help you. You can also reach us at
                <a href="mailto:${esc(brand.supportEmail)}" style="color:${C.ink};text-decoration:underline;">${esc(brand.supportEmail)}</a>.
              </p>
              <p style="margin:12px 0 0;color:${C.faint};font-size:11px;">${esc(brand.companyName)} &bull; Shipment ${esc(ctx.shipmentNumber)}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text counterpart, sent alongside the HTML. A real text/plain part
 * improves deliverability and is what makes the email feel hand-written rather
 * than a template blast.
 */
export function renderShipmentEmailText(
  copy: MilestoneCopy,
  ctx: ShipmentEmailContext,
): string {
  const brand = SHIPMENT_EMAIL_BRAND;
  const name = greetingName(ctx.senderName);
  const lines: string[] = [];

  lines.push(`Hi ${name},`, "");
  lines.push(copy.headline, "");
  for (const p of copy.paragraphs) lines.push(p, "");

  lines.push("Shipment details");
  lines.push(`  Shipment number: ${ctx.shipmentNumber}`);
  lines.push(`  Route: ${ctx.originLabel} -> ${ctx.destinationLabel}`);
  if (ctx.serviceName) lines.push(`  Service: ${ctx.serviceName}`);
  lines.push(`  Pieces: ${ctx.pieces}`);
  if (ctx.weightLabel) lines.push(`  Total weight: ${ctx.weightLabel}`);
  lines.push("");

  if (copy.showTracking && ctx.trackingNumber) {
    lines.push(`Tracking number: ${ctx.trackingNumber}`);
  }
  if (copy.showTracking && ctx.trackingUrl) {
    lines.push(`Track your shipment: ${ctx.trackingUrl}`);
  }
  if (copy.showTracking && (ctx.trackingNumber || ctx.trackingUrl)) lines.push("");

  if (copy.nextSteps.length > 0) {
    lines.push("What happens next:");
    for (const step of copy.nextSteps) lines.push(`  - ${step}`);
    lines.push("");
  }

  lines.push("Warm regards,");
  lines.push(`${brand.signerName}`);
  lines.push(`${brand.signerRole}, ${brand.companyName}`);
  lines.push(`On behalf of ${brand.teamName}`);
  lines.push("");
  lines.push(
    `Questions? Reply to this email or reach us at ${brand.supportEmail}.`,
  );

  return lines.join("\n");
}
