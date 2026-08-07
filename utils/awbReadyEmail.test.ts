/**
 * utils/awbReadyEmail.test.ts
 *
 * The "your airway bill is ready" email.
 *
 * This is the email that keeps the promise the booking confirmation makes, and
 * the customer acts on it: they print what it carries and stick it on a box. Two
 * things are therefore worth pinning.
 *
 *   1. The number in the email is labelled as a WAYBILL, not as tracking. The
 *      template's block is captioned "Tracking number" for every other email in
 *      the system, and this one overrides it. A silent regression there puts the
 *      wrong caption above the number a customs form is filled in from.
 *   2. The copy never promises an attachment that is not there. A shipment whose
 *      label could not be filed still gets the email, because the waybill number
 *      is the useful part — but telling someone to look for an attachment that
 *      does not exist is worse than not writing at all.
 *
 * Run: node --import tsx --test "utils/*.test.ts"
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAwbReadyCopy,
  type ShipmentEmailContext,
} from "@/lib/email/shipment/copy";
import {
  renderShipmentEmailHtml,
  renderShipmentEmailText,
} from "@/lib/email/shipment/template";
import type { EmailIdentity } from "@/lib/email/shipment/identity";

// ---------------------------------------------------------------------------

// Built here rather than imported from ./identity, which is `server-only`
// because it reads the configured from-address. None of these assertions are
// about the sender, so a fixed identity keeps the test independent of env.
const IDENTITY: EmailIdentity = {
  displayName: "Arena Cargo Logistics",
  fromHeader: "Arena Cargo Logistics <shipments@example.com>",
  replyTo: null,
  supportEmail: "shipments@example.com",
  signerName: "Adnan Ahmad",
  signerRole: "Founder",
  teamName: "The Arena Cargo Logistics Team",
};

function ctx(overrides: Partial<ShipmentEmailContext> = {}): ShipmentEmailContext {
  return {
    shipmentNumber: "ARN-2026-0042",
    senderName: "Adnan",
    originLabel: "New Delhi, India",
    destinationLabel: "Dubai, UAE",
    serviceName: "Express Worldwide",
    pieces: 3,
    weightLabel: "12.50 kg",
    trackingNumber: "1234567890",
    trackingUrl: "https://track.example.com/1234567890",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("getAwbReadyCopy", () => {
  it("labels the number as a waybill rather than as tracking", () => {
    const c = ctx();
    const copy = getAwbReadyCopy(c, {
      carrierName: "DHL Express",
      labelCount: 1,
    });

    assert.equal(copy.trackingLabel, "Airway bill number");
    assert.equal(copy.showTracking, true);

    const html = renderShipmentEmailHtml(copy, c, IDENTITY, null);
    assert.ok(html.includes("Airway bill number"));
    assert.ok(html.includes("1234567890"));
    // The generic caption must not survive the override.
    assert.ok(!html.includes("Tracking number"));

    const text = renderShipmentEmailText(copy, c, IDENTITY, null);
    assert.ok(text.includes("Airway bill number: 1234567890"));
  });

  it("names the carrier when there is one, and stays fluent when there is not", () => {
    const c = ctx();

    const withCarrier = getAwbReadyCopy(c, {
      carrierName: "DHL Express",
      labelCount: 1,
    });
    assert.ok(withCarrier.paragraphs[0].includes("confirmed with DHL Express"));

    const without = getAwbReadyCopy(c, { carrierName: null, labelCount: 1 });
    assert.ok(without.paragraphs[0].includes("It has now been confirmed and"));
    // No dangling preposition where the carrier name would have been.
    assert.ok(!without.paragraphs[0].includes("with  "));
    assert.ok(!without.paragraphs[0].includes("with the"));
  });

  it("promises an attachment only when one is actually attached", () => {
    const c = ctx();

    const attached = getAwbReadyCopy(c, {
      carrierName: "DHL Express",
      labelCount: 1,
    });
    assert.ok(attached.paragraphs[1].includes("attached to this email"));

    const notAttached = getAwbReadyCopy(c, {
      carrierName: "DHL Express",
      labelCount: 0,
    });
    assert.ok(!notAttached.paragraphs[1].includes("attached to this email"));
    assert.ok(notAttached.paragraphs[1].includes("on your shipment page"));
  });

  it("tells the reader what the second label is, and that one print is enough", () => {
    // A domestic booking attaches the carrier's label and Arena's rendering of
    // the same waybill. Two near-identical PDFs with no explanation is how a
    // customer ends up printing both and sticking both on the box.
    const copy = getAwbReadyCopy(ctx(), {
      carrierName: "Delhivery",
      labelCount: 2,
    });

    const paragraph = copy.paragraphs[1];
    assert.ok(paragraph.includes("Two versions of the same label"));
    assert.ok(paragraph.includes("identical waybill number"));
    // The instruction has to be singular, or it invites two labels on one box.
    assert.ok(paragraph.includes("print one"));
  });

  it("does not tell the reader to look below the list for the number", () => {
    // The tracking block renders ABOVE "what happens next", so a step saying
    // "the number below" points at the footer.
    const copy = getAwbReadyCopy(ctx(), {
      carrierName: null,
      labelCount: 1,
    });
    for (const step of copy.nextSteps) {
      assert.ok(!step.includes("below"), `next step points the wrong way: ${step}`);
    }
  });

  it("carries the shipment number in the subject, where a customer scans for it", () => {
    const copy = getAwbReadyCopy(ctx(), {
      carrierName: null,
      labelCount: 1,
    });
    assert.ok(copy.subject.includes("ARN-2026-0042"));
  });

  it("renders without a waybill URL, which many carriers do not give us", () => {
    const c = ctx({ trackingUrl: null });
    const copy = getAwbReadyCopy(c, {
      carrierName: "Skynet",
      labelCount: 1,
    });

    const html = renderShipmentEmailHtml(copy, c, IDENTITY, null);
    assert.ok(html.includes("1234567890"));
    assert.ok(!html.includes("Track your shipment"));
  });
});
