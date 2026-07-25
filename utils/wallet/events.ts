// A tiny client-side signal that a wallet balance has moved, so the header chip
// can pull a fresh number the instant a booking spends or a top-up lands —
// without waiting for a manual refresh or a full route re-render.
//
// Why this exists: the header chip is a server component cached with no expiry
// (see lib/wallet/queries.ts). It only re-reads when the shared header layout
// re-renders, which does NOT happen when a booking shows an inline success
// screen or when a top-up is credited asynchronously by the Razorpay webhook.
// So the chip subscribes here and re-reads the DB directly on each signal.
//
// The BroadcastChannel arm carries the signal across a single user's tabs, so
// two open tabs never disagree on the balance. It never crosses users — each
// browser is its own channel — which is exactly right for a per-org number.

const EVENT = "wallet:changed";
const CHANNEL = "wallet-balance";

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

/** Announce that the current org's wallet balance has changed. */
export function notifyWalletChanged() {
  if (typeof window === "undefined") return;
  // Same-tab listeners (BroadcastChannel does not echo to the posting context).
  window.dispatchEvent(new Event(EVENT));
  // Other tabs of the same user.
  getChannel()?.postMessage(EVENT);
}

/**
 * Emit now, then again a few times over the next several seconds. For the
 * top-up "pending" case, where the crediting webhook trails the checkout
 * callback: each emit makes the chip re-read the DB, so it catches the new
 * balance the moment the webhook settles rather than only on manual refresh.
 */
export function notifyWalletChangedSoon() {
  if (typeof window === "undefined") return;
  for (const delay of [0, 1500, 3500, 6500, 10000]) {
    setTimeout(notifyWalletChanged, delay);
  }
}

/** Subscribe to wallet-balance changes. Returns an unsubscribe function. */
export function onWalletChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const local = () => handler();
  window.addEventListener(EVENT, local);

  const ch = getChannel();
  const remote = (e: MessageEvent) => {
    if (e.data === EVENT) handler();
  };
  ch?.addEventListener("message", remote);

  return () => {
    window.removeEventListener(EVENT, local);
    ch?.removeEventListener("message", remote);
  };
}
