/**
 * AADHAAR VAULT
 * -----------------------------------------------------------------------------
 * The one place a full Aadhaar number is encrypted or decrypted.
 *
 * Aramex India requires an individual shipper's Aadhaar number as their tax ID
 * on every export (ShipperTaxIdVATEINNumber; confirmed by Aramex, 2026-09-25).
 * UIDAI's rules require a stored Aadhaar number to be encrypted, so the full
 * number only ever exists at rest as AES-256-GCM ciphertext under a key held in
 * the environment, never in the database.
 *
 * Rules for callers:
 *   - Screens show `aadhaarMasked`. Nothing that renders reads this module.
 *   - The ciphertext may travel (Inngest step state, UploadThing metadata): it
 *     is useless without the key. The PLAINTEXT may not. Decrypt only inside
 *     the vendor call that needs it, and never log, return or persist it.
 *
 * Key: AADHAAR_ENCRYPTION_KEY, 32 random bytes, base64. Generate with
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Rotating it makes every stored number undecryptable, so rotation means
 * re-collecting Aadhaar numbers. The version prefix is there so a future
 * rotation scheme can tell old ciphertext from new.
 */

import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { isValidAadhaar, normaliseAadhaar } from "./idNumbers";

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function key(): Buffer | null {
  const raw = process.env.AADHAAR_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("AADHAAR_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return buf;
}

/** Whether this deployment can store full Aadhaar numbers at all. */
export function aadhaarVaultConfigured(): boolean {
  return key() !== null;
}

/**
 * Encrypt a valid Aadhaar number. Returns null when no key is configured, so a
 * deployment without one still takes KYC uploads (masked only) rather than
 * refusing every customer's identity document.
 */
export function encryptAadhaar(aadhaar: string): string | null {
  const k = key();
  if (!k) return null;

  const digits = normaliseAadhaar(aadhaar);
  if (!isValidAadhaar(digits)) throw new Error("Refusing to encrypt an invalid Aadhaar number.");

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, k, iv);
  const ciphertext = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Decrypt a stored Aadhaar. Null when there is nothing to decrypt, no key, or
 * the value does not authenticate (tampered, or encrypted under another key).
 */
export function decryptAadhaar(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const k = key();
  if (!k) return null;

  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;

  try {
    const decipher = createDecipheriv(ALGORITHM, k, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const digits = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return isValidAadhaar(digits) ? digits : null;
  } catch {
    return null;
  }
}
