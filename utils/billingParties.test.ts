/**
 * utils/billingParties.test.ts
 *
 * The drift comparison behind the customers page.
 *
 * A billing party is a COPY of the org or client it was adopted from, taken
 * once and deliberately never refreshed on read: a tax invoice states what was
 * true when it was issued. The cost of that is drift, and this is what decides
 * whether an admin is shown a difference and offered to accept it.
 *
 * Two failures matter and neither announces itself:
 *
 *   - a FALSE difference trains people to dismiss the notice, and the real one
 *     goes with it;
 *   - a difference reported the wrong way round offers to REPLACE a good value
 *     with a blank, which is a worse invoice than the one we started with.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BILLING_PARTY_DRIFT_FIELDS,
  coerceBillingPartyFilter,
  coerceBillingPartyPageSize,
  coerceBillingPartySortField,
  driftBetween,
  partyValueDiffers,
  DEFAULT_BILLING_PARTY_PAGE_SIZE,
} from "@/lib/invoices/manual/config";

describe("partyValueDiffers", () => {
  it("ignores case and inner whitespace", () => {
    // "PVT LTD" and "Pvt  Ltd" are the same company. Offering to rewrite one
    // into the other is how a notice earns being dismissed unread.
    assert.equal(
      partyValueDiffers("Meridian Textiles PVT LTD", "Meridian Textiles Pvt  Ltd"),
      false,
    );
    assert.equal(partyValueDiffers("  Mumbai ", "Mumbai"), false);
  });

  it("treats a blank on their side as nothing to say", () => {
    // The org simply has not been given a phone number. That is not a
    // correction, and reporting it would offer to erase ours.
    assert.equal(partyValueDiffers("+91 98200 11223", null), false);
    assert.equal(partyValueDiffers("+91 98200 11223", ""), false);
    assert.equal(partyValueDiffers("+91 98200 11223", "   "), false);
  });

  it("reports a value we are missing and they have", () => {
    assert.equal(partyValueDiffers(null, "27AAECM4321K1Z9"), true);
    assert.equal(partyValueDiffers("", "Mumbai"), true);
  });

  it("reports a genuine change", () => {
    assert.equal(partyValueDiffers("Pune", "Mumbai"), true);
    assert.equal(
      partyValueDiffers("07AAECM4321K1Z9", "27AAECM4321K1Z9"),
      true,
    );
  });
});

describe("driftBetween", () => {
  const ours = {
    legalName: "Meridian Textiles Private Limited",
    gstin: "07AAECM4321K1Z9",
    email: "accounts@meridian.example",
    phone: null,
    city: "Delhi",
  };

  it("finds nothing when the records agree", () => {
    assert.deepEqual(driftBetween(ours, ours), []);
  });

  it("names the field, keeps ours on the left and theirs on the right", () => {
    const drift = driftBetween(ours, { ...ours, city: "Mumbai" });

    assert.equal(drift.length, 1);
    assert.equal(drift[0].field, "city");
    assert.equal(drift[0].label, "City");
    // The direction is the whole point: `ours` is what an invoice prints today
    // and `theirs` is what would replace it.
    assert.equal(drift[0].ours, "Delhi");
    assert.equal(drift[0].theirs, "Mumbai");
  });

  it("never offers to blank a value we hold and they do not", () => {
    const drift = driftBetween(ours, { ...ours, email: null, city: "" });
    assert.deepEqual(drift, []);
  });

  it("reports several at once, in the declared order", () => {
    const drift = driftBetween(ours, {
      ...ours,
      city: "Mumbai",
      gstin: "27AAECM4321K1Z9",
    });

    // GSTIN is declared before city, and the notice reads identity first.
    assert.deepEqual(
      drift.map((d) => d.field),
      ["gstin", "city"],
    );
  });

  it("compares exactly the fields it declares", () => {
    // A field added to the list without a label, or a label without a field,
    // would silently stop being compared. This keeps the two in step.
    const fields = BILLING_PARTY_DRIFT_FIELDS.map(([field]) => field);
    assert.equal(new Set(fields).size, fields.length);

    const everythingDifferent = Object.fromEntries(
      fields.map((field) => [field, `${field}-theirs`]),
    );
    const drift = driftBetween({}, everythingDifferent);
    assert.equal(drift.length, fields.length);
  });
});

describe("list parameter coercion", () => {
  it("falls back to a name sort rather than trusting a query string", () => {
    // The sort field reaches a Prisma orderBy. Anything unrecognised has to
    // land on a real column, not be passed through.
    assert.equal(coerceBillingPartySortField("legalName"), "legalName");
    assert.equal(coerceBillingPartySortField("billedAmount"), "legalName");
    assert.equal(coerceBillingPartySortField(undefined), "legalName");
    assert.equal(coerceBillingPartySortField("__proto__"), "legalName");
  });

  it("refuses a page size that is not on the menu", () => {
    assert.equal(coerceBillingPartyPageSize(50), 50);
    assert.equal(
      coerceBillingPartyPageSize(10_000),
      DEFAULT_BILLING_PARTY_PAGE_SIZE,
    );
    assert.equal(
      coerceBillingPartyPageSize(undefined),
      DEFAULT_BILLING_PARTY_PAGE_SIZE,
    );
  });

  it("falls back to showing everyone rather than an empty list", () => {
    assert.equal(coerceBillingPartyFilter("OWES"), "OWES");
    assert.equal(coerceBillingPartyFilter("nonsense"), "ALL");
    assert.equal(coerceBillingPartyFilter(null), "ALL");
  });
});
