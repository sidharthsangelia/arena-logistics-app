/**
 * The manual invoice money engine's invariants.
 *
 *   npm test
 *
 * Two halves. The first checks specific arithmetic anyone could reason about by
 * hand, so a failure names what broke. The second throws thousands of generated
 * invoices at it, because the failures that matter here are the ones nobody
 * would think to write a case for: a rounding residual that only appears at one
 * rate on one amount, a reimbursement folded into a taxable line, a discount
 * larger than the charge it applies to.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { TaxMode } from "../generated/prisma";
import {
  buildManualInvoiceMoney,
  toMinor,
  verifyManualInvoiceMoney,
  type ManualChargeInput,
} from "../lib/invoices/manual/money";

const HARYANA = "06";
const DELHI = "07";

function charge(over: Partial<ManualChargeInput> = {}): ManualChargeInput {
  return {
    label: "Freight charges",
    sacCode: "996812",
    rate: 0,
    quantity: 1,
    amount: 1000,
    discount: 0,
    ratePercent: 18,
    reimbursement: false,
    ...over,
  };
}

function build(
  lines: ManualChargeInput[],
  opts: Partial<Parameters<typeof buildManualInvoiceMoney>[0]> = {},
) {
  return buildManualInvoiceMoney({
    lines,
    taxMode: TaxMode.EXCLUSIVE,
    sellerStateCode: HARYANA,
    placeOfSupplyCode: DELHI,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Arithmetic anyone can check by hand
// ---------------------------------------------------------------------------

test("exclusive adds the tax on top", () => {
  const money = build([charge({ amount: 1000, ratePercent: 18 })]);

  assert.equal(money.taxableValue, 1000);
  assert.equal(money.totalTax, 180);
  assert.equal(money.total, 1180);
  assert.equal(money.igstAmount, 180, "different states means IGST");
  assert.equal(money.cgstAmount, 0);
});

test("inclusive splits the tax out and the total is what was typed", () => {
  const money = build([charge({ amount: 1180, ratePercent: 18 })], {
    taxMode: TaxMode.INCLUSIVE,
  });

  assert.equal(money.taxableValue, 1000);
  assert.equal(money.totalTax, 180);
  assert.equal(money.total, 1180, "the admin typed 1180 and must see 1180");
});

test("intra-state splits into CGST and SGST, and they sum to the tax", () => {
  const money = build([charge({ amount: 1000 })], {
    placeOfSupplyCode: HARYANA,
  });

  assert.equal(money.isIntraState, true);
  assert.equal(money.igstAmount, 0);
  assert.equal(money.cgstAmount + money.sgstAmount, money.totalTax);
  assert.equal(money.totalTax, 180);
});

test("an odd minor unit of tax still splits exactly", () => {
  // 5.55 at 18% is 0.999, which rounds to 1.00 and cannot be halved evenly.
  const money = build([charge({ amount: 5.55 })], {
    placeOfSupplyCode: HARYANA,
  });

  assert.equal(
    toMinor(money.cgstAmount) + toMinor(money.sgstAmount),
    toMinor(money.totalTax),
  );
  assert.deepEqual(verifyManualInvoiceMoney(money), []);
});

test("a reimbursement carries no tax and stays out of the taxable value", () => {
  const money = build([
    charge({ amount: 1000, ratePercent: 18 }),
    charge({
      label: "Destination duty and taxes",
      amount: 5000,
      ratePercent: 0,
      reimbursement: true,
    }),
  ]);

  assert.equal(money.taxableValue, 1000, "duty is not a supply Arena made");
  assert.equal(money.totalTax, 180, "and it is not taxed");
  assert.equal(money.reimbursements, 5000);
  assert.equal(money.total, 6180, "but the customer still owes it");

  const duty = money.lineItems.find((l) => l.reimbursement);
  assert.ok(duty);
  assert.equal(duty.taxableValue, 0);
  assert.equal(duty.lineTotal, 5000);
});

test("a reimbursement is untaxed under inclusive pricing too", () => {
  const money = build(
    [charge({ amount: 5000, ratePercent: 18, reimbursement: true })],
    { taxMode: TaxMode.INCLUSIVE },
  );

  assert.equal(money.taxableValue, 0);
  assert.equal(money.totalTax, 0);
  assert.equal(money.total, 5000);
});

test("reverse charge zeroes the tax in both modes", () => {
  for (const taxMode of [TaxMode.EXCLUSIVE, TaxMode.INCLUSIVE]) {
    const money = build([charge({ amount: 1000, ratePercent: 18 })], {
      taxMode,
      reverseCharge: true,
    });

    assert.equal(money.totalTax, 0, `${taxMode} charged tax under reverse charge`);
    assert.equal(money.taxableValue, 1000);
    assert.equal(money.total, 1000);
  }
});

test("discount comes off before tax", () => {
  const money = build([charge({ amount: 1000, discount: 100 })]);

  assert.equal(money.taxableValue, 900);
  assert.equal(money.totalTax, 162);
  assert.equal(money.total, 1062);
});

test("a discount larger than the charge clamps rather than going negative", () => {
  const money = build([charge({ amount: 1000, discount: 5000 })]);

  assert.equal(money.taxableValue, 0);
  assert.equal(money.total, 0);
  assert.deepEqual(verifyManualInvoiceMoney(money), []);
});

test("same charge across consignments folds into one printed line", () => {
  const money = build([
    charge({ amount: 1000, consignmentIndex: 0 }),
    charge({ amount: 2000, consignmentIndex: 1 }),
    charge({ amount: 3000, consignmentIndex: 2 }),
  ]);

  assert.equal(money.lineItems.length, 1, "three AWBs, one freight line");
  assert.equal(money.lineItems[0].taxableValue, 6000);
  assert.equal(money.total, 7080);
});

test("the same label at two rates stays two lines", () => {
  const money = build([
    charge({ label: "Other charges", amount: 1000, ratePercent: 18 }),
    charge({ label: "Other charges", amount: 1000, ratePercent: 5 }),
  ]);

  assert.equal(
    money.lineItems.length,
    2,
    "merging them would print a rate that applies to neither",
  );
  assert.deepEqual(money.ratesUsed, [5, 18]);
});

test("a folded line drops the unit rate when the rows disagreed", () => {
  const same = build([
    charge({ rate: 100, quantity: 2, amount: 200 }),
    charge({ rate: 100, quantity: 3, amount: 300 }),
  ]);
  assert.equal(same.lineItems[0].rate, 100);
  assert.equal(same.lineItems[0].quantity, 5);

  const differing = build([
    charge({ rate: 100, amount: 200 }),
    charge({ rate: 250, amount: 300 }),
  ]);
  assert.equal(
    differing.lineItems[0].rate,
    null,
    "a rate that does not multiply out is worse than no rate",
  );
});

test("zero-value lines are dropped", () => {
  const money = build([charge({ amount: 1000 }), charge({ amount: 0 })]);
  assert.equal(money.lineItems.length, 1);
});

test("reimbursements sort below the taxed lines", () => {
  const money = build([
    charge({ label: "Duty", amount: 100, reimbursement: true }),
    charge({ label: "Freight charges", amount: 100 }),
  ]);

  assert.equal(money.lineItems[0].reimbursement, false);
  assert.equal(money.lineItems.at(-1)?.reimbursement, true);
});

test("an empty invoice is zero, not NaN", () => {
  const money = build([]);
  assert.equal(money.total, 0);
  assert.equal(money.taxableValue, 0);
  assert.deepEqual(verifyManualInvoiceMoney(money), []);
});

// ---------------------------------------------------------------------------
// The invariants, over generated invoices
// ---------------------------------------------------------------------------

/** Deterministic PRNG, so a failure is reproducible from the seed alone. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const RATES = [0, 5, 12, 18, 28];

test("the invariants hold over 5,000 generated invoices", () => {
  const random = rng(20260808);
  let checked = 0;

  for (let i = 0; i < 5000; i += 1) {
    const lineCount = 1 + Math.floor(random() * 12);
    const lines: ManualChargeInput[] = [];

    for (let j = 0; j < lineCount; j += 1) {
      const amount = Math.round(random() * 500_000) / 100;
      const reimbursement = random() < 0.2;
      lines.push({
        label: `Charge ${Math.floor(random() * 5)}`,
        sacCode: "996812",
        rate: Math.round(random() * 10_000) / 100,
        quantity: 1 + Math.floor(random() * 5),
        amount,
        // Sometimes larger than the amount, on purpose.
        discount: random() < 0.25 ? Math.round(random() * 60_000) / 100 : 0,
        ratePercent: RATES[Math.floor(random() * RATES.length)],
        reimbursement,
      });
    }

    const taxMode = random() < 0.5 ? TaxMode.EXCLUSIVE : TaxMode.INCLUSIVE;
    const reverseCharge = random() < 0.1;
    const placeOfSupplyCode = random() < 0.5 ? HARYANA : DELHI;

    const money = buildManualInvoiceMoney({
      lines,
      taxMode,
      reverseCharge,
      sellerStateCode: HARYANA,
      placeOfSupplyCode,
    });

    const problems = verifyManualInvoiceMoney(money);
    assert.deepEqual(
      problems,
      [],
      `invoice ${i} (${taxMode}, POS ${placeOfSupplyCode}, reverseCharge ${reverseCharge}) broke: ${problems.join("; ")}`,
    );

    // I3 restated against the printed lines rather than the stored totals, so a
    // total that is internally consistent but disagrees with the table is still
    // caught.
    const fromLines = money.lineItems.reduce(
      (sum, l) => sum + toMinor(l.lineTotal),
      0,
    );
    assert.equal(
      fromLines,
      toMinor(money.total),
      `invoice ${i}: printed lines sum to ${fromLines}, total says ${toMinor(money.total)}`,
    );

    checked += 1;
  }

  assert.equal(checked, 5000);
});

test("inclusive pricing always reconciles to the amounts typed", () => {
  const random = rng(7);

  for (let i = 0; i < 2000; i += 1) {
    const amount = Math.round(random() * 1_000_000) / 100;
    const ratePercent = RATES[Math.floor(random() * RATES.length)];

    const money = buildManualInvoiceMoney({
      lines: [charge({ amount, ratePercent, discount: 0 })],
      taxMode: TaxMode.INCLUSIVE,
      sellerStateCode: HARYANA,
      placeOfSupplyCode: DELHI,
    });

    assert.equal(
      toMinor(money.total),
      toMinor(amount),
      `typed ${amount} at ${ratePercent}% and the total came out ${money.total}`,
    );
  }
});
