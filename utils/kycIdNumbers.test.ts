/**
 * The numbers typed in with PAN, Aadhaar and GST uploads. See lib/kyc/idNumbers.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isStoredKycNumber,
  isValidAadhaar,
  isValidPan,
  kycNumberSpecForDocType,
  maskAadhaar,
  partyColumnsForKycNumber,
  resolveKycNumber,
} from "@/lib/kyc/idNumbers";

// Standard Verhoeff check-digit generator, independent of the validator's loop,
// so a valid Aadhaar-shaped number can be built rather than hardcoded.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];
function withCheckDigit(eleven: string): string {
  let c = 0;
  const r = eleven.split("").reverse();
  for (let i = 0; i < r.length; i++) c = D[c][P[(i + 1) % 8][Number(r[i])]];
  return eleven + INV[c];
}

const AADHAAR = withCheckDigit("23456789012");
const GSTIN = "27AAPFU0939F1ZV"; // a published, checksum-valid sample GSTIN

describe("KYC ID numbers", () => {
  it("accepts a real PAN shape and refuses the rest", () => {
    assert.equal(isValidPan("ABCPE1234F"), true);
    assert.equal(isValidPan(" abcpe1234f "), true);
    assert.equal(isValidPan("ABCXE1234F"), false, "4th letter is the holder type");
    assert.equal(isValidPan("ABCPE12345"), false);
    assert.equal(isValidPan(""), false);
  });

  it("checks the Aadhaar Verhoeff digit, so one mistyped digit fails", () => {
    assert.equal(isValidAadhaar(AADHAAR), true);
    assert.equal(isValidAadhaar(`${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`), true);
    const wrongLast = AADHAAR.slice(0, 11) + ((Number(AADHAAR[11]) + 1) % 10);
    assert.equal(isValidAadhaar(wrongLast), false);
    assert.equal(isValidAadhaar("123456789012"), false, "never starts with 1");
  });

  it("never stores a full Aadhaar", () => {
    const r = resolveKycNumber("ADHAR_CARD", AADHAAR);
    assert.ok(r.ok && r.spec);
    assert.equal(r.stored, maskAadhaar(AADHAAR));
    assert.equal(r.stored, `XXXX XXXX ${AADHAAR.slice(-4)}`);
    assert.ok(!r.stored.includes(AADHAAR.slice(0, 8)));
    assert.deepEqual(partyColumnsForKycNumber("ADHAR_CARD", r.stored), {
      aadhaarMasked: r.stored,
    });
  });

  it("asks for a number only on PAN, Company PAN, Aadhaar and GST", () => {
    for (const t of ["PAN_CARD", "COMPANY_PAN", "ADHAR_CARD", "GST_CERTIFICATE"]) {
      assert.ok(kycNumberSpecForDocType(t), t);
    }
    for (const t of ["IEC_CODE", "LUT", "OTHER"]) {
      assert.equal(kycNumberSpecForDocType(t), null, t);
      assert.deepEqual(resolveKycNumber(t, undefined), { ok: true, spec: null });
    }
  });

  it("refuses a missing or bad number on a document that needs one", () => {
    assert.equal(resolveKycNumber("PAN_CARD", "").ok, false);
    assert.equal(resolveKycNumber("GST_CERTIFICATE", "27AAPFU0939F1ZX").ok, false);
  });

  it("writes each number to the right party column", () => {
    assert.deepEqual(partyColumnsForKycNumber("PAN_CARD", "ABCPE1234F"), { panNumber: "ABCPE1234F" });
    assert.deepEqual(partyColumnsForKycNumber("GST_CERTIFICATE", GSTIN), { gstin: GSTIN });
    // The company's PAN stays on its document; panNumber is the individual's.
    assert.deepEqual(partyColumnsForKycNumber("COMPANY_PAN", "AAPFU0939F"), {});
  });

  it("recognises stored forms, and only those", () => {
    assert.equal(isStoredKycNumber("ADHAR_CARD", "XXXX XXXX 1234"), true);
    assert.equal(isStoredKycNumber("ADHAR_CARD", AADHAAR), false, "a full Aadhaar is not a stored form");
    assert.equal(isStoredKycNumber("GST_CERTIFICATE", GSTIN), true);
    assert.equal(isStoredKycNumber("PAN_CARD", "nope"), false);
  });
});

describe("client form identity numbers", async () => {
  const { clientSchema } = await import("@/lib/validations/clients.schema");
  const base = { companyName: "Acme" };

  it("are optional", () => {
    const r = clientSchema.safeParse(base);
    assert.ok(r.success);
    assert.equal(r.data.gstin, "");
    assert.equal(r.data.aadhaarNumber, "");
  });

  it("are normalised when given", () => {
    const r = clientSchema.safeParse({
      ...base,
      gstin: " 27aapfu0939f1zv ",
      panNumber: "abcpe1234f",
      aadhaarNumber: `${AADHAAR.slice(0, 4)} ${AADHAAR.slice(4, 8)} ${AADHAAR.slice(8)}`,
    });
    assert.ok(r.success);
    assert.equal(r.data.gstin, GSTIN);
    assert.equal(r.data.panNumber, "ABCPE1234F");
    assert.equal(r.data.aadhaarNumber, AADHAAR);
  });

  it("refuse a mistyped number, naming the field", () => {
    for (const [field, value] of [
      ["gstin", "27AAPFU0939F1ZX"],
      ["panNumber", "ABC1234"],
      ["aadhaarNumber", "123456789012"],
    ] as const) {
      const r = clientSchema.safeParse({ ...base, [field]: value });
      assert.equal(r.success, false, field);
      assert.deepEqual(r.error?.issues[0]?.path, [field]);
    }
  });
});

describe("company or individual client", async () => {
  const { clientSchema } = await import("@/lib/validations/clients.schema");
  const { isIndividualClient, clientCompanyName } = await import("@/lib/clients/clientKind");

  it("needs a company name only for a company, and a name only for an individual", () => {
    assert.equal(clientSchema.safeParse({ companyKind: "COMPANY" }).success, false);
    assert.equal(clientSchema.safeParse({ companyKind: "COMPANY", companyName: "Acme" }).success, true);
    assert.equal(clientSchema.safeParse({ companyKind: "INDIVIDUAL" }).success, false);
    assert.equal(clientSchema.safeParse({ companyKind: "INDIVIDUAL", contactName: "Priya" }).success, true);
  });

  it("defaults to company, so callers that only send a company name still work", () => {
    const r = clientSchema.safeParse({ companyName: "Acme" });
    assert.ok(r.success);
    assert.equal(r.data.companyKind, "COMPANY");
  });

  it("does not mistake an old company client for an individual", () => {
    // Form-created clients before 2026-09-25 are all marked INDIVIDUAL by the
    // column default, whatever they are.
    const legacy = { companyKind: "INDIVIDUAL" as const, companyName: "Acme Pvt Ltd", contactName: "Ravi" };
    assert.equal(isIndividualClient(legacy), false);
    assert.equal(clientCompanyName(legacy), "Acme Pvt Ltd");
  });

  it("gives an individual no company name to prefill", () => {
    const person = { companyKind: "INDIVIDUAL" as const, companyName: "Priya Nair", contactName: "priya nair " };
    assert.equal(isIndividualClient(person), true);
    assert.equal(clientCompanyName(person), "");
    assert.equal(isIndividualClient({ ...person, companyKind: "COMPANY" }), false);
  });
});
