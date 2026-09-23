/**
 * utils/aramex.test.ts
 *
 * Arena holds more than one Aramex contract, they quote different prices, and
 * they are invoiced separately. Everything pinned below exists to protect one
 * sentence: THE EXPORT IS BOOKED ON THE ACCOUNT THAT QUOTED IT.
 *
 * The failures these guard against are all quiet ones. Nothing crashes if the
 * account key changes spelling — bookings just start refusing, weeks after the
 * quotes that carried the old spelling were taken. Nothing crashes if the
 * customer-facing product name picks up the word "UPS" — it simply gets
 * published, because the branding layer passes big-4 carrier names through
 * untouched. Nothing crashes if a WCF date is parsed with its offset added — a
 * timeline is just five and a half hours wrong.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";

import {
  ARAMEX_ACCOUNT_DEFINITIONS,
  ARAMEX_CUSTOMER_PRODUCT_NAME,
  aramexAccountLabel,
  aramexAccountShortLabel,
} from "@/lib/aramex/accountKeys";
import {
  describeNotifications,
  looksLikeAramexAuthFailure,
  looksLikeAramexDuplicate,
} from "@/lib/aramex/notifications";
import {
  parseWcfDate,
  toAramexPropertyDate,
  toWcfDate,
} from "@/lib/aramex/wcfDate";
import { brandServiceName } from "@/lib/branding/serviceName";
import {
  cheapestComparableQuote,
  collapseSourcingAccounts,
} from "@/lib/rates/sourcingAccounts";
import type { RateQuote } from "@/lib/rate-adapters/core/types";
import type { AramexAccount } from "@/lib/aramex/accounts";
import type { CanonicalIntlBookingRequest } from "@/lib/booking-adapters/core/intl.types";
import { buildAramexBookingPayload } from "@/lib/booking-adapters/vendors/aramex/aramex.booking.mapper";
import { toPublicQuote } from "@/lib/publicApi/serialize";
import {
  aramexAccountHealthSnapshot,
  isAramexAccountSuspended,
  recordAramexAccountSuccess,
  recordAramexAuthFailure,
  resetAramexAccountHealth,
} from "@/lib/aramex/accountHealth";

// ---------------------------------------------------------------------------

/** Account labels contain "(" and ")", which are regex syntax. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m);
}

describe("account keys are persisted identifiers", () => {
  /**
   * These strings live in Shipment.selectedCourierId and
   * VendorRateSnapshot.courierId forever. Renaming one orphans every shipment
   * quoted on it: the booking adapter stops recognising the account that sold
   * the service and refuses the booking.
   *
   * If this test fails, the fix is almost certainly to revert the rename rather
   * than to update the expectation.
   */
  it("are exactly these, and are not renamed", () => {
    assert.deepEqual(
      ARAMEX_ACCOUNT_DEFINITIONS.map((d) => d.key),
      ["aramex-direct", "aramex-ups"],
    );
  });

  it("are unique", () => {
    const keys = ARAMEX_ACCOUNT_DEFINITIONS.map((d) => d.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("map an env suffix per account, with the original pair unsuffixed", () => {
    // The unsuffixed pair is the account this integration had before there was
    // more than one. It must stay unsuffixed or every existing deployment's
    // ARAMEX_ACCOUNT_NUMBER stops being read.
    const direct = ARAMEX_ACCOUNT_DEFINITIONS.find(
      (d) => d.key === "aramex-direct",
    );
    assert.equal(direct?.envSuffix, "");

    const suffixes = ARAMEX_ACCOUNT_DEFINITIONS.map((d) => d.envSuffix);
    assert.equal(new Set(suffixes).size, suffixes.length);
  });

  it("gives a short label for a surface that already names the vendor", () => {
    // The rate calculator's card sits beside a badge reading "Aramex", so the
    // long label would repeat the vendor on every row of a scanned list.
    assert.equal(aramexAccountShortLabel("aramex-direct"), "Direct account");
    assert.equal(aramexAccountShortLabel("aramex-ups"), "UPS account");
  });

  it("says nothing short for a key that is not ours", () => {
    // Rendered unconditionally on the rate card and the compare panel, so null
    // is what keeps the badge off every other vendor's row.
    assert.equal(aramexAccountShortLabel(null), null);
    assert.equal(aramexAccountShortLabel(undefined), null);
    assert.equal(aramexAccountShortLabel(""), null);
    assert.equal(aramexAccountShortLabel("1284"), null);
  });

  it("never lets a short label stand alone as a carrier name", () => {
    /**
     * A bare "UPS" beside a carrier logo and an "Aramex" badge reads as the
     * CARRIER rather than as which of our contracts quoted. Every short label
     * has to say what it is.
     */
    for (const def of ARAMEX_ACCOUNT_DEFINITIONS) {
      assert.match(def.shortLabel, /account/i, def.key);
    }
  });

  it("labels a known key and stays silent about everything else", () => {
    assert.equal(aramexAccountLabel("aramex-direct"), "Aramex account");
    assert.equal(aramexAccountLabel("aramex-ups"), "Aramex (UPS) account");

    // Every other vendor's courier id, and the rows that predate this feature.
    // The ops screen calls this unconditionally, so null is what keeps a
    // "Vendor account" row off a Shipmozo booking.
    assert.equal(aramexAccountLabel(null), null);
    assert.equal(aramexAccountLabel(undefined), null);
    assert.equal(aramexAccountLabel(""), null);
    assert.equal(aramexAccountLabel("   "), null);
    assert.equal(aramexAccountLabel("1284"), null);
    assert.equal(aramexAccountLabel("aramex"), null);
  });
});

describe("the customer-facing product name", () => {
  /**
   * THE LEAK THIS PREVENTS IS SUBTLE AND REAL.
   *
   * brandServiceName's first rule keeps big-4 carrier names (DHL/FedEx/UPS/
   * Aramex) intact, because that is what lets "UPS Promotional" through from a
   * reseller. So a product name containing "UPS" is NOT masked on its way to a
   * customer — it is published. Naming the account here would tell every
   * customer which of Arena's contracts carried their parcel.
   */
  it("names no account and no channel", () => {
    assert.doesNotMatch(ARAMEX_CUSTOMER_PRODUCT_NAME, /ups/i);
    assert.doesNotMatch(ARAMEX_CUSTOMER_PRODUCT_NAME, /direct/i);
    assert.doesNotMatch(ARAMEX_CUSTOMER_PRODUCT_NAME, /account/i);
    for (const def of ARAMEX_ACCOUNT_DEFINITIONS) {
      for (const label of [def.adminLabel, def.shortLabel]) {
        assert.doesNotMatch(
          ARAMEX_CUSTOMER_PRODUCT_NAME,
          new RegExp(escapeForRegExp(label), "i"),
        );
      }
    }
  });

  it("survives the branding layer unchanged, both accounts quoting the same", () => {
    // Aramex is a carrier as well as a vendor, so its name is kept. The point
    // of asserting it is that the string a customer reads is identical however
    // the quote was sourced.
    assert.equal(
      brandServiceName(ARAMEX_CUSTOMER_PRODUCT_NAME),
      ARAMEX_CUSTOMER_PRODUCT_NAME,
    );
  });

  it("is still classified as Aramex by the rate sweep's carrier rules", async () => {
    // The sweep groups on this. A rename that stopped matching /\baramex\b/
    // would file every Aramex rate under OTHER and drop it out of the
    // comparison tables without anything failing.
    const { detectCarrier } = await import("@/lib/rateSweep/carrier");
    assert.equal(detectCarrier(ARAMEX_CUSTOMER_PRODUCT_NAME), "ARAMEX");
  });
});

describe("WCF dates", () => {
  /**
   * `/Date(ms+0530)/` is milliseconds since the Unix epoch in UTC, followed by
   * the originating clock's offset. The offset is presentational. Adding it is
   * the classic bug and moves every Indian tracking event 5½ hours into the
   * future.
   */
  it("reads the epoch milliseconds and ignores the offset", () => {
    assert.equal(
      parseWcfDate("/Date(1705900653000+0530)/"),
      new Date(1705900653000).toISOString(),
    );

    // Same instant, different stated offset. Must produce the same answer.
    assert.equal(
      parseWcfDate("/Date(1705900653000-0800)/"),
      parseWcfDate("/Date(1705900653000+0530)/"),
    );

    // And with no offset at all.
    assert.equal(
      parseWcfDate("/Date(1705900653000)/"),
      new Date(1705900653000).toISOString(),
    );
  });

  it("passes ISO-8601 through, because Aramex is not consistent", () => {
    assert.equal(
      parseWcfDate("2024-08-22T09:42:28.000Z"),
      "2024-08-22T09:42:28.000Z",
    );
  });

  it("returns null rather than dating an unreadable scan to 1970", () => {
    // The adapter drops events with no timestamp. An epoch fallback would sort
    // them to the bottom of a customer's timeline instead, looking deliberate.
    assert.equal(parseWcfDate(null), null);
    assert.equal(parseWcfDate(undefined), null);
    assert.equal(parseWcfDate(""), null);
    assert.equal(parseWcfDate("   "), null);
    assert.equal(parseWcfDate("not a date"), null);
    assert.equal(parseWcfDate("/Date(abc)/"), null);
  });

  it("round-trips what we send against what we read", () => {
    // The booking call writes this format and the tracking call reads it. A
    // disagreement between the two shows up as a shipment dated 1970.
    const now = new Date("2026-09-23T04:30:00.000Z");
    assert.equal(parseWcfDate(toWcfDate(now)), now.toISOString());
  });

  it("formats an invoice date the way Aramex's customs properties want it", () => {
    assert.equal(toAramexPropertyDate("2026-09-23"), "09/23/2026");
    assert.equal(toAramexPropertyDate("2026-09-23T10:00:00Z"), "09/23/2026");
  });

  it("omits an invoice date it cannot read rather than inventing today", () => {
    // These land on a customs declaration. A guessed date is worse than none.
    assert.equal(toAramexPropertyDate(null), "");
    assert.equal(toAramexPropertyDate(""), "");
    assert.equal(toAramexPropertyDate("23-09-2026"), "");
    assert.equal(toAramexPropertyDate("nonsense"), "");
  });
});

describe("reading Aramex's notifications", () => {
  /**
   * Aramex answers HTTP 200 to everything, including refusals, so the free text
   * in Notifications is the only thing that separates a rotated PIN from an
   * unserviceable lane from a duplicate booking.
   */
  it("joins every notification into one readable sentence", () => {
    assert.equal(
      describeNotifications([
        { Code: "ERR01", Message: "Invalid account number" },
        { Code: "ERR02", Message: "City is required" },
      ]),
      "Invalid account number (ERR01); City is required (ERR02)",
    );
  });

  it("copes with the half-filled shapes Aramex actually sends", () => {
    assert.equal(describeNotifications([{ Code: "", Message: "Just a message" }]), "Just a message");
    assert.equal(describeNotifications([{ Code: "ERR09", Message: "" }]), "ERR09");
    assert.equal(describeNotifications([], "fallback"), "fallback");
    assert.equal(describeNotifications(null, "fallback"), "fallback");
  });

  describe("auth detection", () => {
    /**
     * Deliberately one-sided. A miss costs a sweep one wasted vendor run, which
     * the failure-rate alert catches. A false positive stops a vendor that was
     * working, so these stay narrow.
     */
    it("catches the credential wordings Aramex uses", () => {
      for (const message of [
        "Invalid credentials",
        "Invalid user name or password",
        "Invalid account",
        "Account Number is invalid",
        "Account PIN is incorrect",
        "Unauthorized",
        "Authentication failed",
      ]) {
        assert.ok(looksLikeAramexAuthFailure(message), message);
      }
    });

    it("does not fire on an ordinary rejection", () => {
      for (const message of [
        "Destination country is not serviced",
        "Invalid weight",
        "City is required",
        "Dimensions are invalid",
      ]) {
        assert.equal(looksLikeAramexAuthFailure(message), false, message);
      }
    });
  });

  describe("duplicate detection", () => {
    /**
     * This is the one that stops a retried booking becoming a second export.
     * Aramex enforces ForeignHAWB uniqueness, so a duplicate create is refused
     * — and an operator who reads "booking failed" for that goes and books it
     * again by hand, which is exactly what the constraint just prevented.
     */
    it("catches a refused duplicate reference", () => {
      for (const message of [
        "Duplicate ForeignHAWB",
        "Shipment already exists",
        "Reference already used",
        "This reference has already been used",
      ]) {
        assert.ok(looksLikeAramexDuplicate(message), message);
      }
    });

    it("does not fire on unrelated rejections", () => {
      // A false positive tells ops an AWB exists when none does, and sends them
      // hunting for it in the Aramex panel.
      for (const message of [
        "Invalid account number",
        "Destination country is not serviced",
        "Invalid weight",
      ]) {
        assert.equal(looksLikeAramexDuplicate(message), false, message);
      }
    });
  });
});

// ---------------------------------------------------------------------------

describe("cheapest account wins, and says which one it was", () => {
  /**
   * carrierBranding.md D10: cheapest wins, with no preference for Arena's own
   * direct channel. This is where that is enforced, and there should never be a
   * margin ordering in it.
   *
   * The adapter now returns EVERY account's price — Arena staff see them all —
   * so the choice is made when the list is reduced for a customer. These pin the
   * comparator; the suite below pins the reduction it is used by.
   */
  const quote = (key: string, total: number, currency = "INR"): RateQuote => ({
    vendorId: "aramex",
    vendorName: "Aramex",
    productName: ARAMEX_CUSTOMER_PRODUCT_NAME,
    currency,
    totalWithTax: total,
    totalWithoutTax: total * 0.82,
    tatDays: 0,
    charges: [],
    courierId: key,
  });

  it("picks the cheaper account", () => {
    const winner = cheapestComparableQuote([
      quote("aramex-direct", 4200),
      quote("aramex-ups", 3900),
    ]);
    assert.equal(winner?.courierId, "aramex-ups");
    assert.equal(winner?.totalWithTax, 3900);
  });

  it("does not prefer the direct channel when it is dearer", () => {
    const winner = cheapestComparableQuote([
      quote("aramex-ups", 3100),
      quote("aramex-direct", 5000),
    ]);
    assert.equal(winner?.courierId, "aramex-ups");
  });

  it("carries the winning account's key, which is what binds the booking", () => {
    // This value becomes Shipment.selectedCourierId and comes back to the
    // booking adapter as service.serviceId. Without it the export cannot be
    // billed to the contract that sold it.
    const winner = cheapestComparableQuote([quote("aramex-ups", 3900)]);
    assert.equal(winner?.courierId, "aramex-ups");
  });

  it("breaks a tie deterministically, on definition order", () => {
    // A lane that flipped between contracts from one quote to the next would
    // make the sweep's history unreadable.
    const first = cheapestComparableQuote([
      quote("aramex-direct", 4000),
      quote("aramex-ups", 4000),
    ]);
    const second = cheapestComparableQuote([
      quote("aramex-direct", 4000),
      quote("aramex-ups", 4000),
    ]);
    assert.equal(first?.courierId, "aramex-direct");
    assert.equal(second?.courierId, first?.courierId);
  });

  it("never compares across currencies", () => {
    /**
     * 60 USD is roughly ₹5,000 and would win a naive min() against ₹4,200 —
     * confidently wrong rather than merely unhelpful. Nothing here invents an
     * exchange rate, so the INR quotes are compared among themselves.
     */
    const winner = cheapestComparableQuote([
      quote("aramex-direct", 4200),
      quote("aramex-ups", 60, "USD"),
    ]);
    assert.equal(winner?.currency, "INR");
    assert.equal(winner?.courierId, "aramex-direct");
  });

  it("still answers when no account quoted in INR", () => {
    const winner = cheapestComparableQuote([
      quote("aramex-direct", 80, "USD"),
      quote("aramex-ups", 60, "USD"),
    ]);
    assert.equal(winner?.courierId, "aramex-ups");
  });

  it("returns null when no account produced a price", () => {
    assert.equal(cheapestComparableQuote([]), null);
  });
});

// ---------------------------------------------------------------------------

describe("the Aramex booking payload", () => {
  /**
   * What we declare to Aramex, and — the part this whole feature exists for —
   * WHICH CONTRACT IT IS BILLED TO.
   */
  const ACCOUNT: AramexAccount = {
    key: "aramex-ups",
    adminLabel: "Aramex (UPS) account",
    accountNumber: "GGN10771",
    accountPin: "111111",
    accountEntity: "GGN",
    accountCountryCode: "IN",
    userName: "ops@arenalogistics.co.in",
    password: "secret",
  };

  const OTHER_ACCOUNT: AramexAccount = {
    ...ACCOUNT,
    key: "aramex-direct",
    adminLabel: "Aramex account",
    accountNumber: "GGN10772",
  };

  function request(
    overrides: Partial<CanonicalIntlBookingRequest> = {},
  ): CanonicalIntlBookingRequest {
    return {
      reference: "shp_abc123",
      displayReference: "ARN260130748291",
      orderDate: "2026-08-01",
      pickup: {
        contactName: "Ajay Kumar",
        companyName: "Sgate Exports",
        phone: "+91 95825-29747",
        email: "ajay@example.com",
        line1: "K-99",
        line2: "Budh Vihar",
        city: "New Delhi",
        state: "Delhi",
        stateCode: null,
        postalCode: "110049",
        countryCode: "IN",
        countryName: "INDIA",
      },
      delivery: {
        contactName: "Sonu Verma",
        companyName: "Datamotive",
        phone: "61390001234",
        email: "sonu@example.com",
        line1: "12 Victoria Road",
        line2: "Suite 4",
        city: "Melbourne",
        state: "Victoria",
        stateCode: "VIC",
        postalCode: "3001",
        countryCode: "AU",
        countryName: "AUSTRALIA",
      },
      parcels: [
        {
          quantity: 2,
          weightKg: 2.4,
          lengthCm: 40,
          widthCm: 30,
          heightCm: 20,
          declaredValue: 4000,
          description: "Textiles",
        },
      ],
      totalActualWeightKg: 4.8,
      items: [
        {
          name: "Cotton scarf",
          quantity: 4,
          unitValue: 2000,
          hsCode: "62142010",
          boxNumber: 1,
          category: null,
        },
      ],
      customs: {
        shipmentType: "CSB4",
        incoterms: "DDP",
        exportType: "UT",
        termsOfInvoice: "FOB",
        invoiceNumber: "INV-ARN260130748291",
        invoiceDate: "2026-08-01",
        currency: "INR",
        declaredValue: 8000,
        freightAmount: 3200,
        insuranceAmount: null,
        ecommerce: false,
      },
      exporter: {
        iecNumber: "0388012345",
        adCode: "6390004",
        gstin: "07AAACH7409R1ZZ",
        lutNumber: "AD070424000123M",
        lutIssueDate: "2026-04-01",
        lutTillDate: "2027-03-31",
        iossNumber: null,
      },
      freightCharge: 3200,
      service: {
        vendorId: "aramex",
        serviceId: "aramex-ups",
        productName: ARAMEX_CUSTOMER_PRODUCT_NAME,
      },
      arenaHandlesFirstMile: true,
      ...overrides,
    };
  }

  const build = (
    overrides: Partial<CanonicalIntlBookingRequest> = {},
    account: AramexAccount = ACCOUNT,
  ) =>
    buildAramexBookingPayload(request(overrides), {
      account,
      now: new Date("2026-09-23T04:30:00.000Z"),
    });

  describe("billing", () => {
    /**
     * THE ONE THAT MATTERS. Aramex bills the account number on the Shipper, and
     * the accounts have different tariffs. Sending the wrong one means the
     * export is invoiced against a contract that never quoted it, at a price
     * nobody can tie back to the shipment.
     */
    it("bills the shipment to the account it was quoted on", () => {
      const payload = build();
      assert.equal(payload.Shipments[0].Shipper.AccountNumber, "GGN10771");
      assert.equal(payload.ClientInfo.AccountNumber, "GGN10771");
      assert.equal(payload.ClientInfo.AccountPin, "111111");
    });

    it("changes the billed account with the account, and nothing else", () => {
      const ups = build({}, ACCOUNT);
      const direct = build({}, OTHER_ACCOUNT);

      assert.equal(direct.Shipments[0].Shipper.AccountNumber, "GGN10772");
      assert.equal(direct.ClientInfo.AccountNumber, "GGN10772");

      // The consignment declared to each is identical. If these ever diverge,
      // the two accounts are being asked different questions and their prices
      // stop being comparable.
      assert.deepEqual(direct.Shipments[0].Details, ups.Shipments[0].Details);
      assert.deepEqual(direct.Shipments[0].Consignee, ups.Shipments[0].Consignee);
    });

    it("never puts an account number on the consignee", () => {
      // A populated Consignee.AccountNumber tells Aramex to bill the RECEIVER.
      assert.equal(build().Shipments[0].Consignee.AccountNumber, "");
    });

    it("is prepaid, with no third party to bill", () => {
      const shipment = build().Shipments[0];
      assert.equal(shipment.Details.PaymentType, "P");
      assert.equal(shipment.ThirdParty, null);
    });
  });

  describe("what is declared", () => {
    it("declares the true actual weight and the chargeable weight separately", () => {
      /**
       * Deliberately unlike the RATE call, which pushes the chargeable weight
       * through ActualWeight because some accounts ignore an explicit
       * ChargeableWeight. A booking is a declaration, so both numbers are stated
       * for what they are: 2 boxes × 2.4 kg actual, and 2 × (40×30×20 / 5000) =
       * 9.6 kg volumetric, which is the chargeable figure.
       */
      const details = build().Shipments[0].Details;
      assert.deepEqual(details.ActualWeight, { Unit: "KG", Value: 4.8 });
      assert.deepEqual(details.ChargeableWeight, { Unit: "KG", Value: 9.6 });
    });

    it("counts every box, not every box group", () => {
      // One parcel line of quantity 2 is two pieces. Declaring one would put a
      // single-piece label on a two-box consignment.
      assert.equal(build().Shipments[0].Details.NumberOfPieces, 2);
    });

    it("sends no Dimensions block, because one cannot describe many boxes", () => {
      // Sending one box's dimensions as if they described all of them would
      // understate the volume on the customs paperwork.
      assert.equal(build().Shipments[0].Details.Dimensions, null);
    });

    it("declares the shipment's customs value in its own currency", () => {
      assert.deepEqual(build().Shipments[0].Details.CustomsValueAmount, {
        CurrencyCode: "INR",
        Value: 8000,
      });
    });

    it("itemises the line total, not the unit price", () => {
      const item = build().Shipments[0].Details.Items[0];
      assert.equal(item.GoodsDescription, "Cotton scarf");
      assert.equal(item.Quantity, "4");
      assert.equal(item.CommodityCode, "62142010");
      // 4 × 2000. A unit price here understates the consignment fourfold.
      assert.deepEqual(item.CustomsValue, { CurrencyCode: "INR", Value: 8000 });
    });

    it("asks for Free Domicile only when the sender pays the duty", () => {
      // FRDM is Appendix C's "sender pays part or all of the customs charges".
      // On DDU the receiver pays, which is Aramex's default and needs no code —
      // sending FRDM there would bill Arena for the destination duty.
      assert.equal(build().Shipments[0].Details.Services, "FRDM");
      assert.equal(
        build({ customs: { ...request().customs, incoterms: "DDU" } })
          .Shipments[0].Details.Services,
        "",
      );
    });
  });

  describe("the customs properties", () => {
    const props = (overrides: Partial<CanonicalIntlBookingRequest> = {}) =>
      Object.fromEntries(
        build(overrides).Shipments[0].Details.AdditionalProperties.map((p) => [
          p.Name,
          p.Value,
        ]),
      );

    it("carries the commercial invoice in the format Aramex wants", () => {
      const p = props();
      assert.equal(p.InvoiceNumber, "INV-ARN260130748291");
      // MM/DD/YYYY, per their own samples. yyyy-mm-dd is silently misread.
      assert.equal(p.InvoiceDate, "08/01/2026");
    });

    it("carries the exporter's tax identity and bond status", () => {
      const p = props();
      assert.equal(p.ShipperTaxIdVATEINNumber, "07AAACH7409R1ZZ");
      assert.equal(p.RegisteredToGST, "1");
      assert.equal(p.ExporterType, "UT");
    });

    it("omits what we do not hold rather than declaring it empty", () => {
      /**
       * These land on an export declaration. An empty-stringed tax number does
       * not mean "unknown" to customs, it asserts the exporter has none.
       */
      const p = props({
        exporter: { iecNumber: null, adCode: null, gstin: null, iossNumber: null },
        customs: { ...request().customs, exportType: "NA" },
      });
      assert.equal(p.ShipperTaxIdVATEINNumber, undefined);
      assert.equal(p.RegisteredToGST, undefined);
      // "NA" means neither bond nor LUT applies, and saying "NA" to customs is
      // not the same as saying nothing.
      assert.equal(p.ExporterType, undefined);
      assert.equal(p.IOSS, undefined);
    });

    it("carries an IOSS registration when the consignment has one", () => {
      const p = props({
        exporter: { ...request().exporter, iossNumber: "IM3720000001" },
      });
      assert.equal(p.IOSS, "IM3720000001");
    });
  });

  describe("duplicate protection", () => {
    /**
     * Aramex enforces ForeignHAWB uniqueness, and that enforcement is the ONLY
     * thing standing between a retry-after-a-lost-response and a second export
     * at full price. They publish no lookup by our own reference.
     */
    it("sends our shipment number as the unique foreign waybill", () => {
      assert.equal(build().Shipments[0].ForeignHAWB, "ARN260130748291");
    });

    it("also carries the shipment number where ops will read it", () => {
      const payload = build();
      assert.equal(payload.Shipments[0].Reference1, "ARN260130748291");
      // Echoed back untouched, so a response we cannot otherwise match still
      // identifies its booking.
      assert.equal(payload.Transaction.Reference1, "shp_abc123");
    });
  });

  describe("contact details", () => {
    it("strips the punctuation a customer types into a phone number", () => {
      assert.equal(
        build().Shipments[0].Shipper.Contact.PhoneNumber1,
        "+919582529747",
      );
    });

    it("falls back to the person's name when there is no company", () => {
      // Aramex prints CompanyName on the label and the manifest, so an
      // individual sender must not leave a blank box on a customs document.
      const payload = build({
        pickup: { ...request().pickup, companyName: null },
      });
      assert.equal(payload.Shipments[0].Shipper.Contact.CompanyName, "Ajay Kumar");
    });

    it("passes the destination's state code through for countries that need one", () => {
      assert.equal(
        build().Shipments[0].Consignee.PartyAddress.StateOrProvinceCode,
        "VIC",
      );
    });
  });

  it("asks for the label as a link rather than inline base64", () => {
    const label = build().LabelInfo;
    assert.equal(label?.ReportType, "URL");
    assert.equal(label?.ReportID, 9729);
  });
});

// ---------------------------------------------------------------------------

describe("the account key never reaches a partner", () => {
  /**
   * The partner API publishes `courierId` verbatim, under an explicit promise
   * in its own type that the value "carries no branding".
   *
   * For every other vendor that holds: it is their numeric service id. Aramex's
   * is not a service id at all — it is Arena's name for WHICH OF OUR CONTRACTS
   * quoted, so publishing "aramex-ups" would tell an integrator how we sourced
   * the rate, and name a carrier while doing it.
   *
   * This is the test that keeps the promise true. Nothing is lost by
   * withholding it: the v1 API is rates, tracking and health, with no booking
   * endpoint, and the key is still stored and still drives the booking
   * internally.
   */
  const base: RateQuote = {
    vendorId: "aramex",
    vendorName: "Aramex",
    productName: ARAMEX_CUSTOMER_PRODUCT_NAME,
    currency: "INR",
    totalWithTax: 4200,
    totalWithoutTax: 3559,
    tatDays: 4,
    charges: [],
  };

  it("withholds every Aramex account key", () => {
    for (const def of ARAMEX_ACCOUNT_DEFINITIONS) {
      const published = toPublicQuote({ ...base, courierId: def.key }, 0);
      assert.equal(
        "courierId" in published,
        false,
        `${def.key} was published to a partner`,
      );
    }
  });

  it("names no Aramex account anywhere in the published row", () => {
    // Belt and braces: the assertion above only checks one field, and the
    // failure this guards against is the channel appearing at all.
    const published = JSON.stringify(
      toPublicQuote({ ...base, courierId: "aramex-ups" }, 0),
    );
    assert.doesNotMatch(published, /ups/i);
    assert.doesNotMatch(published, /aramex-/i);
  });

  it("still publishes an ordinary vendor's service id", () => {
    // The redaction must be surgical. A blanket drop would take away the
    // precision the field exists to give partners on every other vendor.
    const published = toPublicQuote(
      { ...base, vendorId: "shipmozo", courierId: "1284" },
      0,
    );
    assert.equal(published.courierId, "1284");
  });

  it("leaves a vendor that exposes no id exactly as it was", () => {
    assert.equal("courierId" in toPublicQuote(base, 0), false);
    assert.equal(toPublicQuote({ ...base, courierId: null }, 0).courierId, null);
  });
});

// ---------------------------------------------------------------------------

describe("collapsing sourcing accounts for a customer", () => {
  /**
   * The adapter reports every Aramex contract's price. This is the boundary
   * that decides who gets to see them.
   *
   * Two things must both hold, and they pull in opposite directions:
   *   - a customer sees exactly ONE Aramex row, and the payload must not even
   *     CONTAIN the other account's price;
   *   - no other vendor's options are touched, because two Shipmozo couriers at
   *     different prices are two genuinely purchasable services and merging
   *     them would delete a real choice.
   */
  const q = (
    over: Partial<RateQuote> & Pick<RateQuote, "vendorId" | "totalWithTax">,
  ): RateQuote => ({
    vendorName: over.vendorId,
    productName: ARAMEX_CUSTOMER_PRODUCT_NAME,
    currency: "INR",
    totalWithoutTax: over.totalWithTax * 0.82,
    tatDays: 4,
    charges: [],
    ...over,
  });

  const aramex = (key: string, total: number, currency = "INR") =>
    q({ vendorId: "aramex", courierId: key, totalWithTax: total, currency });

  it("leaves one Aramex row, the cheapest", () => {
    const out = collapseSourcingAccounts([
      aramex("aramex-direct", 4200),
      aramex("aramex-ups", 3900),
    ]);

    assert.equal(out.length, 1);
    assert.equal(out[0].courierId, "aramex-ups");
  });

  it("does not leave the losing account's price in the payload", () => {
    /**
     * The point of doing this server-side rather than hiding a row in the UI.
     * A customer-facing response must not carry the second price at all — the
     * same reason vendor errors are dropped on the server instead of with CSS.
     */
    const out = collapseSourcingAccounts([
      aramex("aramex-direct", 4200),
      aramex("aramex-ups", 3900),
    ]);

    assert.equal(JSON.stringify(out).includes("4200"), false);
  });

  it("never merges two real services from an ordinary vendor", () => {
    // Shipmozo courier ids, not account keys. Two different couriers.
    const quotes = [
      q({ vendorId: "shipmozo", courierId: "1284", productName: "DHL Express", totalWithTax: 5000 }),
      q({ vendorId: "shipmozo", courierId: "1299", productName: "FedEx IP", totalWithTax: 4000 }),
    ];
    assert.equal(collapseSourcingAccounts(quotes).length, 2);
  });

  it("never merges two quotes from one vendor that share a product name but are not accounts", () => {
    // Same vendor, same product, no account key on either. Not ours to collapse.
    const quotes = [
      q({ vendorId: "skart", productName: "sKartedge", totalWithTax: 5000 }),
      q({ vendorId: "skart", productName: "sKartedge", totalWithTax: 4000 }),
    ];
    assert.equal(collapseSourcingAccounts(quotes).length, 2);
  });

  it("leaves a list with no account quotes exactly as it was", () => {
    const quotes = [
      q({ vendorId: "skart", totalWithTax: 5000, productName: "DHL" }),
      q({ vendorId: "shipglobal", totalWithTax: 4000, productName: "UPS" }),
    ];
    assert.equal(collapseSourcingAccounts(quotes), quotes);
  });

  it("keeps every other vendor's quote, and its position", () => {
    const skart = q({ vendorId: "skart", productName: "DHL", totalWithTax: 5000 });
    const shipmozo = q({ vendorId: "shipmozo", productName: "FedEx", totalWithTax: 4400 });

    const out = collapseSourcingAccounts([
      skart,
      aramex("aramex-direct", 4200),
      shipmozo,
      aramex("aramex-ups", 3900),
    ]);

    assert.deepEqual(
      out.map((r) => r.vendorId),
      ["skart", "shipmozo", "aramex"],
    );
    assert.equal(out[0], skart);
    assert.equal(out[1], shipmozo);
  });

  it("collapses to one row even when the accounts quote in different currencies", () => {
    /**
     * The promise to a customer is ONE Aramex row. Two rows priced in two
     * currencies would break it while announcing that we hold two channels —
     * so currency is a tiebreak inside the comparison, never a reason to show
     * both.
     */
    const out = collapseSourcingAccounts([
      aramex("aramex-direct", 4200, "INR"),
      aramex("aramex-ups", 60, "USD"),
    ]);

    assert.equal(out.length, 1);
    assert.equal(out[0].currency, "INR");
  });

  it("is stable across repeated calls on a tie", () => {
    const run = () =>
      collapseSourcingAccounts([
        aramex("aramex-direct", 4000),
        aramex("aramex-ups", 4000),
      ])[0].courierId;

    assert.equal(run(), "aramex-direct");
    assert.equal(run(), run());
  });

  it("handles a single account with nothing to collapse against", () => {
    const out = collapseSourcingAccounts([aramex("aramex-direct", 4200)]);
    assert.equal(out.length, 1);
    assert.equal(out[0].courierId, "aramex-direct");
  });
});

// ---------------------------------------------------------------------------

describe("suspending one rejected account", () => {
  /**
   * The gap multi-account opened, and the reason this exists.
   *
   * With one account, a rotated PIN failed the call outright and the rate
   * sweep's AUTH_ERROR path abandoned the vendor for the run — that is what
   * stops six hundred rejected calls in a night, and Aramex locks accounts out
   * for that. With two accounts the other one keeps quoting, so the call
   * SUCCEEDS, nothing upstream ever learns, and the run completes looking
   * healthy while holding half a matrix.
   *
   * So the account is put aside on its own, without touching the working one.
   */
  beforeEach(() => resetAramexAccountHealth());
  after(() => resetAramexAccountHealth());

  const fail = (key: string, times: number) => {
    for (let i = 0; i < times; i += 1) {
      recordAramexAuthFailure(key, "Invalid account PIN");
    }
  };

  it("tolerates the first couple of rejections", () => {
    // One bad response must not take a contract out of service.
    fail("aramex-ups", 2);
    assert.equal(isAramexAccountSuspended("aramex-ups"), false);
  });

  it("puts an account aside after three in a row", () => {
    fail("aramex-ups", 3);
    assert.equal(isAramexAccountSuspended("aramex-ups"), true);
  });

  it("leaves every other account in service", () => {
    // THE WHOLE POINT. Stopping all of Aramex on one bad PIN would throw away
    // the working contract's rates for the entire run.
    fail("aramex-ups", 5);
    assert.equal(isAramexAccountSuspended("aramex-ups"), true);
    assert.equal(isAramexAccountSuspended("aramex-direct"), false);
  });

  it("alerts once, not once per call", () => {
    // Six hundred Sentry events for one rotated key is the same as none.
    const alerts = [1, 2, 3, 4, 5, 6].filter(() =>
      recordAramexAuthFailure("aramex-ups", "Invalid account PIN"),
    );
    assert.equal(alerts.length, 1);
  });

  it("clears the streak on any answered call", () => {
    /**
     * A working account must never accumulate its way to a suspension. Two
     * rejections separated by a success is not three in a row.
     */
    fail("aramex-ups", 2);
    recordAramexAccountSuccess("aramex-ups");
    fail("aramex-ups", 2);
    assert.equal(isAramexAccountSuspended("aramex-ups"), false);
  });

  it("puts a suspended account back in service once the window passes", () => {
    // A PIN corrected at 10am is used again by 10:30, with no deploy and no
    // restart.
    const t0 = Date.now();
    fail("aramex-ups", 3);
    assert.equal(isAramexAccountSuspended("aramex-ups", t0), true);
    assert.equal(
      isAramexAccountSuspended("aramex-ups", t0 + 31 * 60 * 1000),
      false,
    );
  });

  it("gives a recovered account a clean slate, not a hair trigger", () => {
    // Otherwise one stale failure would re-suspend it on the next call.
    const t0 = Date.now();
    fail("aramex-ups", 3);
    const later = t0 + 31 * 60 * 1000;
    isAramexAccountSuspended("aramex-ups", later);

    recordAramexAuthFailure("aramex-ups", "Invalid account PIN", later);
    assert.equal(isAramexAccountSuspended("aramex-ups", later), false);
  });

  it("reports what it is holding, for a health check", () => {
    fail("aramex-ups", 3);
    const snapshot = aramexAccountHealthSnapshot();
    assert.equal(snapshot["aramex-ups"].suspended, true);
    assert.equal(snapshot["aramex-ups"].consecutiveAuthFailures, 3);
  });
});
