import "server-only";

import { CSB4_MAX_VALUE } from "@/lib/booking/cargo";
import { SUPPORT_EMAIL, type HelpArticle } from "../types";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const troubleshootingArticles: HelpArticle[] = [
  {
    slug: "faq-booking",
    title: "Booking questions",
    summary: "Drafts, documents, categories and rates that will not load.",
    category: "troubleshooting",
    order: 1,
    audiences: ["standard", "ba"],
    keywords: ["problem", "error", "cannot book", "stuck", "draft", "missing", "no rates", "change booking", "edit booking"],
    updated: "2026.11.21",
    related: ["book-international", "book-domestic", "identity-documents"],
    blocks: [
      {
        type: "faq",
        items: [
          {
            q: "I closed the booking form halfway. Is my work lost?",
            a: "No. Every **Save & Next** saves your progress. Open [Book Shipment](app:/book) again and it picks up where you left off.",
          },
          {
            q: "The Rates step shows no services.",
            a: "Usually a postal code the carriers do not serve, or a box with a weight or size of zero. Go back and check both. If it still shows nothing, a destination may be temporarily unavailable; email us with the route and box sizes.",
          },
          {
            q: "Why can I not choose CSB-IV?",
            a: `Because the declared value is ${inr(CSB4_MAX_VALUE)} or more. Customs only allows CSB-IV below that. See [Customs categories](help:customs-categories).`,
          },
          {
            q: "The KYC step wants a document I already uploaded.",
            a: "Check it was uploaded to the right place: your own documents for your own bookings, and the client's documents when booking for a client. If it is your Aadhaar from before 25 September 2026, upload it once more with the number. See [Identity documents](help:identity-documents).",
          },
          {
            q: "It says my IEC or AD code is missing.",
            a: "CSB-V and Commercial exports need both. Add them in [Settings](app:/settings) under **Export documents**, then continue.",
          },
          {
            q: "Can I change a booking after paying?",
            a: "Not from the app, because the carrier has already been given the details. Email us straight away with the shipment number and the change. Addresses can often be corrected before the parcel is collected.",
          },
          {
            q: "Can I cancel a booking?",
            a: "Email us with the shipment number as soon as you can. If it can still be stopped, we cancel it and any refund goes back to your wallet.",
          },
          {
            q: "Do I need to fill in the boxes if I upload my own invoice?",
            a: "Yes. The boxes decide the price, the customs category and the documents needed, whatever invoice you attach.",
          },
        ],
      },
    ],
  },
  {
    slug: "faq-payments",
    title: "Wallet and payment questions",
    summary: "Top-ups that did not arrive, refunds, and charges you do not recognise.",
    category: "troubleshooting",
    order: 2,
    audiences: ["standard", "ba"],
    keywords: ["payment failed", "money deducted", "not credited", "refund", "pending", "charge", "double charge", "balance wrong"],
    updated: "2026.11.21",
    related: ["wallet", "invoices"],
    blocks: [
      {
        type: "faq",
        items: [
          {
            q: "My bank shows the money gone, but my wallet did not go up.",
            a: "Look in [Wallet](app:/wallet) history. **Pending** means the bank has not confirmed yet; it normally resolves within minutes. **Failed** means no money moved to us, and any amount your bank held is released by your bank, usually within a few working days. If it is still missing after a day, email us with the date, amount and your bank reference.",
          },
          {
            q: "When do I get a refund?",
            a: "When a shipment is cancelled before it moves, or our team agrees a correction. Refunds go back to your wallet and appear as **Refund** or **Added by Arena**.",
          },
          {
            q: "Can I withdraw my wallet balance?",
            a: "Email us. The wallet is meant for bookings, but our team can help if you no longer need the balance.",
          },
          {
            q: "There is a charge I do not recognise.",
            a: "Shipment lines show a short reference to the shipment they paid for, and each shipment's page lists its own payments and refunds under **Wallet**. If it is still unclear, email us the date and amount.",
          },
          {
            q: "Why is the GST on my invoice not shown as extra?",
            a: "Prices are GST inclusive. The invoice splits the amount you paid into taxable value and GST; the total does not change. See [What the price includes](help:prices-and-tax).",
          },
        ],
      },
    ],
  },
  {
    slug: "faq-shipments",
    title: "Shipment and delivery questions",
    summary: "Holds, missing labels, tracking that is not moving and failed deliveries.",
    category: "troubleshooting",
    order: 3,
    audiences: ["standard", "ba"],
    keywords: ["hold", "customs", "not moving", "no update", "label missing", "lost", "damaged", "delayed", "late", "returned", "rto", "not found"],
    updated: "2026.11.21",
    related: ["shipment-statuses", "tracking", "shipping-labels"],
    blocks: [
      {
        type: "faq",
        items: [
          {
            q: "My label has not appeared.",
            a: "Domestic labels usually arrive within minutes; international ones once the carrier issues the airway bill. You are notified either way. If a domestic label has not appeared within an hour, our team has been alerted already, but you are welcome to email us.",
          },
          {
            q: "Tracking has not moved for days.",
            a: "International parcels often go quiet between countries while in the air or waiting for customs. Open the shipment page, which checks the carrier again. If it still shows nothing new after several working days, email us with the shipment number.",
          },
          {
            q: "Tracking says not found.",
            a: "Check the number: Arena numbers start with `ARN`. A carrier number may take a few hours after booking to start working on the carrier's side. Your ARN always works.",
          },
          {
            q: "My shipment is held at customs. What now?",
            a: "Our team is already on it and will contact you if anything is needed from you, typically an invoice, a description of the goods or proof of value. Replying quickly keeps storage charges down.",
          },
          {
            q: "The receiver was not home.",
            a: "Carriers usually try again or leave a note. If the status shows the parcel returning to you, email us at once: it can sometimes be redirected.",
          },
          {
            q: "The parcel arrived damaged or something is missing.",
            a: "Email us as soon as you can after delivery, with the shipment number and photos of the box, the label and the contents. Keep the packaging until we reply.",
          },
          {
            q: "Who pays import duty at the destination?",
            a: "It depends on **Who pays duty on arrival** in your export documents: DDU means the receiver, DDP means you. Duty is never part of the price you pay at booking. See [What the price includes](help:prices-and-tax).",
          },
        ],
      },
    ],
  },
  {
    slug: "contact-support",
    title: "Contact support",
    summary: "How to reach us and what to include so we can help fast.",
    category: "troubleshooting",
    order: 9,
    audiences: ["standard", "ba"],
    keywords: ["support", "help", "contact", "email", "phone", "complaint", "talk to someone"],
    updated: "2026.11.21",
    blocks: [
      {
        type: "p",
        text: `Email **${SUPPORT_EMAIL}**. Include:`,
      },
      {
        type: "list",
        items: [
          "Your shipment number (starts with `ARN`), if it is about a shipment.",
          "Your organisation name.",
          "What you expected to happen and what happened instead.",
          "A screenshot, if something on screen looks wrong.",
        ],
      },
      {
        type: "p",
        text: "For anything urgent about a shipment that is already moving, say so in the subject line.",
      },
    ],
  },
];
