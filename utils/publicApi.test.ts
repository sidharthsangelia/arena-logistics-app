/**
 * utils/publicApi.test.ts
 * -----------------------------------------------------------------------------
 * The public API's decisions that are worth pinning down, tested at the level
 * they are made: key parsing, markup resolution, request validation and the
 * branding scrub.
 *
 * These are the four places where a mistake is silent and expensive. A wrong
 * status code shows up the first time anyone calls the endpoint; a markup that
 * resolved to 0, a `.strict()` that stopped being strict, or a vendor name that
 * survived the scrub all look exactly like success.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  ALL_API_SCOPES,
  __resetApiKeysForTests,
  hasConfiguredKeys,
  resolveConsumer,
  type ApiConsumer,
} from "@/lib/publicApi/keys";
import { DEFAULT_API_MARKUP_PERCENT, resolveApiMarkup } from "@/lib/publicApi/markup";
import {
  domesticRateRequestSchema,
  internationalRateRequestSchema,
  toCanonicalDomestic,
  toCanonicalInternational,
  trackQuerySchema,
} from "@/lib/publicApi/schema";
import {
  SYNTHETIC_POSTCODE,
  countryHasNoPostcode,
  noPostcodeCountryCodes,
} from "@/lib/publicApi/postcodes";
import { hasCountryName } from "@/lib/publicApi/countries";
import { matchShipmozoCountry } from "@/lib/rate-adapters/vendors/shipmozo/shipmozo.adapter";
import { SWEEP_COUNTRIES } from "@/lib/rateSweep/config";

// A key long enough to clear the 16-character floor.
const KEY_A = "ak_test_aaaaaaaaaaaaaaaaaaaa";
const KEY_B = "ak_test_bbbbbbbbbbbbbbbbbbbb";

const ENV_KEYS = [
  "ARENA_API_KEYS",
  "ARENA_API_MARKUP_PERCENT",
  "ARENA_API_MARKUP_PERCENT_INTL",
  "ARENA_API_MARKUP_PERCENT_DOMESTIC",
  "ARENA_API_ALLOW_ZERO_MARKUP",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  __resetApiKeysForTests();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetApiKeysForTests();
});

// ---------------------------------------------------------------------------

describe("API keys", () => {
  it("reads the object form, with per-consumer settings", () => {
    process.env.ARENA_API_KEYS = JSON.stringify([
      {
        name: "marketing-site",
        key: KEY_A,
        orgId: "org_123",
        markupIntlPercent: 40,
        scopes: ["rates:international"],
      },
    ]);

    const consumer = resolveConsumer(KEY_A);

    assert.equal(consumer?.name, "marketing-site");
    assert.equal(consumer?.orgId, "org_123");
    assert.equal(consumer?.markupIntlPercent, 40);
    assert.deepEqual(consumer?.scopes, ["rates:international"]);
  });

  it("reads the bare-string form as an all-scopes key with no org", () => {
    process.env.ARENA_API_KEYS = `${KEY_A},${KEY_B}`;

    const a = resolveConsumer(KEY_A);
    const b = resolveConsumer(KEY_B);

    assert.ok(a && b);
    assert.deepEqual(a.scopes, ALL_API_SCOPES);
    assert.equal(a.orgId, undefined, "a bare key must not be able to resolve an ARN");
    assert.notEqual(a.name, b.name, "two keys must be distinguishable in the logs");
  });

  it("gives every scope to an entry that lists none", () => {
    // Omitting `scopes` is how you say "everything". A typo'd scope list is a
    // different case and must not silently disable every endpoint.
    process.env.ARENA_API_KEYS = JSON.stringify([{ name: "x", key: KEY_A }]);
    assert.deepEqual(resolveConsumer(KEY_A)?.scopes, ALL_API_SCOPES);

    process.env.ARENA_API_KEYS = JSON.stringify([
      { name: "x", key: KEY_A, scopes: ["rates:intl"] },
    ]);
    __resetApiKeysForTests();
    assert.deepEqual(resolveConsumer(KEY_A)?.scopes, ALL_API_SCOPES);
  });

  it("refuses a key shorter than 16 characters", () => {
    process.env.ARENA_API_KEYS = JSON.stringify([{ name: "weak", key: "short" }]);

    assert.equal(hasConfiguredKeys(), false);
    assert.equal(resolveConsumer("short"), null);
  });

  it("refuses everything when the config does not parse", () => {
    // Fail closed. Half-readable JSON must not become "no auth required".
    process.env.ARENA_API_KEYS = "[{ not json";

    assert.equal(hasConfiguredKeys(), false);
    assert.equal(resolveConsumer(KEY_A), null);
  });

  it("refuses everything when nothing is configured", () => {
    assert.equal(resolveConsumer(KEY_A), null);
    assert.equal(resolveConsumer(""), null);
    assert.equal(resolveConsumer(null), null);
  });

  it("rejects a wrong key, including one that prefixes a real one", () => {
    process.env.ARENA_API_KEYS = KEY_A;

    assert.equal(resolveConsumer(KEY_A.slice(0, -1)), null);
    assert.equal(resolveConsumer(`${KEY_A}x`), null);
    assert.equal(resolveConsumer(KEY_B), null);
  });

  it("re-reads when the env value changes", () => {
    process.env.ARENA_API_KEYS = KEY_A;
    assert.ok(resolveConsumer(KEY_A));

    // A rotation must take effect on the next read, not on the next deploy.
    process.env.ARENA_API_KEYS = KEY_B;
    assert.equal(resolveConsumer(KEY_A), null);
    assert.ok(resolveConsumer(KEY_B));
  });

  it("never returns the key material", () => {
    process.env.ARENA_API_KEYS = JSON.stringify([{ name: "x", key: KEY_A }]);

    const consumer = resolveConsumer(KEY_A)!;
    assert.equal(JSON.stringify(consumer).includes(KEY_A), false);
  });
});

// ---------------------------------------------------------------------------

describe("markup resolution", () => {
  const consumer = (over: Partial<ApiConsumer> = {}): ApiConsumer => ({
    name: "test",
    scopes: [...ALL_API_SCOPES],
    ...over,
  });

  it("falls back to the standard margin when nothing is set", () => {
    const result = resolveApiMarkup(consumer(), "international");

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.percent, DEFAULT_API_MARKUP_PERCENT);
    assert.equal(result.ok && result.source, "default");
  });

  it("prefers the scope variable over the shared one", () => {
    process.env.ARENA_API_MARKUP_PERCENT = "20";
    process.env.ARENA_API_MARKUP_PERCENT_INTL = "45";

    const intl = resolveApiMarkup(consumer(), "international");
    const dom = resolveApiMarkup(consumer(), "domestic");

    assert.equal(intl.ok && intl.percent, 45);
    // Domestic has no variable of its own, so it takes the shared one.
    assert.equal(dom.ok && dom.percent, 20);
  });

  it("prefers the consumer's own override over both", () => {
    process.env.ARENA_API_MARKUP_PERCENT = "20";
    process.env.ARENA_API_MARKUP_PERCENT_DOMESTIC = "25";

    const result = resolveApiMarkup(consumer({ markupDomesticPercent: 12 }), "domestic");

    assert.equal(result.ok && result.percent, 12);
    assert.equal(result.ok && result.source, "consumer");
  });

  it("refuses a configured 0% unless zero is explicitly allowed", () => {
    // The whole reason this module exists: 0% publishes buying cost, and a
    // typo that empties a variable must not be able to do that quietly.
    process.env.ARENA_API_MARKUP_PERCENT_INTL = "0";
    assert.equal(resolveApiMarkup(consumer(), "international").ok, false);

    process.env.ARENA_API_ALLOW_ZERO_MARKUP = "true";
    const allowed = resolveApiMarkup(consumer(), "international");
    assert.equal(allowed.ok, true);
    assert.equal(allowed.ok && allowed.percent, 0);
  });

  it("refuses a nonsense value rather than falling through to a bigger one", () => {
    // Falling through would quote at a margin nobody chose, which is worse than
    // an outage because it is invisible.
    process.env.ARENA_API_MARKUP_PERCENT = "30";
    process.env.ARENA_API_MARKUP_PERCENT_INTL = "abc";

    assert.equal(resolveApiMarkup(consumer(), "international").ok, false);
  });

  it("refuses a percentage outside 0-500", () => {
    process.env.ARENA_API_MARKUP_PERCENT = "-5";
    assert.equal(resolveApiMarkup(consumer(), "domestic").ok, false);

    process.env.ARENA_API_MARKUP_PERCENT = "5000";
    assert.equal(resolveApiMarkup(consumer(), "domestic").ok, false);
  });

  it("treats an empty variable as unset, not as zero", () => {
    process.env.ARENA_API_MARKUP_PERCENT_INTL = "";
    process.env.ARENA_API_MARKUP_PERCENT = "35";

    const result = resolveApiMarkup(consumer(), "international");
    assert.equal(result.ok && result.percent, 35);
  });
});

// ---------------------------------------------------------------------------

describe("international rate request", () => {
  const valid = () => ({
    origin: { city: "Mumbai", countryCode: "IN", pincode: "400001" },
    destination: { city: "Dubai", countryCode: "AE" },
    shipment: {
      weight: 2,
      quantity: 1,
      dimensions: { length: 30, width: 20, height: 10, unit: "cm" },
    },
  });

  it("accepts a well-formed export request and upper-cases country codes", () => {
    const body = valid();
    body.destination.countryCode = "ae";

    const parsed = internationalRateRequestSchema.safeParse(body);
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.destination.countryCode, "AE");
  });

  it("rejects an unknown key instead of quoting a different shipment", () => {
    const parsed = internationalRateRequestSchema.safeParse({
      ...valid(),
      shipment: { ...valid().shipment, weigth: 5 },
    });

    assert.equal(parsed.success, false);
  });

  it("requires one of the two shipment shapes, and names what is missing", () => {
    const parsed = internationalRateRequestSchema.safeParse({
      ...valid(),
      shipment: { weight: 2 },
    });

    assert.equal(parsed.success, false);
    assert.ok(
      !parsed.success &&
        parsed.error.issues.some((i) => i.message.includes("shipment.packages")),
    );
  });

  it("refuses an import, and points at the domestic endpoint for IN to IN", () => {
    const inbound = internationalRateRequestSchema.safeParse({
      ...valid(),
      origin: { city: "Dubai", countryCode: "AE" },
    });
    assert.equal(inbound.success, false);

    const domestic = internationalRateRequestSchema.safeParse({
      ...valid(),
      destination: { city: "Delhi", countryCode: "IN" },
    });
    assert.equal(domestic.success, false);
    assert.ok(
      !domestic.success &&
        domestic.error.issues.some((i) => i.message.includes("/api/v1/rates/domestic")),
    );
  });

  it("rejects weights and dimensions outside the cost ceilings", () => {
    assert.equal(
      internationalRateRequestSchema.safeParse({
        ...valid(),
        shipment: { ...valid().shipment, weight: 5000 },
      }).success,
      false,
    );

    assert.equal(
      internationalRateRequestSchema.safeParse({
        ...valid(),
        shipment: { ...valid().shipment, weight: 0 },
      }).success,
      false,
    );
  });

  it("collapses packages[] to a total weight and the largest box", () => {
    const parsed = internationalRateRequestSchema.parse({
      ...valid(),
      shipment: {
        packages: [
          { quantity: 2, weightKg: 2, lengthCm: 30, widthCm: 20, heightCm: 10 },
          { quantity: 1, weightKg: 5, lengthCm: 50, widthCm: 40, heightCm: 30 },
        ],
      },
    });

    const canonical = toCanonicalInternational(parsed);

    // 2 kg x 2 boxes + 5 kg x 1 = 9 kg across 3 boxes.
    assert.equal(canonical.shipment.weight, 9);
    assert.equal(canonical.shipment.quantity, 3);
    // Largest by volume, so the representative box never understates the parcel.
    assert.equal(canonical.shipment.dimensions.length, 50);
    // The array survives for adapters that take it natively.
    assert.equal(canonical.shipment.packages?.length, 2);
  });
});

// ---------------------------------------------------------------------------

describe("domestic rate request", () => {
  const valid = () => ({
    origin: { pincode: "400001" },
    destination: { pincode: "110001" },
    shipment: {
      weight: 1,
      quantity: 1,
      dimensions: { length: 20, width: 15, height: 10, unit: "cm" },
    },
  });

  it("accepts a PIN code pair with no city", () => {
    const parsed = domesticRateRequestSchema.safeParse(valid());
    assert.equal(parsed.success, true);
  });

  it("defaults the city to the PIN and the country to IN", () => {
    const canonical = toCanonicalDomestic(domesticRateRequestSchema.parse(valid()));

    assert.equal(canonical.origin.city, "400001");
    assert.equal(canonical.origin.countryCode, "IN");
  });

  it("rejects a malformed PIN code", () => {
    for (const pincode of ["40001", "0400001", "4000011", "ABC123"]) {
      assert.equal(
        domesticRateRequestSchema.safeParse({
          ...valid(),
          origin: { pincode },
        }).success,
        false,
        `${pincode} must not pass`,
      );
    }
  });

  it("requires codAmount when the shipment is COD", () => {
    // COD has to be PRICED as COD: the collection fee varies by courier, so a
    // prepaid quote switched to COD later is the wrong number.
    const missing = domesticRateRequestSchema.safeParse({
      ...valid(),
      shipment: { ...valid().shipment, paymentType: "COD" },
    });
    assert.equal(missing.success, false);

    const supplied = domesticRateRequestSchema.safeParse({
      ...valid(),
      shipment: { ...valid().shipment, paymentType: "COD", codAmount: 2500 },
    });
    assert.equal(supplied.success, true);
  });

  it("defaults to prepaid", () => {
    const parsed = domesticRateRequestSchema.parse(valid());
    assert.equal(parsed.shipment.paymentType, "PREPAID");
  });
});

// ---------------------------------------------------------------------------

describe("tracking query", () => {
  it("accepts the number formats a customer actually holds", () => {
    for (const query of ["ARN260130748291", "1234567890", "SHP-2026-00042", "176-12345678"]) {
      assert.equal(trackQuerySchema.safeParse({ query }).success, true, query);
    }
  });

  it("rejects anything that is not waybill-shaped", () => {
    // These never reach the database query or the vendor fan-out.
    for (const query of ["'; DROP TABLE", "<script>", "abc def", "a".repeat(60)]) {
      assert.equal(trackQuerySchema.safeParse({ query }).success, false, query);
    }
  });
});

// ---------------------------------------------------------------------------

describe("response scrubbing", () => {
  it("masks a vendor name that survived the shaping, anywhere in the payload", async () => {
    // The guard exists because masking field-by-field is only as good as the
    // list of fields somebody remembered, and vendor names turn up inside text
    // we did not write: a courier's own event description, a vendor's error.
    const { scrubVendorBrands } = await import("@/lib/publicApi/serialize");

    const scrubbed = scrubVendorBrands(
      {
        tracking: {
          events: [{ description: "Handed over to sKart hub" }],
          legs: [{ carrier: "Shipmozo Surface" }],
        },
      },
      "test",
    );

    const asText = JSON.stringify(scrubbed);
    assert.equal(asText.includes("sKart"), false, "an unlicensed vendor must be stripped");
    assert.equal(asText.includes("Shipmozo"), false, "a white-labelled vendor must be renamed");
    // Stripping must not destroy the sentence around it.
    assert.ok(asText.includes("Handed over to"));
  });

  it("leaves a payload with no vendor name untouched", async () => {
    const { scrubVendorBrands } = await import("@/lib/publicApi/serialize");

    const input = { quotes: [{ service: "DHL Express", totalWithTax: 1200 }] };
    assert.deepEqual(scrubVendorBrands(input, "test"), input);
  });
});

// ---------------------------------------------------------------------------

describe("destination postcode", () => {
  // Uses a destination that HAS a postal system, so the postcode rule is the
  // only thing under test.
  const toGermany = (destination: Record<string, unknown>) => ({
    origin: { city: "Mumbai", countryCode: "IN", pincode: "400001" },
    destination,
    shipment: {
      weight: 2,
      quantity: 1,
      dimensions: { length: 30, width: 20, height: 10, unit: "cm" },
    },
  });

  it("requires a destination pincode where a postal system exists", () => {
    const parsed = internationalRateRequestSchema.safeParse(
      toGermany({ city: "Berlin", countryCode: "DE" }),
    );

    assert.equal(parsed.success, false);
    assert.ok(
      !parsed.success &&
        parsed.error.issues.some((i) => i.path.join(".") === "destination.pincode"),
      "the failure must name the field, not just reject the body",
    );
  });

  it("accepts one when it is supplied, and passes it through untouched", () => {
    const parsed = internationalRateRequestSchema.parse(
      toGermany({ city: "Berlin", countryCode: "DE", pincode: "10115" }),
    );

    assert.equal(toCanonicalInternational(parsed).destination.pincode, "10115");
  });

  it("does not demand one from a country that has no postal system", () => {
    // Asking a caller shipping to Dubai for a postcode is asking them to invent
    // one. The requirement is about accuracy, not about form completeness.
    for (const countryCode of ["AE", "HK", "QA"]) {
      const parsed = internationalRateRequestSchema.safeParse(
        toGermany({ city: "Dubai", countryCode }),
      );
      assert.equal(parsed.success, true, countryCode + " must not require a postcode");
    }
  });

  it("fills the synthetic postcode for those countries", () => {
    // The vendors demand the field be present, so something has to go in it.
    const parsed = internationalRateRequestSchema.parse(
      toGermany({ city: "Dubai", countryCode: "AE" }),
    );

    assert.equal(
      toCanonicalInternational(parsed).destination.pincode,
      SYNTHETIC_POSTCODE,
    );
  });

  it("still lets a caller send the synthetic value explicitly", () => {
    // The no-postcode list is a convenience and it will drift. A caller who
    // knows better must always be able to say so rather than be blocked by it.
    const parsed = internationalRateRequestSchema.safeParse(
      toGermany({ city: "Lagos", countryCode: "NG", pincode: SYNTHETIC_POSTCODE }),
    );

    assert.equal(parsed.success, true);
  });

  it("agrees with the rate sweep about which countries have no postcode", () => {
    // The sweep already decided this for its own destinations and sends the
    // same placeholder. If the two lists disagree, a live quote and a swept row
    // stop describing the same request. Checked by membership, never by count:
    // the sweep's country list grows.
    const synthetic = SWEEP_COUNTRIES.filter((c) => c.syntheticPostcode === true);

    for (const country of synthetic) {
      assert.equal(
        countryHasNoPostcode(country.code),
        true,
        country.code + " is synthetic in the sweep but not in lib/publicApi/postcodes",
      );
    }
  });

  it("does not list Ireland, which has had Eircodes since 2015", () => {
    // A guard on the specific mistake this list invites: copying a stale UPU
    // table without checking what has changed since.
    assert.equal(countryHasNoPostcode("IE"), false);
    assert.equal(noPostcodeCountryCodes().includes("IE"), false);
  });
});

// ---------------------------------------------------------------------------

describe("quote pass-through", () => {
  const quote = {
    vendorId: "skart",
    vendorName: "sKart Express",
    productName: "sKartedge International",
    courierId: "4412",
    currency: "INR",
    totalWithTax: 2360,
    totalWithoutTax: 2000,
    tatDays: 5,
    charges: [
      {
        name: "Freight",
        amount: 2000,
        currency: "INR",
        cgst: 180,
        sgst: 180,
      },
      {
        name: "Fuel Surcharge",
        amount: 150,
        currency: "INR",
        taxAmount: 27,
      },
    ],
  };

  it("keeps every tax field the vendor set, split as the vendor split it", async () => {
    // The vendor is the only authority on which heads a charge falls under, so
    // a split that reaches an invoice must be the one they reported.
    const { toPublicQuote } = await import("@/lib/publicApi/serialize");

    const [freight, fuel] = toPublicQuote(quote, 0).charges;

    assert.equal(freight.cgst, 180);
    assert.equal(freight.sgst, 180);
    assert.equal(freight.igst, undefined, "an unreported head must stay absent");
    assert.equal(
      freight.taxAmount,
      undefined,
      "a combined figure the vendor did not report must not be derived",
    );

    assert.equal(fuel.taxAmount, 27);
    assert.equal(fuel.cgst, undefined);
  });

  it("passes the source's own service id through", async () => {
    const { toPublicQuote } = await import("@/lib/publicApi/serialize");
    assert.equal(toPublicQuote(quote, 0).courierId, "4412");
  });

  it("still never names the sourcing vendor", async () => {
    // Passing more through is not the same as passing the vendor through.
    const { toPublicQuote } = await import("@/lib/publicApi/serialize");

    const asText = JSON.stringify(toPublicQuote(quote, 0));

    assert.equal(asText.includes("sKart"), false);
    assert.equal(asText.includes("skart"), false);
    assert.equal(asText.includes("vendorName"), false);
    assert.equal(asText.includes("vendorId"), false);
  });

  it("returns every service it is given, in the order given", async () => {
    // The fan-out is already sorted cheapest first. Nothing here reorders,
    // dedupes or drops a service: two near-identical rows from two sources are
    // two genuinely purchasable options, not a duplicate to collapse.
    const { toPublicQuote } = await import("@/lib/publicApi/serialize");

    const services = [
      { ...quote, productName: "DHL Express", totalWithTax: 2100 },
      { ...quote, productName: "DHL Express", totalWithTax: 2360 },
      { ...quote, productName: "FedEx IP", totalWithTax: 2500 },
    ];

    const out = services.map(toPublicQuote);

    assert.equal(out.length, 3);
    assert.deepEqual(
      out.map((q) => q.totalWithTax),
      [2100, 2360, 2500],
    );
  });
});

// ---------------------------------------------------------------------------
// What the adapters need
// ---------------------------------------------------------------------------
// These are the fields a request has to carry for the international sources to
// answer at all. Every one of them was optional in the first cut of this
// schema, which is how a valid-looking request came back with no sKart and no
// Shipmozo quotes: the endpoint validated fine and the vendors refused.

describe("what the international adapters need", () => {
  const body = (over: {
    origin?: Record<string, unknown>;
    destination?: Record<string, unknown>;
  } = {}) => ({
    origin: { city: "New Delhi", pincode: "110077", countryCode: "IN", ...over.origin },
    destination: { city: "Sydney", pincode: "2000", countryCode: "AU", ...over.destination },
    shipment: {
      packages: [{ quantity: 1, weightKg: 2, lengthCm: 25, widthCm: 20, heightCm: 15 }],
    },
  });

  it("refuses an export with no origin PIN rather than quoting nobody", () => {
    const withoutPin = body();
    delete (withoutPin.origin as Record<string, unknown>).pincode;

    const parsed = internationalRateRequestSchema.safeParse(withoutPin);
    assert.equal(parsed.success, false);
    assert.equal(
      parsed.success === false &&
        parsed.error.issues.some((i) => i.path.join(".") === "origin.pincode"),
      true,
    );
  });

  it("refuses an origin PIN that is not an Indian one", () => {
    const parsed = internationalRateRequestSchema.safeParse(
      body({ origin: { pincode: "2000" } }),
    );
    assert.equal(parsed.success, false);
  });

  it("names both countries in full for the sources that are sent a name", () => {
    const parsed = internationalRateRequestSchema.safeParse(body());
    assert.equal(parsed.success, true);

    const canonical = toCanonicalInternational(parsed.success ? parsed.data : (() => {
      throw new Error("unreachable");
    })());

    assert.equal(canonical.origin.country, "INDIA");
    assert.equal(canonical.destination.country, "AUSTRALIA");
  });

  it("prefers the name we hold for the code over whatever the caller typed", () => {
    // "UAE" is in no vendor catalogue. The code is the validated field, so it
    // decides, and the caller's spelling cannot narrow their own results.
    const parsed = internationalRateRequestSchema.safeParse(
      body({ destination: { countryCode: "AE", country: "UAE", pincode: "00000" } }),
    );
    assert.equal(parsed.success, true);

    const canonical = toCanonicalInternational(parsed.success ? parsed.data : (() => {
      throw new Error("unreachable");
    })());

    assert.equal(canonical.destination.country, "UNITED ARAB EMIRATES");
  });

  it("falls back to the caller's name for a code we hold no name for", () => {
    // XK (Kosovo) is not in our list. Their word is better than nothing.
    const parsed = internationalRateRequestSchema.safeParse(
      body({ destination: { countryCode: "XK", country: "Kosovo", pincode: "10000" } }),
    );
    assert.equal(parsed.success, true);

    const canonical = toCanonicalInternational(parsed.success ? parsed.data : (() => {
      throw new Error("unreachable");
    })());

    assert.equal(hasCountryName("XK"), false);
    assert.equal(canonical.destination.country, "KOSOVO");
  });

  it("leaves the name undefined when neither we nor the caller have one", () => {
    const parsed = internationalRateRequestSchema.safeParse(
      body({ destination: { countryCode: "XK", pincode: "10000" } }),
    );
    assert.equal(parsed.success, true);

    const canonical = toCanonicalInternational(parsed.success ? parsed.data : (() => {
      throw new Error("unreachable");
    })());

    assert.equal(canonical.destination.country, undefined);
  });
});

describe("shipmozo country resolution", () => {
  // Shaped exactly like a row of the live GET /countries payload.
  const catalogue = [
    { id: 13, name: "Australia", phone_code: "+61", country_code: "AU", iso_code: "AUS" },
    { id: 256, name: "Bonaire, Sint Eustatius and Saba", phone_code: "+599", country_code: "BQ", iso_code: "BES" },
  ];

  it("resolves on the alpha-2 code the payload actually carries", () => {
    assert.equal(matchShipmozoCountry(catalogue, "AU")?.id, 13);
  });

  it("resolves on the alpha-3 code", () => {
    assert.equal(matchShipmozoCountry(catalogue, "AUS")?.id, 13);
  });

  it("still resolves on the name, for a code it does not list", () => {
    assert.equal(matchShipmozoCountry(catalogue, "ZZ", "AUSTRALIA")?.id, 13);
  });

  it("does not invent a match for a country the catalogue omits", () => {
    assert.equal(matchShipmozoCountry(catalogue, "NZ", "NEW ZEALAND"), undefined);
  });

  it("matches a code-only request, which is what a partner sends", () => {
    // The regression this guards: with no country name, a resolver that reads
    // only iso2/iso3/code finds nothing here and the lane reports NO_SERVICE.
    assert.notEqual(matchShipmozoCountry(catalogue, "BQ", undefined), undefined);
  });
});
