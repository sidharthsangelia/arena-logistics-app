import { z } from "zod";

/**
 * Validation for the money mutations on the arena wallets screen.
 *
 * Lives outside the `"use server"` action files so the forms can import both the
 * schema and the inferred types. A `"use server"` module may only export async
 * functions, so a type exported from one is a build error.
 *
 * These schemas are the real guard, not a convenience for the form. Every action
 * re-parses its input, because a server action is a public endpoint and the only
 * thing standing between it and a hand-rolled POST is this parse plus the role
 * check in utils/arena-auth.ts.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * Upper bound on any single hand-entered amount. Not a business limit, a
 * fat-finger guard: an extra zero on a five-figure correction is the realistic
 * mistake, and it is far easier to raise this constant than to unpick a wrong
 * credit that has already been spent.
 */
export const MAX_MANUAL_AMOUNT = 10_000_000;

const amount = z
  .number({ error: "Enter an amount" })
  .finite("Enter a valid amount")
  .positive("Amount must be more than zero")
  .max(MAX_MANUAL_AMOUNT, `Amount cannot be more than ${MAX_MANUAL_AMOUNT.toLocaleString("en-IN")}`)
  // Money is stored to 4 decimal places, but nobody hand-enters fractions of a
  // paisa. Rounding here keeps what was typed and what was saved identical.
  .transform((value) => Math.round(value * 100) / 100);

const reason = z
  .string()
  .trim()
  .min(5, "Give a reason of at least a few words, so this makes sense later")
  .max(500, "Keep the reason under 500 characters");

const optionalShortText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null));

/**
 * A moment that has already happened. Money cannot be received in the future,
 * and a date typed years back is almost always a typo in the year.
 */
const pastTimestamp = z
  .iso
  .datetime({ offset: true, error: "Enter a valid date and time" })
  .refine((value) => Date.parse(value) <= Date.now() + 60_000, {
    error: "That is in the future. Pick when the money was actually received.",
  })
  .refine((value) => Date.parse(value) > Date.now() - 3 * 365 * 24 * 60 * 60 * 1000, {
    error: "That is more than three years ago. Check the year.",
  });

// ---------------------------------------------------------------------------
// Manual wallet adjustment
// ---------------------------------------------------------------------------

export const walletAdjustmentSchema = z.object({
  orgId: z.string().min(1, "Pick an organisation"),
  direction: z.enum(["credit", "debit"], { error: "Choose whether to add or remove money" }),
  amount,
  reason,
  /** Bank UTR, cheque number, UPI reference. Optional but strongly encouraged. */
  reference: optionalShortText(120, "Keep the reference under 120 characters"),
});

export type WalletAdjustmentInput = z.infer<typeof walletAdjustmentSchema>;

export type WalletAdjustmentResult =
  | {
      ok: true;
      /** Balance after the adjustment, as a decimal string. */
      balance: string;
      currency: string;
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Recording a deferred payment
// ---------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "CHEQUE",
  "CARD",
  "OTHER",
] as const;

export const recordCollectionSchema = z.object({
  shipmentId: z.string().min(1, "Missing shipment"),
  amount,
  method: z.enum(PAYMENT_METHODS, { error: "Choose how the money was paid" }),
  reference: optionalShortText(120, "Keep the reference under 120 characters"),
  note: optionalShortText(500, "Keep the note under 500 characters"),
  collectedAt: pastTimestamp,
});

export type RecordCollectionInput = z.infer<typeof recordCollectionSchema>;

export const reverseCollectionSchema = z.object({
  collectionId: z.string().min(1, "Missing payment"),
  reason,
});

export type ReverseCollectionInput = z.infer<typeof reverseCollectionSchema>;

export const writeOffCollectionSchema = z.object({
  shipmentId: z.string().min(1, "Missing shipment"),
  reason,
});

export type WriteOffCollectionInput = z.infer<typeof writeOffCollectionSchema>;

/** Shared shape for the collection mutations. */
export type CollectionMutationResult =
  | { ok: true; message: string }
  | { ok: false; error: string };
