"use server";

import { requireOrg } from "@/utils/auth-helper";
import { prisma } from "@/utils/db";
import crypto from "crypto";
 

/**
 * Called from the Checkout.js `handler` callback the instant the popup
 * reports success, so the UI can react fast. This is NOT the source of
 * truth for crediting the wallet — the money is only ever credited by the
 * server-to-server webhook at app/api/webhooks/razorpay/route.ts, because
 * a client-side success callback can be skipped, spoofed, or interrupted
 * (tab closed mid-flow, network drop) in ways a webhook cannot.
 *
 * This action verifies the signature (defense in depth / fast feedback)
 * and then polls briefly for the webhook to have already landed and
 * marked the transaction SUCCESS, since webhooks are usually near-instant
 * but can trail the checkout callback by a second or two.
 */
export async function verifyTopUpPaymentAction(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const org = await requireOrg();

  const secret = process.env.RAZORPAY_KEY_SECRET!;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  const signatureValid =
    expected.length === input.razorpaySignature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.razorpaySignature));

  if (!signatureValid) {
    console.warn(`[verifyTopUpPaymentAction] signature mismatch for order ${input.razorpayOrderId}`);
    return { success: false as const, error: "Payment signature mismatch." };
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const txn = await prisma.walletTransaction.findFirst({
      where: { razorpayOrderId: input.razorpayOrderId, wallet: { orgId: org.id } },
      include: { wallet: true },
    });

    if (txn?.status === "SUCCESS") {
      return { success: true as const, balance: txn.wallet.balance.toString() };
    }
    if (txn?.status === "FAILED") {
      return { success: false as const, error: "Payment failed." };
    }
    await new Promise((r) => setTimeout(r, 700));
  }

  // Webhook hasn't landed within our poll window — not necessarily an
  // error. Tell the caller to treat it as pending rather than failed; the
  // webhook will settle it within seconds and the balance will reflect on
  // next load / refresh.
  return {
    success: false as const,
    pending: true as const,
    error: "Payment is being confirmed — this can take a few seconds.",
  };
}