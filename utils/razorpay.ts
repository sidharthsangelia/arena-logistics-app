// npm install razorpay
import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (!keyId || !keySecret) {
  // Fail loudly at boot rather than silently failing every payment call.
  throw new Error(
    "Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars. See wallet-system/README.md.",
  );
}

export const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

// Safe to expose to the client (used by Checkout.js) — this is the public key, not the secret.
export const RAZORPAY_KEY_ID = keyId;