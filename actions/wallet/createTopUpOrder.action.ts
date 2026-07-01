"use server";

import { requireOrg } from "@/utils/auth-helper";
import { prisma } from "@/utils/db";
import { razorpay, RAZORPAY_KEY_ID } from "@/utils/razorpay";
import { rupeesToPaise } from "@/utils/wallet/money";
import { getOrCreateWallet } from "@/utils/wallet/service";
 
const MIN_TOPUP_RUPEES = 100;
const MAX_TOPUP_RUPEES = 500_000; // safety ceiling — tune to your risk appetite / KYC tier

interface CreateTopUpOrderInput {
  amountRupees: number;
  /** Optional label for context, e.g. the shipment draft this top-up unblocks. Shown in Razorpay dashboard notes. */
  shipmentContext?: { shortfallFor?: string };
}

export async function createTopUpOrderAction(input: CreateTopUpOrderInput) {
  try {
    const org = await requireOrg();

    const amount = Math.round(Number(input.amountRupees) * 100) / 100;
    if (!Number.isFinite(amount) || amount < MIN_TOPUP_RUPEES) {
      return { success: false as const, error: `Minimum top-up is ₹${MIN_TOPUP_RUPEES}.` };
    }
    if (amount > MAX_TOPUP_RUPEES) {
      return {
        success: false as const,
        error: `Maximum top-up is ₹${MAX_TOPUP_RUPEES.toLocaleString("en-IN")} per transaction.`,
      };
    }

    const wallet = await getOrCreateWallet(org.id);
    const amountPaise = rupeesToPaise(amount);

    // Razorpay hard-caps `receipt` at 40 characters — org.id (a cuid) plus
    // a timestamp blows past that. This only needs to be unique-ish for
    // your own bookkeeping; the actual correlation to org/wallet lives in
    // `notes` below and in razorpayOrderId on the WalletTransaction row.
    const receipt = `tu_${Date.now().toString(36)}_${org.id.slice(-10)}`.slice(0, 40);

    // Create the Razorpay order FIRST. If this throws (network blip,
    // Razorpay outage), we haven't written a dangling row to our own DB.
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        orgId: org.id,
        walletId: wallet.id,
        purpose: "WALLET_TOPUP",
        ...(input.shipmentContext?.shortfallFor
          ? { shortfallForShipmentDraft: input.shipmentContext.shortfallFor }
          : {}),
      },
    });

    // Record a PENDING transaction now, keyed by razorpayOrderId, so the
    // webhook (the authoritative source of truth) has a row to reconcile
    // against even if the user abandons or closes the checkout popup.
    const txn = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "TOP_UP",
        status: "PENDING",
        amount,
        currency: "INR",
        razorpayOrderId: order.id,
        notes: input.shipmentContext?.shortfallFor
          ? `Top-up to cover shortfall for ${input.shipmentContext.shortfallFor}`
          : "Wallet top-up",
      },
    });

    return {
      success: true as const,
      orderId: order.id,
      amountPaise,
      currency: "INR",
      keyId: RAZORPAY_KEY_ID,
      walletTransactionId: txn.id,
      orgName: org.name,
    };
  } catch (err: any) {
    console.error("[createTopUpOrderAction]", err);

    // Razorpay's SDK throws an object shaped like
    // { statusCode, error: { code, description } } for API-level failures.
    // A 401 here means RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are invalid or
    // mismatched — this is a config problem, not something a retry fixes.
    // Surface it clearly in dev so it doesn't get mistaken for an app bug.
    if (err?.statusCode === 401) {
      const hint =
        process.env.NODE_ENV === "development"
          ? " (Razorpay rejected your API key/secret pair — check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local, confirm they're from the same mode/account, and restart the dev server after any change.)"
          : "";
      return {
        success: false as const,
        error: `Payments are temporarily unavailable. Please contact support.${hint}`,
      };
    }

    return { success: false as const, error: "Could not start payment. Please try again." };
  }
}