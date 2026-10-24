/**
 * utils/aadhaarVault.server-test.ts
 *
 * The full Aadhaar number exists at rest only as ciphertext. These pin that it
 * round-trips, that it refuses anything it did not produce under this key, and
 * that a deployment without a key degrades to masked-only rather than failing.
 *
 * Run: node --conditions=react-server --import tsx --test "utils/*.server-test.ts"
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { decryptAadhaar, encryptAadhaar } from "@/lib/kyc/aadhaarVault";

// A checksum-valid Aadhaar-shaped number (Verhoeff), not a real person's.
const AADHAAR = "234567890124";

describe("aadhaar vault", () => {
  const original = process.env.AADHAAR_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.AADHAAR_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  });

  afterEach(() => {
    if (original === undefined) delete process.env.AADHAAR_ENCRYPTION_KEY;
    else process.env.AADHAAR_ENCRYPTION_KEY = original;
  });

  it("round-trips, and the ciphertext does not contain the number", () => {
    const stored = encryptAadhaar("2345 6789 0124");
    assert.ok(stored);
    assert.ok(!stored.includes(AADHAAR));
    assert.equal(decryptAadhaar(stored), AADHAAR);
  });

  it("uses a fresh IV, so the same number never encrypts the same twice", () => {
    assert.notEqual(encryptAadhaar(AADHAAR), encryptAadhaar(AADHAAR));
  });

  it("refuses tampered ciphertext", () => {
    const stored = encryptAadhaar(AADHAAR)!;
    const [v, iv, tag, ct] = stored.split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    assert.equal(decryptAadhaar([v, iv, tag, flipped.toString("base64")].join(":")), null);
    assert.equal(decryptAadhaar("not-a-ciphertext"), null);
  });

  it("refuses ciphertext made under another key", () => {
    const stored = encryptAadhaar(AADHAAR)!;
    process.env.AADHAAR_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    assert.equal(decryptAadhaar(stored), null);
  });

  it("will not encrypt an invalid number", () => {
    assert.throws(() => encryptAadhaar("234567890123"));
  });

  it("degrades to nothing, not an error, when no key is configured", () => {
    delete process.env.AADHAAR_ENCRYPTION_KEY;
    assert.equal(encryptAadhaar(AADHAAR), null);
    assert.equal(decryptAadhaar("v1:a:b:c"), null);
  });
});
