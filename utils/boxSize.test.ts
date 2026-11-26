import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BOX_PRESETS,
  fromCm,
  matchingPreset,
  readBoxSize,
  toCm,
} from "../lib/booking/boxSize";

test("inches round-trip through cm without drift", () => {
  for (const inches of [1, 7.5, 12, 23.62]) {
    assert.equal(fromCm(toCm(inches, "in"), "in"), inches);
  }
  assert.equal(toCm(30, "cm"), 30);
  assert.equal(fromCm(30.48, "in"), 12);
});

test("size weight is L x B x H / 5000 and decides when larger", () => {
  const r = readBoxSize({ lengthCm: 50, widthCm: 40, heightCm: 30, weightKg: 4, unit: "cm" });
  assert.equal(r.sizeWeightKg, 12);
  assert.equal(r.chargedBySize, true);
  const heavy = readBoxSize({ lengthCm: 30, widthCm: 20, heightCm: 10, weightKg: 2, unit: "cm" });
  assert.equal(heavy.sizeWeightKg, 1.2);
  assert.equal(heavy.chargedBySize, false);
});

test("no size weight until all three sides are in", () => {
  const r = readBoxSize({ lengthCm: 50, widthCm: 40, heightCm: 0, weightKg: 4, unit: "cm" });
  assert.equal(r.hasSize, false);
  assert.equal(r.sizeWeightKg, 0);
  assert.equal(r.chargedBySize, false);
});

test("bulky hint at 3x real weight or more", () => {
  const kinds = (w: number) =>
    readBoxSize({ lengthCm: 50, widthCm: 40, heightCm: 30, weightKg: w, unit: "cm" }).warnings.map((x) => x.kind);
  assert.deepEqual(kinds(4), ["bulky"]); // 12 kg vs 4 kg = 3x
  assert.deepEqual(kinds(5), []); // 12 vs 5 < 3x
  assert.deepEqual(kinds(0), []); // no weight yet: nothing to compare
});

test("long side hint in cm, cm-as-inches hint in inches, never both", () => {
  const cm = readBoxSize({ lengthCm: 400, widthCm: 10, heightCm: 10, weightKg: 100, unit: "cm" });
  assert.deepEqual(cm.warnings.map((w) => w.kind), ["long-side"]);

  const inch = readBoxSize({ lengthCm: toCm(70, "in"), widthCm: 10, heightCm: 10, weightKg: 100, unit: "in" });
  assert.deepEqual(inch.warnings.map((w) => w.kind), ["cm-as-inches"]);

  const okInch = readBoxSize({ lengthCm: toCm(40, "in"), widthCm: 10, heightCm: 10, weightKg: 100, unit: "in" });
  assert.deepEqual(okInch.warnings, []);
});

test("matchingPreset finds an exact carton, including one typed in inches", () => {
  const small = BOX_PRESETS[0];
  assert.equal(matchingPreset(small.lengthCm, small.widthCm, small.heightCm)?.id, small.id);
  assert.equal(matchingPreset(31, 20, 15), undefined);
  const inInches = toCm(fromCm(small.lengthCm, "in"), "in");
  assert.equal(matchingPreset(inInches, small.widthCm, small.heightCm)?.id, small.id);
});
