import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { paiseToRupees } from "@/utils/wallet/money";
import { prisma } from "@/utils/db";
 

// Needs Node's `crypto` module — do not run this on the edge runtime.
export const runtime = "nodejs";

/**
 * This endpoint is the ONLY place a wallet top-up actually gets credited.
 * Configure it in the Razorpay Dashboard → Settings → Webhooks, subscribed
 * to at least: payment.captured, payment.failed.
 *
 * Robustness properties this handler relies on:
 *  1. Signature verification on the raw body (Razorpay signs the exact
 *     bytes sent — parsing to JSON first and re-serializing would break
 *     verification if key order or whitespace differs).
 *  2. Idempotency: Razorpay retries webhooks on non-2xx responses AND can
 *     legitimately deliver the same event twice. We guard by checking
 *     WalletTransaction.status before crediting, inside the same DB
 *     transaction as the credit itself.
 *  3. Fail loud, not silent: if we can't find a matching PENDING
 *     transaction for an order, we log an error rather than dropping the
 *     event — that scenario means money moved and our DB doesn't know why,
 *     which needs manual reconciliation, not silence.
 *  4. Returns 500 on any processing failure so Razorpay retries with
 *     backoff instead of us silently losing a payment event.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[razorpay webhook] RAZORPAY_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!valid) {
    console.warn("[razorpay webhook] invalid signature — possible spoofed request");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "payment.captured":
        await handlePaymentCaptured(event);
        break;
      case "payment.failed":
        await handlePaymentFailed(event);
        break;
      case "order.paid":
        // Fires alongside payment.captured for order-linked payments.
        // payment.captured already handles crediting — no-op here to
        // avoid processing the same credit twice via two different events.
        break;
      default:
        break; // unhandled event types are fine to ack and ignore
    }
  } catch (err) {
    console.error(`[razorpay webhook] failed processing "${event?.event}"`, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handlePaymentCaptured(event: any) {
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return;

  const razorpayOrderId: string = payment.order_id;
  const razorpayPaymentId: string = payment.id;
  const amountRupees = paiseToRupees(payment.amount);

  await prisma.$transaction(async (tx) => {
    const txn = await tx.walletTransaction.findFirst({
      where: { razorpayOrderId },
      include: { wallet: true },
    });

    if (!txn) {
      console.error(
        `[razorpay webhook] no WalletTransaction row for order ${razorpayOrderId} ` +
          `(payment ${razorpayPaymentId}, ₹${amountRupees}) — payment captured but unmatched. Needs manual reconciliation.`,
      );
      return;
    }

    // Idempotency guard — webhooks WILL be delivered more than once for
    // the same event in production. Crediting twice would double the
    // balance, so once SUCCESS, this is a no-op forever.
    if (txn.status === "SUCCESS") return;

    if (Number(txn.amount) !== amountRupees) {
      console.error(
        `[razorpay webhook] amount mismatch for order ${razorpayOrderId}: ` +
          `we recorded ₹${txn.amount}, Razorpay captured ₹${amountRupees}. Crediting the captured amount.`,
      );
    }

    const rows = await tx.$queryRaw<{ balance: unknown }[]>`
      UPDATE "Wallet"
      SET balance = balance + ${amountRupees}, "updatedAt" = now()
      WHERE id = ${txn.walletId}
      RETURNING balance
    `;

    await tx.walletTransaction.update({
      where: { id: txn.id },
      data: {
        status: "SUCCESS",
        amount: amountRupees, // trust what was actually captured
        razorpayPaymentId,
        balanceAfter: rows[0].balance as any,
      },
    });
  });
}

async function handlePaymentFailed(event: any) {
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return;

  await prisma.walletTransaction.updateMany({
    where: { razorpayOrderId: payment.order_id, status: "PENDING" },
    data: {
      status: "FAILED",
      razorpayPaymentId: payment.id,
      notes: payment.error_description ? `Failed: ${payment.error_description}` : "Payment failed",
    },
  });
}