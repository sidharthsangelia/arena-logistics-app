/**
 * utils/rateSweep.test.ts
 *
 * The scheduled rate sweep makes 2,400 unattended vendor calls every fifth
 * night and the answers become the basis for customer quotations. Nobody reads
 * the rows one by one, so a silent mislabelling would survive indefinitely:
 * every price would look plausible and be attached to the wrong question.
 *
 * These pin the parts where that could happen without anything visibly
 * breaking.
 *
 *   - the box never out-weighs its own slab, so a row labelled 2kg is 2kg
 *   - the ladder is sorted and free of duplicates, so the unique key holds
 *   - the origin still matches the hub the parcels physically leave from
 *   - failures classify into the four buckets the sweep acts on differently
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOX_PROFILE,
  SWEEP_COUNTRIES,
  SWEEP_ORIGIN,
  WEIGHT_SLABS_KG,
  callsPerMinuteFor,
  estimatedVendorMinutes,
  estimatedVendorRuntimeMinutes,
  expandLanes,
  nominalBoxForWeight,
  pacingDelayMsFor,
  plannedCallCount,
  secondsPerCallFor,
  snapshotSweepConfig,
  volumetricWeightOf,
} from "@/lib/rateSweep/config";
import { judgeVendor } from "@/lib/rateSweep/health";
import { buildSweepRequest, describeCell } from "@/lib/rateSweep/request";
import { FIRST_MILE_HUBS } from "@/lib/booking/firstMile";
import {
  classifyHttpStatus,
  parseRetryAfter,
  RateAdapterError,
} from "@/lib/rate-adapters/core/errors";
import { isTerminalKind, statusForErrorKind } from "@/lib/rateSweep/classify";
import { looksLikeAramexAuthFailure } from "@/lib/rate-adapters/vendors/aramex/aramex.adapter";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";

// ---------------------------------------------------------------------------
// The box. This is the invariant the whole dataset rests on.
// ---------------------------------------------------------------------------

describe("nominal box", () => {
  it("keeps volumetric strictly under actual for every slab", () => {
    // If this ever fails for a slab, that slab's rows silently hold the price
    // of a HEAVIER shipment: the vendor charges max(actual, volumetric), so the
    // column would say 2kg and the money would be 6kg's.
    for (const weightKg of WEIGHT_SLABS_KG) {
      const box = nominalBoxForWeight(weightKg);
      const volumetric = volumetricWeightOf(box);

      assert.ok(
        volumetric < weightKg,
        `${weightKg}kg: volumetric ${volumetric} is not under actual`,
      );
    }
  });

  it("survives the chargeable-weight path the adapters actually use", () => {
    // The invariant above is about the formula. This one is about the code the
    // adapters run: normalizePackages then computeShipmentWeights is what every
    // adapter calls, and it is what decides the number sent to the vendor.
    for (const weightKg of WEIGHT_SLABS_KG) {
      const request = buildSweepRequest({
        country: SWEEP_COUNTRIES[0],
        weightKg,
      });

      const packages = normalizePackages({
        packages: request.shipment.packages,
        weight: request.shipment.weight,
        quantity: request.shipment.quantity,
        dimensions: request.shipment.dimensions,
      });

      const weights = computeShipmentWeights(packages);

      assert.equal(
        weights.totalChargeableKg,
        weightKg,
        `${weightKg}kg resolved to a chargeable weight of ${weights.totalChargeableKg}`,
      );
    }
  });

  it("aims at about half the volumetric threshold, not at a 1cm cube", () => {
    // A box small enough to be safe but too small to be real is a box a vendor
    // may reject and a record nobody can interpret. Half leaves margin without
    // describing neutronium.
    //
    // The floor is 0.5 exactly and the ceiling is a little above it, because
    // rounding the cube side UP to whole centimetres can only add volume, and
    // adds proportionally more at the light end: a 0.25kg box lands at 9cm
    // rather than 8.55cm, which is 58% of the threshold instead of 50%.
    // Comfortably under 1.0 either way, which is the invariant that matters.
    for (const weightKg of WEIGHT_SLABS_KG) {
      const ratio = volumetricWeightOf(nominalBoxForWeight(weightKg)) / weightKg;
      assert.ok(
        ratio >= 0.5 && ratio < 0.7,
        `${weightKg}kg: volumetric/actual is ${ratio.toFixed(3)}`,
      );
    }
  });

  it("returns whole centimetres, because that is what gets stored and sent", () => {
    for (const weightKg of WEIGHT_SLABS_KG) {
      const box = nominalBoxForWeight(weightKg);
      for (const side of [box.lengthCm, box.widthCm, box.heightCm]) {
        assert.equal(side, Math.trunc(side), `${weightKg}kg produced ${side}cm`);
      }
    }
  });

  it("never returns a zero or negative side for junk input", () => {
    for (const input of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const box = nominalBoxForWeight(input);
      assert.ok(box.lengthCm >= 1, `input ${input} produced ${box.lengthCm}cm`);
    }
  });
});

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

describe("weight ladder", () => {
  it("is strictly ascending with no duplicates", () => {
    // A duplicate would collide on RateSweepCall's unique key mid-run, turning
    // one lane's second write into an overwrite of the first. A descending pair
    // would break any interpolation between samples.
    for (let i = 1; i < WEIGHT_SLABS_KG.length; i += 1) {
      assert.ok(
        WEIGHT_SLABS_KG[i] > WEIGHT_SLABS_KG[i - 1],
        `slab ${i} (${WEIGHT_SLABS_KG[i]}) is not above ${WEIGHT_SLABS_KG[i - 1]}`,
      );
    }
  });

  it("holds thirty slabs, half of them under 5kg", () => {
    assert.equal(WEIGHT_SLABS_KG.length, 30);

    const light = WEIGHT_SLABS_KG.filter((w) => w <= 5).length;
    assert.ok(light >= 14, `only ${light} slabs at or under 5kg`);
  });
});

// ---------------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------------

describe("countries", () => {
  it("holds only unique ISO alpha-2 codes", () => {
    // No fixed count here. The list is meant to grow, and a hard number turned
    // every added destination into four unrelated red tests. What must not
    // change is that a code appears once: a duplicate silently halves the
    // lanes for that country and reads as a vendor that stopped answering.
    const codes = new Set(SWEEP_COUNTRIES.map((c) => c.code));
    assert.equal(codes.size, SWEEP_COUNTRIES.length, "duplicate country code in the matrix");

    for (const country of SWEEP_COUNTRIES) {
      assert.match(country.code, /^[A-Z]{2}$/, `${country.code} is not alpha-2`);
    }
  });

  it("gives every country a non-empty postcode, name and city", () => {
    // sKart matches on the uppercased full name and Shipmozo resolves its
    // numeric country id from the name or code, so a blank here is a lane that
    // silently returns nothing for ever.
    for (const country of SWEEP_COUNTRIES) {
      assert.ok(country.name.trim(), `${country.code} has no name`);
      assert.ok(country.city.trim(), `${country.code} has no city`);
      assert.ok(country.postcode.trim(), `${country.code} has no postcode`);
    }
  });

  it("flags exactly the destinations with no postal system", () => {
    // UAE, Qatar and Hong Kong genuinely have none, so their postcodes are
    // placeholders. Anything else carrying this flag means somebody guessed a
    // postcode and hid it behind the same excuse.
    const synthetic = SWEEP_COUNTRIES.filter((c) => c.syntheticPostcode).map(
      (c) => c.code,
    );

    assert.deepEqual(synthetic.sort(), ["AE", "HK", "QA"]);
  });
});

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

describe("origin", () => {
  it("still matches the physical hub", () => {
    // SWEEP_ORIGIN is a deliberate copy of the first-mile hub (see the comment
    // on it). This is the thing that stops the copy rotting: move the hub and
    // this fails rather than the sweep quietly quoting from an address Arena no
    // longer ships out of.
    const hub = FIRST_MILE_HUBS[0];

    assert.ok(hub, "no first-mile hub is configured");
    assert.equal(SWEEP_ORIGIN.pincode, hub.postalCode);
    assert.equal(SWEEP_ORIGIN.city, hub.city);
    assert.equal(SWEEP_ORIGIN.countryCode, hub.countryCode);
  });
});

// ---------------------------------------------------------------------------
// Matrix shape
// ---------------------------------------------------------------------------

describe("matrix", () => {
  it("expands to one lane per vendor per country", () => {
    const lanes = expandLanes(["skart", "shipmozo", "shipglobal", "aramex"]);

    assert.equal(lanes.length, 4 * SWEEP_COUNTRIES.length);
    assert.equal(new Set(lanes.map((l) => `${l.vendorId}:${l.country.code}`)).size, lanes.length);
  });

  it("plans one call per vendor, country and weight", () => {
    assert.equal(
      plannedCallCount(4),
      4 * SWEEP_COUNTRIES.length * WEIGHT_SLABS_KG.length,
    );

    // The number itself is the reason a sweep is confirmed before it runs, so
    // it is worth knowing it stayed in the thousands rather than the tens of
    // thousands. Adding a dozen countries is fine; a change that multiplies the
    // bill by ten should be noticed here first.
    assert.ok(
      plannedCallCount(4) < 10_000,
      `a four-vendor sweep now costs ${plannedCallCount(4)} calls`,
    );
  });

  it("paces sKart under its published ten a minute", () => {
    // Not a preference. sKart's responses carry `ratelimit-policy: 10;w=60`.
    assert.ok(
      callsPerMinuteFor("skart") < 10,
      `sKart paced at ${callsPerMinuteFor("skart")}/min, at or over their published limit`,
    );

    assert.ok(pacingDelayMsFor("skart") >= 6000);
  });

  it("gives an unknown vendor the conservative default", () => {
    // A vendor added to the registry with no entry in the pacing table must not
    // default to unlimited.
    assert.equal(callsPerMinuteFor("some-new-vendor"), 30);
  });

  it("estimates sKart as the long pole", () => {
    const skart = estimatedVendorMinutes("skart");
    const others = estimatedVendorMinutes("shipglobal");

    assert.ok(skart > others, "sKart should be the slowest vendor to sweep");
  });

  it("never lets the pacing floor be mistaken for the real runtime", () => {
    // The whole reason estimatedVendorRuntimeMinutes exists. The pacing figure
    // is a lower bound that assumes zero latency and zero platform overhead;
    // sizing the backstop off it force-closed the 20 Aug sweep while sKart was
    // still working, and the rest of its matrix was never collected.
    for (const vendorId of ["skart", "shipmozo", "shipglobal", "aramex"]) {
      assert.ok(
        estimatedVendorRuntimeMinutes(vendorId) >= estimatedVendorMinutes(vendorId),
        `${vendorId}: measured runtime must never be under the pacing floor`,
      );
    }
  });

  it("bases the runtime estimate on measured seconds per call", () => {
    const calls = SWEEP_COUNTRIES.length * WEIGHT_SLABS_KG.length;

    assert.equal(
      estimatedVendorRuntimeMinutes("skart"),
      Math.ceil((calls * secondsPerCallFor("skart")) / 60),
    );

    // sKart really is the slow one: 5s of vendor latency per call, measured.
    assert.ok(
      secondsPerCallFor("skart") > secondsPerCallFor("aramex"),
      "sKart should be modelled as slower per call than Aramex",
    );

    // An unknown vendor must not be modelled as instant, or adding one would
    // silently shorten the backstop for everybody.
    assert.ok(secondsPerCallFor("some-new-vendor") >= 8);
  });

  it("snapshots a config that fully describes a run", () => {
    // The run row has to remain readable years after this file has moved on.
    const snapshot = snapshotSweepConfig();

    assert.equal(snapshot.countries.length, SWEEP_COUNTRIES.length);
    assert.equal(snapshot.weightSlabsKg.length, WEIGHT_SLABS_KG.length);
    assert.equal(snapshot.boxProfile, BOX_PROFILE);
    assert.ok(snapshot.version);
    assert.ok(snapshot.declaredValue > 0);
  });
});

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

describe("sweep request", () => {
  const country = SWEEP_COUNTRIES.find((c) => c.code === "AE")!;

  it("carries the destination every adapter needs its own piece of", () => {
    const request = buildSweepRequest({ country, weightKg: 2 });

    assert.equal(request.destination.countryCode, "AE");
    // sKart uppercases this itself, but it must be the full name, not the code.
    assert.equal(request.destination.country, "United Arab Emirates");
    assert.equal(request.destination.city, "Abu Dhabi");
    assert.equal(request.destination.pincode, "00000");
    assert.equal(request.origin.pincode, SWEEP_ORIGIN.pincode);
  });

  it("keeps the legacy single-box fields consistent with the package array", () => {
    // Adapters read `packages`, but the canonical type still carries the older
    // shape for external /api/rates callers. Letting the two disagree would be
    // a trap for whoever writes the next adapter.
    const request = buildSweepRequest({ country, weightKg: 7 });
    const pkg = request.shipment.packages![0];

    assert.equal(request.shipment.weight, pkg.weightKg);
    assert.equal(request.shipment.quantity, pkg.quantity);
    assert.equal(request.shipment.dimensions.length, pkg.lengthCm);
    assert.equal(request.shipment.dimensions.unit, "cm");
  });

  it("describes a cell with everything the call row stores", () => {
    const descriptor = describeCell({ country, weightKg: 0.5 });

    assert.equal(descriptor.destCountryCode, "AE");
    assert.equal(descriptor.syntheticPostcode, true);
    assert.equal(descriptor.boxProfile, BOX_PROFILE);
    assert.equal(descriptor.weightKg, 0.5);
    assert.ok(descriptor.declaredValue > 0);
  });

  it("marks a normal destination as having a real postcode", () => {
    const gb = SWEEP_COUNTRIES.find((c) => c.code === "GB")!;
    assert.equal(describeCell({ country: gb, weightKg: 1 }).syntheticPostcode, false);
  });
});

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Vendor health. This is the arithmetic that let a broken sweep look healthy.
// ---------------------------------------------------------------------------

describe("vendor health", () => {
  /** A vendor that did everything it was asked. */
  const clean = {
    vendorId: "aramex",
    expected: 780,
    attempted: 780,
    ok: 750,
    noService: 30,
    snapshots: 750,
    lanesExpected: 26,
    lanesWithRows: 26,
    lanesComplete: 26,
  };

  it("leaves a clean vendor alone", () => {
    const health = judgeVendor(clean);

    assert.equal(health.missing, 0);
    assert.equal(health.failed, 0);
    assert.equal(health.failureRatio, 0);
    assert.equal(health.degraded, false);
  });

  it("does not count a declined lane against the vendor", () => {
    // A vendor that does not fly to Brazil answers all thirty Brazilian slabs
    // correctly by declining them. Counting those as failures would put every
    // honest vendor permanently in alarm.
    const health = judgeVendor({ ...clean, ok: 750, noService: 30 });

    assert.equal(health.failureRatio, 0);
    assert.equal(health.degraded, false);
  });

  it("counts cells that never produced a row", () => {
    // THE BUG. shipmozo's real numbers from the 20 Aug run: it recorded 370 of
    // its 780 cells and the old arithmetic, which divided by what it had rather
    // than by what was planned, scored that a 0% failure rate.
    const health = judgeVendor({
      vendorId: "shipmozo",
      expected: 780,
      attempted: 370,
      ok: 346,
      noService: 24,
      snapshots: 2000,
      lanesExpected: 26,
      lanesWithRows: 15,
      lanesComplete: 12,
    });

    assert.equal(health.missing, 410);
    assert.equal(health.failed, 410, "410 unrecorded cells, no failed rows");
    assert.ok(
      health.failureRatio > 0.5,
      `scored ${(health.failureRatio * 100).toFixed(1)}%, which is not a healthy run`,
    );
    assert.equal(health.degraded, true);
  });

  it("treats a lane that recorded nothing as a failure on its own", () => {
    // skart lost every USA cell on both production runs: 30 of 780, under 4%,
    // nowhere near any sane ratio threshold, and the single worst thing that can
    // happen to this dataset. A whole country must never fail quietly.
    const health = judgeVendor({
      ...clean,
      vendorId: "skart",
      attempted: 750,
      ok: 750,
      noService: 0,
      lanesWithRows: 25,
      lanesComplete: 25,
    });

    assert.equal(health.lanesEmpty, 1);
    assert.ok(
      health.failureRatio < 0.2,
      "this is deliberately under the ratio threshold, so the ratio must not be what catches it",
    );
    assert.equal(health.degraded, true, "an empty lane is a degradation by itself");
  });

  it("separates a lane that stopped short from one that never started", () => {
    const health = judgeVendor({
      ...clean,
      attempted: 700,
      ok: 670,
      lanesWithRows: 26,
      lanesComplete: 20,
    });

    assert.equal(health.lanesEmpty, 0);
    assert.equal(health.lanesPartial, 6);
  });

  it("calls a vendor that produced nothing silent", () => {
    const health = judgeVendor({
      ...clean,
      attempted: 0,
      ok: 0,
      noService: 0,
      snapshots: 0,
      lanesWithRows: 0,
      lanesComplete: 0,
    });

    assert.equal(health.silent, true);
    assert.equal(health.degraded, true);
  });

  it("does not report a vendor that was never asked as down", () => {
    // A run cancelled before a vendor started has nothing to say about it.
    const health = judgeVendor({
      ...clean,
      expected: 0,
      attempted: 0,
      ok: 0,
      noService: 0,
      snapshots: 0,
      lanesExpected: 0,
      lanesWithRows: 0,
      lanesComplete: 0,
    });

    assert.equal(health.silent, false);
    assert.equal(health.degraded, false);
    assert.equal(health.failureRatio, 0);
  });

  it("does not call a sweep in progress degraded for work it has not done yet", () => {
    // Opening the run screen on a healthy sweep that is ten minutes in must not
    // show every vendor as degraded with hundreds of cells missing.
    const midRun = {
      ...clean,
      attempted: 90,
      ok: 90,
      noService: 0,
      snapshots: 500,
      lanesWithRows: 3,
      lanesComplete: 3,
    };

    const inFlight = judgeVendor({ ...midRun, inFlight: true });
    assert.equal(inFlight.missing, 0);
    assert.equal(inFlight.lanesEmpty, 0);
    assert.equal(inFlight.lanesPartial, 0);
    assert.equal(inFlight.degraded, false);

    // The very same numbers, once the run is over, are a disaster.
    const finished = judgeVendor(midRun);
    assert.equal(finished.missing, 690);
    assert.equal(finished.lanesEmpty, 23);
    assert.equal(finished.degraded, true);
  });

  it("still flags a real failure while the run is in flight", () => {
    // In-flight forgiveness applies to work not yet done, never to work that
    // was done and went wrong.
    const health = judgeVendor({
      ...clean,
      inFlight: true,
      attempted: 100,
      ok: 10,
      noService: 0,
      lanesWithRows: 4,
      lanesComplete: 4,
    });

    assert.equal(health.failedRows, 90);
    assert.ok(health.failureRatio > 0.2);
    assert.equal(health.degraded, true);
  });

  it("never returns a negative count from inconsistent inputs", () => {
    // Rows can outnumber the plan if the country list grew mid-run. That is
    // odd, and it must not produce a negative "missing" that quietly cancels
    // out a real failure somewhere else in the sum.
    const health = judgeVendor({
      ...clean,
      expected: 780,
      attempted: 900,
      ok: 900,
      noService: 0,
      lanesWithRows: 30,
    });

    assert.equal(health.missing, 0);
    assert.equal(health.failedRows, 0);
    assert.equal(health.lanesEmpty, 0);
    assert.ok(health.failureRatio >= 0);
  });
});

describe("error classification", () => {
  it("separates the four outcomes the sweep acts on differently", () => {
    assert.equal(classifyHttpStatus(401), "AUTH_ERROR");
    assert.equal(classifyHttpStatus(403), "AUTH_ERROR");
    assert.equal(classifyHttpStatus(429), "RATE_LIMITED");
    assert.equal(classifyHttpStatus(503), "VENDOR_ERROR");
    assert.equal(classifyHttpStatus(504), "TIMEOUT");
  });

  it("does not treat a 404 as an unserviceable lane", () => {
    // Vendors signal "we do not fly there" in the body of a 200. A 404 from a
    // rate endpoint means our URL is wrong, and swallowing it as NO_SERVICE
    // would turn a broken integration into a table full of confident nulls.
    assert.notEqual(classifyHttpStatus(404), "NO_SERVICE");
  });

  it("only retries what retrying can fix", () => {
    assert.equal(isTerminalKind("NO_SERVICE"), true);
    assert.equal(isTerminalKind("AUTH_ERROR"), true);
    assert.equal(isTerminalKind("CONFIG_ERROR"), true);
    assert.equal(isTerminalKind("VENDOR_ERROR"), false);
    assert.equal(isTerminalKind("TIMEOUT"), false);
    assert.equal(isTerminalKind("RATE_LIMITED"), false);
  });

  it("defaults an unclassified failure to retriable", () => {
    // The one-sided cost: a needless retry is one extra call, a missed retry
    // loses the lane for five days.
    assert.equal(new RateAdapterError("x", "boom").retriable, true);
    assert.equal(isTerminalKind(undefined), false);
  });

  it("maps every kind onto a storable status", () => {
    assert.equal(statusForErrorKind("NO_SERVICE"), "NO_SERVICE");
    assert.equal(statusForErrorKind("AUTH_ERROR"), "AUTH_ERROR");
    assert.equal(statusForErrorKind("RATE_LIMITED"), "RATE_LIMITED");
    assert.equal(statusForErrorKind("TIMEOUT"), "TIMEOUT");
    assert.equal(statusForErrorKind("CONFIG_ERROR"), "CONFIG_ERROR");
    assert.equal(statusForErrorKind("UNKNOWN"), "VENDOR_ERROR");
    assert.equal(statusForErrorKind(undefined), "VENDOR_ERROR");
  });

  it("reads both forms of Retry-After", () => {
    assert.equal(parseRetryAfter("120"), 120);
    assert.equal(parseRetryAfter(null), undefined);
    assert.equal(parseRetryAfter(""), undefined);
    assert.equal(parseRetryAfter("nonsense"), undefined);

    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const in90s = new Date(now + 90_000).toUTCString();
    assert.equal(parseRetryAfter(in90s, now), 90);

    // A date already in the past means retry now, not wait forever.
    const past = new Date(now - 5_000).toUTCString();
    assert.equal(parseRetryAfter(past, now), 0);

    // Capped, so a vendor asking for a day does not sleep through the sweep.
    assert.equal(parseRetryAfter("999999"), 3600);
  });
});

describe("Aramex auth heuristic", () => {
  it("catches the credential wordings Aramex actually uses", () => {
    // Aramex reports expired credentials as an ordinary HasErrors notification,
    // so the wording is all there is to go on.
    for (const message of [
      "Invalid credentials",
      "ClientInfo: Invalid Account Number",
      "Account PIN is invalid",
      "Unauthorized access",
      "Authentication failed",
    ]) {
      assert.equal(
        looksLikeAramexAuthFailure(message),
        true,
        `missed: ${message}`,
      );
    }
  });

  it("does not stop a working vendor over an ordinary rejection", () => {
    // A false positive abandons a healthy vendor for the whole run, which is
    // far worse than a missed one costing a wasted sweep.
    for (const message of [
      "No service available for this destination",
      "Invalid weight for the selected product",
      "Destination country is not serviced",
      "Dimensions exceed the maximum allowed",
    ]) {
      assert.equal(
        looksLikeAramexAuthFailure(message),
        false,
        `false positive: ${message}`,
      );
    }
  });
});
