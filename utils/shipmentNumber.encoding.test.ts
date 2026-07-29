/**
 * Tests for the shipment-number encoding.
 *
 * Run with: npm test
 *
 * These cover the pure encoding only. `generateShipmentNumber` itself is a thin
 * wrapper over nextval() and needs a live Postgres, so the uniqueness test here
 * asserts the property the encoding is responsible for: distinct sequence
 * values must never collapse to the same string.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  PREFIX,
  encodeShipmentNumber,
  decodeShipmentNumber,
  parseShipmentNumber,
  formatDateSegment,
} from "./shipmentNumber.encoding";

const FIXED_DATE = new Date("2026-01-30T12:00:00Z");

describe("format", () => {
  it("matches the documented shape: ARN + YYMMDD + digits", () => {
    const value = encodeShipmentNumber(42, FIXED_DATE);

    assert.match(value, /^ARN\d{12,}$/);
    assert.ok(value.startsWith(`${PREFIX}260130`));
  });

  it("contains no hyphens or other separators", () => {
    for (const seq of [0, 1, 42, 999, 123456, 98765432]) {
      const value = encodeShipmentNumber(seq, FIXED_DATE);
      assert.ok(!/[^A-Z0-9]/.test(value), `${value} contains a separator`);
    }
  });

  it("is all uppercase", () => {
    const value = encodeShipmentNumber(42, FIXED_DATE);
    assert.equal(value, value.toUpperCase());
  });

  it("uses only digits after the 3-letter prefix", () => {
    const value = encodeShipmentNumber(7, FIXED_DATE);
    assert.match(value.slice(PREFIX.length), /^\d+$/);
  });

  it("pads the encoded segment to at least 6 digits for small values", () => {
    // The whole point of minLength: seq=1 must not be visibly "the first one".
    const value = encodeShipmentNumber(1, FIXED_DATE);
    const encodedSegment = value.slice(PREFIX.length + 6);

    assert.ok(
      encodedSegment.length >= 6,
      `expected >= 6 encoded digits, got ${encodedSegment.length}`,
    );
  });

  it("does not leak the sequence value verbatim", () => {
    const encodedSegment = encodeShipmentNumber(42, FIXED_DATE).slice(PREFIX.length + 6);
    assert.notEqual(Number(encodedSegment), 42);
  });

  it("rejects invalid sequence values", () => {
    assert.throws(() => encodeShipmentNumber(-1, FIXED_DATE), RangeError);
    assert.throws(() => encodeShipmentNumber(1.5, FIXED_DATE), RangeError);
  });
});

describe("date segment", () => {
  it("extracts YYMMDD from the booking date", () => {
    assert.equal(formatDateSegment(new Date("2026-01-30T12:00:00Z")), "260130");
    assert.equal(formatDateSegment(new Date("2026-12-31T06:00:00Z")), "261231");
    assert.equal(formatDateSegment(new Date("2027-03-05T06:00:00Z")), "270305");
  });

  it("zero-pads single-digit months and days", () => {
    assert.equal(formatDateSegment(new Date("2026-04-09T06:00:00Z")), "260409");
  });

  it("stamps the date in IST, not UTC", () => {
    // 20:00 UTC on the 29th is already 01:30 IST on the 30th. A booking taken
    // late evening India time must not be dated to the previous day.
    assert.equal(formatDateSegment(new Date("2026-01-29T20:00:00Z")), "260130");
  });

  it("round-trips the date through parseShipmentNumber", () => {
    const parsed = parseShipmentNumber(encodeShipmentNumber(42, FIXED_DATE));

    assert.equal(parsed?.format, "current");
    assert.equal(parsed?.bookedOn, "2026-01-30");
    assert.equal(parsed?.seq, 42);
  });
});

describe("round trip", () => {
  it("decodes back to the original sequence value", () => {
    for (const seq of [0, 1, 2, 42, 99, 1000, 65535, 1234567, 99999999]) {
      const encoded = encodeShipmentNumber(seq, FIXED_DATE);
      assert.equal(decodeShipmentNumber(encoded), seq, `failed for seq=${seq}`);
    }
  });

  it("round-trips 10000 consecutive values", () => {
    for (let seq = 0; seq < 10_000; seq++) {
      assert.equal(decodeShipmentNumber(encodeShipmentNumber(seq, FIXED_DATE)), seq);
    }
  });

  it("decodes regardless of the date segment", () => {
    const a = encodeShipmentNumber(42, new Date("2026-01-30T12:00:00Z"));
    const b = encodeShipmentNumber(42, new Date("2027-07-04T12:00:00Z"));

    assert.notEqual(a, b);
    assert.equal(decodeShipmentNumber(a), 42);
    assert.equal(decodeShipmentNumber(b), 42);
  });

  it("tolerates whitespace and lowercase input", () => {
    const encoded = encodeShipmentNumber(42, FIXED_DATE);

    assert.equal(decodeShipmentNumber(`  ${encoded}  `), 42);
    assert.equal(decodeShipmentNumber(encoded.toLowerCase()), 42);
  });
});

describe("uniqueness", () => {
  it("never collides across 50000 rapid sequential values", () => {
    // Simulates a burst of bookings: nextval() hands out distinct integers, and
    // the encoding must preserve that distinctness.
    const seen = new Set<string>();

    for (let seq = 1; seq <= 50_000; seq++) {
      const value = encodeShipmentNumber(seq, FIXED_DATE);
      assert.ok(!seen.has(value), `collision at seq=${seq}: ${value}`);
      seen.add(value);
    }

    assert.equal(seen.size, 50_000);
  });

  it("stays unique when many numbers are generated in the same millisecond", () => {
    const now = new Date();
    const values = Array.from({ length: 1000 }, (_, i) => encodeShipmentNumber(i + 1, now));

    assert.equal(new Set(values).size, values.length);
  });
});

describe("decodeShipmentNumber rejects bad input", () => {
  it("returns null instead of throwing", () => {
    const bad = [
      "",
      "   ",
      "nonsense",
      "ARN",
      "ARN260130",           // date but no encoded segment
      "ARN26013012",         // encoded segment shorter than minLength
      "XYZ260130748291",     // wrong prefix
      "ARN2601307482!1",     // non-digit in the body
      "ARN-260130-748291",   // separators
      "SHP-2026-00042",      // legacy format
    ];

    for (const value of bad) {
      assert.equal(decodeShipmentNumber(value), null, `expected null for ${JSON.stringify(value)}`);
    }
  });

  it("rejects non-canonical strings that Sqids would otherwise decode", () => {
    // Sqids will happily decode many arbitrary digit strings. Without the
    // re-encode check these would return a plausible but wrong sequence value.
    let rejected = 0;

    for (let i = 0; i < 2000; i++) {
      const candidate = `${PREFIX}260130${String(i).padStart(6, "0")}`;
      const seq = decodeShipmentNumber(candidate);

      if (seq === null) {
        rejected++;
      } else {
        // Anything accepted must be genuinely canonical.
        assert.equal(encodeShipmentNumber(seq, FIXED_DATE), candidate);
      }
    }

    assert.ok(rejected > 0, "expected some lookalike strings to be rejected");
  });
});

describe("legacy format", () => {
  it("still parses old SHP-YYYY-NNNNN numbers", () => {
    const parsed = parseShipmentNumber("SHP-2026-00042");

    assert.deepEqual(parsed, {
      format: "legacy",
      prefix: "SHP",
      seq: 42,
      bookedOn: null,
    });
  });

  it("returns null from decodeShipmentNumber for legacy numbers", () => {
    assert.equal(decodeShipmentNumber("SHP-2026-00042"), null);
  });

  it("returns null for values matching neither format", () => {
    assert.equal(parseShipmentNumber("not-a-shipment"), null);
    assert.equal(parseShipmentNumber(""), null);
  });
});

describe("SHIPMENT_ID_ALPHABET", () => {
  // The Sqids instance is built at module load, so alphabet behaviour has to be
  // exercised in a fresh process.
  const run = (script: string, alphabet?: string) =>
    execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        env: alphabet === undefined
          ? { ...process.env, SHIPMENT_ID_ALPHABET: "" }
          : { ...process.env, SHIPMENT_ID_ALPHABET: alphabet },
        encoding: "utf8",
        cwd: import.meta.dirname,
      },
    ).trim();

  const script = `
    const m = await import("./shipmentNumber.encoding.ts");
    process.stdout.write(m.encodeShipmentNumber(42, new Date("2026-01-30T12:00:00Z")));
  `;

  it("changes the encoding when a custom alphabet is set", () => {
    const withDefault = run(script);
    const withCustom = run(script, "0123456789");

    assert.notEqual(withDefault, withCustom);
    assert.match(withCustom, /^ARN260130\d{6,}$/);
  });

  it("falls back to the default alphabet when the env var is malformed", () => {
    const withDefault = run(script);

    // Not a permutation of 0-9: repeated digits, wrong length, non-digits.
    assert.equal(run(script, "0000000000"), withDefault);
    assert.equal(run(script, "012"), withDefault);
    assert.equal(run(script, "abcdefghij"), withDefault);
  });
});
