/**
 * utils/domesticEwayBill.test.ts
 *
 * The e-way bill NUMBER, which is a different thing from the e-way bill file.
 *
 * The upload slot puts the PDF on the shipment so the parcel travels with its
 * paperwork. This is the number off that document, and it exists because
 * SpeedoPost takes `ewaybill` as a FIELD on the order and refuses a consignment
 * over Rs 50,000 without it. A file in our storage is no use to them.
 *
 * Why it gets its own tests: it is asked for CONDITIONALLY, on a threshold
 * derived from the boxes, and it gates a payment. Get the condition wrong in
 * one direction and a customer under the threshold is blocked from booking by a
 * question that does not apply to them. Get it wrong in the other and a
 * customer over it pays for a shipment the courier will refuse, with the money
 * held and ops placing it by hand.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EWAY_BILL_NUMBER_DIGITS,
  EWAY_BILL_THRESHOLD,
  isValidEwayBillNumber,
  needsEwayBillNumber,
  normaliseEwayBillNumber,
} from "@/lib/booking/domesticDocs";
import type { BookingFormData, CargoBox } from "@/types/booking.types";

// ---------------------------------------------------------------------------

/** One box worth exactly `value`, so a test can sit either side of the line. */
function boxesWorth(value: number): CargoBox[] {
  return [
    {
      id: "box-1",
      quantity: 1,
      weightKg: 2,
      lengthCm: 20,
      widthCm: 20,
      heightCm: 20,
      contents: [
        { description: "Goods", quantity: 1, unitValue: value, hsCode: "6109" },
      ],
    } as unknown as CargoBox,
  ];
}

type Subject = Pick<
  BookingFormData,
  "consignor" | "consignee" | "boxes" | "eWayBillNumber"
>;

function subject(value: number, eWayBillNumber?: string): Subject {
  return {
    consignor: {} as never,
    consignee: {} as never,
    boxes: boxesWorth(value),
    eWayBillNumber,
  };
}

// ---------------------------------------------------------------------------

describe("normaliseEwayBillNumber", () => {
  it("reads a number the way a customer pastes it", () => {
    // Off a printed challan it arrives grouped. Telling somebody the number
    // they typed correctly is wrong is a support ticket, not a validation.
    assert.equal(normaliseEwayBillNumber("1234 5678 9012"), "123456789012");
    assert.equal(normaliseEwayBillNumber("1234-5678-9012"), "123456789012");
    assert.equal(normaliseEwayBillNumber("  123456789012  "), "123456789012");
  });

  it("treats nothing as nothing", () => {
    assert.equal(normaliseEwayBillNumber(null), "");
    assert.equal(normaliseEwayBillNumber(undefined), "");
    assert.equal(normaliseEwayBillNumber(""), "");
  });
});

describe("isValidEwayBillNumber", () => {
  it("accepts exactly the length the GST portal issues", () => {
    assert.equal(isValidEwayBillNumber("123456789012"), true);
    assert.equal(isValidEwayBillNumber("1234 5678 9012"), true);
  });

  it("rejects a number that is short, long, or not a number at all", () => {
    assert.equal(isValidEwayBillNumber("12345678901"), false);
    assert.equal(isValidEwayBillNumber("1234567890123"), false);
    assert.equal(isValidEwayBillNumber("not a number"), false);
    assert.equal(isValidEwayBillNumber(""), false);
  });

  it("agrees with the digit count it publishes", () => {
    assert.equal(
      isValidEwayBillNumber("9".repeat(EWAY_BILL_NUMBER_DIGITS)),
      true,
    );
  });
});

describe("needsEwayBillNumber", () => {
  it("does not ask below the threshold", () => {
    // Asking an individual posting a Rs 3,000 parcel for an e-way bill number
    // blocks a booking on a document they have no reason to hold.
    assert.equal(needsEwayBillNumber(subject(3_000)), false);
    assert.equal(needsEwayBillNumber(subject(49_999)), false);
  });

  it("does not ask AT the threshold, because the rule is 'exceeding'", () => {
    assert.equal(needsEwayBillNumber(subject(EWAY_BILL_THRESHOLD)), false);
  });

  it("asks the moment the declared value passes it", () => {
    assert.equal(needsEwayBillNumber(subject(EWAY_BILL_THRESHOLD + 1)), true);
    assert.equal(needsEwayBillNumber(subject(120_000)), true);
  });

  it("is satisfied by a valid number and not by a plausible one", () => {
    assert.equal(needsEwayBillNumber(subject(80_000, "123456789012")), false);
    assert.equal(needsEwayBillNumber(subject(80_000, "1234 5678 9012")), false);
    // Short by one digit. This is the case that must not slip through: the
    // courier refuses it and the customer has already paid.
    assert.equal(needsEwayBillNumber(subject(80_000, "12345678901")), true);
    assert.equal(needsEwayBillNumber(subject(80_000, "")), true);
  });

  it("ignores a number entered below the threshold", () => {
    // Nothing is owed, so nothing is outstanding, whatever is in the field.
    assert.equal(needsEwayBillNumber(subject(1_000, "nonsense")), false);
  });
});
