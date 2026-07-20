import "server-only";

import { ShipmentStatus } from "@/generated/prisma";

/**
 * Everything the template needs to render a status email. Assembled from the
 * Shipment row + its addresses in send.ts, so the template and copy never
 * touch Prisma directly.
 */
export interface ShipmentEmailContext {
  shipmentNumber: string;
  /** First name preferred; falls back to a warm generic in the template. */
  senderName: string | null;
  originLabel: string; // "New Delhi, India"
  destinationLabel: string; // "Dubai, UAE"
  serviceName: string | null; // carrier/product, e.g. "DHL Express Worldwide"
  pieces: number; // number of boxes
  weightLabel: string | null; // "12.50 kg"
  trackingNumber: string | null; // HAWB, once ops has it
  trackingUrl: string | null; // carrier public tracking page, once available
}

export interface MilestoneCopy {
  subject: string;
  /** Hidden inbox-preview line shown after the subject in most clients. */
  preheader: string;
  /** Big line at the top of the card. */
  headline: string;
  /** Body paragraphs, in order. Plain sentences, no markup. */
  paragraphs: string[];
  /** Optional "what happens next" checklist. Empty = section hidden. */
  nextSteps: string[];
  /** Whether to surface the tracking number / button (when data exists). */
  showTracking: boolean;
  /** Small reassurance line under the header badge. */
  statusLabel: string;
}

/**
 * The only statuses that email the customer. Anything not here (DRAFT,
 * PENDING_PAYMENT, DOCUMENTS_PENDING, CUSTOMS_HOLD, ON_HOLD, CANCELLED)
 * returns null and sends nothing.
 */
export const EMAIL_MILESTONES: ReadonlySet<ShipmentStatus> = new Set([
  ShipmentStatus.BOOKED,
  ShipmentStatus.PROCESSING,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
]);

export function isEmailMilestone(status: ShipmentStatus): boolean {
  return EMAIL_MILESTONES.has(status);
}

/**
 * Returns the copy for a milestone status, or null if this status does not
 * warrant a customer email. Language is intentionally warm and specific so it
 * reads as if a coordinator wrote it, not a system.
 */
export function getMilestoneCopy(
  status: ShipmentStatus,
  ctx: ShipmentEmailContext,
): MilestoneCopy | null {
  const route = `${ctx.originLabel} to ${ctx.destinationLabel}`;

  switch (status) {
    case ShipmentStatus.BOOKED:
      return {
        subject: `Your shipment is confirmed (${ctx.shipmentNumber})`,
        preheader: `We have your booking for ${route} and our team is already on it.`,
        headline: "Your shipment is confirmed",
        statusLabel: "Booked",
        paragraphs: [
          `Thank you for booking with us. We have received your shipment ${ctx.shipmentNumber} from ${route}, and it now has our full attention.`,
          `Here is what happens next. Our team will confirm your booking directly with the carrier and generate your airway bill. This usually takes a little time, so please do not worry if you do not see a tracking number right away. As soon as your airway bill is issued, we will send it to you along with everything you need to follow the journey.`,
          `You are in good hands. If anything at all comes up in the meantime, simply reply to this email and a real person on our team will get back to you.`,
        ],
        nextSteps: [
          "We confirm your shipment with the carrier",
          "We generate and share your airway bill",
          "You receive tracking details and can follow every step",
        ],
        showTracking: false,
      };

    case ShipmentStatus.PROCESSING:
      return {
        subject: `We are preparing your shipment (${ctx.shipmentNumber})`,
        preheader: `Shipment ${ctx.shipmentNumber} is being processed and prepared for dispatch.`,
        headline: "We are preparing your shipment",
        statusLabel: "Processing",
        paragraphs: [
          `Good news. Your shipment ${ctx.shipmentNumber} is now being processed by our team.`,
          `We are coordinating with the carrier, preparing your documents and getting your airway bill ready. Once it is issued, your tracking details will be on their way to you so you can follow the shipment from ${route}.`,
          `We will keep you posted at every step. If you have any questions, just reply to this email.`,
        ],
        nextSteps: [
          "Carrier booking and documents are being finalised",
          "Your airway bill is being generated",
          "Tracking details follow as soon as they are ready",
        ],
        showTracking: false,
      };

    case ShipmentStatus.IN_TRANSIT:
      return {
        subject: `Your shipment is on its way (${ctx.shipmentNumber})`,
        preheader: `Shipment ${ctx.shipmentNumber} is now in transit toward ${ctx.destinationLabel}.`,
        headline: "Your shipment is on its way",
        statusLabel: "In transit",
        paragraphs: [
          `Your shipment ${ctx.shipmentNumber} is now in transit and moving from ${route}.`,
          ctx.trackingNumber
            ? `You can follow its progress using the tracking details below. We will continue to keep an eye on it from our side too.`
            : `We are tracking its progress closely and will share live tracking details with you shortly.`,
          `As always, reply to this email if there is anything you would like to know.`,
        ],
        nextSteps: [],
        showTracking: true,
      };

    case ShipmentStatus.OUT_FOR_DELIVERY:
      return {
        subject: `Your shipment is out for delivery (${ctx.shipmentNumber})`,
        preheader: `Shipment ${ctx.shipmentNumber} is on its final leg to ${ctx.destinationLabel}.`,
        headline: "Your shipment is out for delivery",
        statusLabel: "Out for delivery",
        paragraphs: [
          `Almost there. Your shipment ${ctx.shipmentNumber} is out for delivery and on its final leg to ${ctx.destinationLabel}.`,
          `Please make sure someone is available to receive it. If you need anything at this stage, reply to this email and we will help right away.`,
        ],
        nextSteps: [],
        showTracking: true,
      };

    case ShipmentStatus.DELIVERED:
      return {
        subject: `Your shipment has been delivered (${ctx.shipmentNumber})`,
        preheader: `Shipment ${ctx.shipmentNumber} has arrived safely at ${ctx.destinationLabel}.`,
        headline: "Your shipment has been delivered",
        statusLabel: "Delivered",
        paragraphs: [
          `Your shipment ${ctx.shipmentNumber} has been delivered safely to ${ctx.destinationLabel}. We hope everything arrived exactly as expected.`,
          `It was a pleasure handling this for you. When you are ready to send your next shipment, we would love to take care of it. Thank you for trusting us.`,
        ],
        nextSteps: [],
        showTracking: true,
      };

    default:
      return null;
  }
}
