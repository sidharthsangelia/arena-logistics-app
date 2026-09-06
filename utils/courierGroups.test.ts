/**
 * utils/courierGroups.test.ts
 *
 * The grouping decides which rate a customer SEES and therefore which rate they
 * buy, so the two properties worth pinning are:
 *
 *   1. Nothing is lost. Every quote in must appear exactly once in the output,
 *      as a representative or inside a group. A quote that is not in the tree
 *      cannot be selected.
 *   2. The representative is deterministic. lib/booking/domesticCourierResolve
 *      re-quotes a lane at booking time and matches on the stored product name;
 *      if a reshuffled vendor response could put a different service on the
 *      card, the same reshuffle could resolve the booking to the wrong one.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareQuotes,
  groupQuotesByCourier,
  type GroupableQuote,
} from "@/lib/rates/courierGroups";

function quote(
  productName: string,
  totalWithTax: number,
  tatDays = 3,
  vendorId = "shipmozo",
): GroupableQuote {
  return { vendorId, productName, totalWithTax, tatDays };
}

const displayName = (q: GroupableQuote) => q.productName;

/** A realistic domestic lane: four couriers across eleven slab rows. */
const LANE: GroupableQuote[] = [
  quote("Delhivery Surface 0.5 Kg", 512),
  quote("Delhivery Surface 1 Kg", 498),
  quote("Delhivery Surface 5 Kg", 640),
  quote("Delhivery Air 0.5 Kg", 910, 2),
  quote("Delhivery Air 1 Kg", 880, 2),
  quote("Xpressbees Surface 0.5 K.G", 505),
  quote("Xpressbees Surface 1 Kg", 530),
  quote("Amazon Shipping 0.5", 470, 4),
  quote("Amazon Shipping 1 Kg", 495, 4),
  quote("Shadowfax 1 Kg", 460, 5),
  quote("Ecom Express 5 Kg", 700),
];

describe("groupQuotesByCourier", () => {
  it("collapses a real lane to one card per courier per mode", () => {
    const groups = groupQuotesByCourier(LANE, { displayName });

    const labels = groups.map((g) => `${g.label}/${g.mode}`).sort();
    assert.deepEqual(labels, [
      "Amazon/surface",
      "Delhivery/air",
      "Delhivery/surface",
      "Ecom Express/surface",
      "Shadowfax/surface",
      "XpressBees/surface",
    ]);
  });

  it("loses nothing: every quote appears exactly once", () => {
    const groups = groupQuotesByCourier(LANE, { displayName });
    const seen = groups.flatMap((g) => [g.best, ...g.alternatives]);

    assert.equal(seen.length, LANE.length);
    assert.deepEqual(
      seen.map((q) => q.productName).sort(),
      LANE.map((q) => q.productName).sort(),
    );
  });

  it("puts the cheapest of a courier on the card", () => {
    const groups = groupQuotesByCourier(LANE, { displayName });
    const delhiverySurface = groups.find(
      (g) => g.label === "Delhivery" && g.mode === "surface",
    );

    assert.ok(delhiverySurface);
    assert.equal(delhiverySurface.best.productName, "Delhivery Surface 1 Kg");
    assert.equal(delhiverySurface.size, 3);
    assert.equal(delhiverySurface.alternatives.length, 2);
  });

  it("orders the hidden rates cheapest first", () => {
    const groups = groupQuotesByCourier(LANE, { displayName });
    const delhiverySurface = groups.find(
      (g) => g.label === "Delhivery" && g.mode === "surface",
    )!;

    assert.deepEqual(
      delhiverySurface.alternatives.map((q) => q.totalWithTax),
      [512, 640],
    );
  });

  it("never buries a courier's air service under its cheaper truck", () => {
    // Merging the two modes would make "Delhivery" mean the 498 surface rate and
    // hide the 880 flight, which is the one reason someone picks Delhivery Air.
    const groups = groupQuotesByCourier(LANE, { displayName });
    const air = groups.find((g) => g.label === "Delhivery" && g.mode === "air");

    assert.ok(air);
    assert.equal(air.best.productName, "Delhivery Air 1 Kg");
  });

  it("merges the two modes when the caller turns the split off", () => {
    const groups = groupQuotesByCourier(LANE, {
      displayName,
      splitByMode: false,
    });
    const delhivery = groups.filter((g) => g.label === "Delhivery");

    assert.equal(delhivery.length, 1);
    assert.equal(delhivery[0].size, 5);
    assert.equal(delhivery[0].mode, null);
  });

  it("gives the same answer whatever order the vendor returned", () => {
    const forward = groupQuotesByCourier(LANE, { displayName });
    const reversed = groupQuotesByCourier([...LANE].reverse(), { displayName });

    const shape = (groups: ReturnType<typeof groupQuotesByCourier>) =>
      groups
        .map(
          (g) =>
            `${g.key}|${g.best.productName}|${g.alternatives
              .map((a) => a.productName)
              .join(",")}`,
        )
        .sort();

    assert.deepEqual(shape(forward), shape(reversed));
  });

  it("breaks a price tie the same way every time", () => {
    // Four rows at one price, which live SpeedoPost traffic actually returns.
    // Whichever wins must not depend on the order they arrived in.
    const tied = [
      quote("Delhivery Surface B", 500, 3, "speedopost"),
      quote("Delhivery Surface A", 500, 3, "shipmozo"),
      quote("Delhivery Surface A", 500, 2, "shipmozo"),
      quote("Delhivery Surface C", 500, 3, "shipmozo"),
    ];

    const first = groupQuotesByCourier(tied, { displayName })[0];
    const again = groupQuotesByCourier([...tied].reverse(), { displayName })[0];

    // Fewest transit days wins the tie before the name does.
    assert.equal(first.best.tatDays, 2);
    assert.equal(first.best.productName, again.best.productName);
    assert.equal(first.best.vendorId, again.best.vendorId);
  });

  it("groups the same courier across vendors", () => {
    const groups = groupQuotesByCourier(
      [
        quote("Delhivery Surface 1 Kg", 520, 3, "shipmozo"),
        quote("Delhivery Freight", 480, 3, "speedopost"),
      ],
      { displayName },
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].best.vendorId, "speedopost");
    assert.equal(groups[0].alternatives[0].vendorId, "shipmozo");
  });

  it("reads the family from the name the viewer sees", () => {
    // A white-labelled name must drive the heading, or the group prints a
    // sourcing vendor's brand in the one place branding exists to keep it out.
    const groups = groupQuotesByCourier(
      [quote("Shipmozo Drift 1 Kg", 400), quote("Shipmozo Drift 5 Kg", 450)],
      { displayName: () => "Arena Drift" },
    );

    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, "Arena Drift");
  });

  it("returns nothing for an empty list rather than throwing", () => {
    assert.deepEqual(groupQuotesByCourier([], { displayName }), []);
  });
});

describe("compareQuotes", () => {
  it("sorts an unknown transit time last, not first", () => {
    const known = quote("A", 500, 3);
    const unknown = quote("B", 500, 0);
    assert.ok(compareQuotes(known, unknown) < 0);
  });

  it("is a total order, so the sort cannot depend on input order", () => {
    const a = quote("A", 500, 3, "shipmozo");
    const b = quote("A", 500, 3, "speedopost");
    assert.ok(compareQuotes(a, b) < 0);
    assert.ok(compareQuotes(b, a) > 0);
    assert.equal(compareQuotes(a, { ...a }), 0);
  });
});
