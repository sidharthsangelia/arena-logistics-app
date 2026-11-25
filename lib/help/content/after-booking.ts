import "server-only";

import type { HelpArticle } from "../types";

export const afterBookingArticles: HelpArticle[] = [
  {
    slug: "shipments-list",
    title: "Your shipments",
    summary: "Find any shipment, see what needs attention, and filter by status.",
    category: "after-booking",
    order: 1,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/shipments" }],
    keywords: ["shipments", "list", "orders", "bookings", "search", "filter", "history"],
    updated: "2026.11.21",
    related: ["shipment-details", "shipment-statuses"],
    blocks: [
      {
        type: "p",
        text: "[Shipments](app:/shipments) lists everything your organisation has booked, newest first.",
      },
      {
        type: "list",
        items: [
          "The counts along the top show shipments **awaiting ops**, **processing**, **in transit** and **needing attention**.",
          "**Search** by shipment number, client or city.",
          "**Status** narrows the list to one or more statuses. **Reset** clears every filter.",
          "Click a row to open the shipment.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "**Needs attention** counts shipments that are on hold, held at customs or waiting for a document from you. Start there.",
      },
    ],
  },
  {
    slug: "shipment-details",
    title: "The shipment page",
    summary: "Everything about one shipment: status, documents, charges and history.",
    category: "after-booking",
    order: 2,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/shipments/[id]" }],
    keywords: ["shipment detail", "documents", "airway bill", "awb", "invoice download", "history", "charges", "breakdown"],
    updated: "2026.11.21",
    related: ["shipping-labels", "shipment-statuses", "tracking", "invoices"],
    blocks: [
      {
        type: "p",
        text: "Open any shipment from [Shipments](app:/shipments). The shipment number at the top (it starts with `ARN`) is what to quote whenever you contact us.",
      },
      {
        type: "table",
        head: ["Section", "What it shows"],
        rows: [
          ["Status", "Where the shipment is now, and the carrier's tracking number once issued"],
          ["Door pickup", "Progress of the collection leg, if you chose door pickup"],
          ["Addresses", "Sender, pickup, receiver and billing addresses as booked"],
          ["Packages", "Boxes, weights, declared value and the service"],
          ["Pricing", "What you paid; open **Show breakdown** for each charge"],
          ["Documents", "Shipping label, tax invoice and supporting documents to download"],
          ["Wallet", "Payments and refunds linked to this shipment"],
          ["Booking", "Type, customs category, cash on delivery, dates and reference"],
          ["History", "Every status change and carrier scan, newest first"],
        ],
      },
      {
        type: "p",
        text: "Opening the page also checks the carrier for new scans, so it is always the most up to date view. Use **Refresh** in History to check again.",
      },
    ],
  },
  {
    slug: "shipping-labels",
    title: "Shipping labels",
    summary: "When the label is ready, where to find it and how to attach it.",
    category: "after-booking",
    order: 3,
    audiences: ["standard", "ba"],
    keywords: ["label", "awb", "airway bill", "waybill", "print", "barcode", "sticker", "download label"],
    updated: "2026.11.21",
    related: ["shipment-details", "notifications"],
    blocks: [
      {
        type: "p",
        text: "The label carries the carrier's waybill number and barcode. Every parcel needs one attached before the courier collects it.",
      },
      {
        type: "steps",
        items: [
          { title: "Wait for the notification", body: "When the label is issued you get a notification and an email with the label attached. Domestic labels usually arrive within minutes of booking; international ones once the carrier issues the airway bill." },
          { title: "Open the shipment, then Documents", body: "The label is the first item under **Shipping label**. Until then it reads **Being issued**." },
          { title: "Print and attach", body: "Print on plain A4 or a label printer, and stick it flat on the largest side of the box. Cover it with clear tape, but not over the barcode." },
        ],
      },
      {
        type: "p",
        text: "Some shipments show two versions under **Shipping labels**: the carrier's own label and an Arena label with the same waybill and barcode. Print either one.",
      },
      {
        type: "callout",
        tone: "tip",
        text: "Sending several boxes? Each box needs a label. Print one per box unless the label says otherwise.",
      },
    ],
  },
  {
    slug: "shipment-statuses",
    title: "What each status means",
    summary: "The journey from booked to delivered, and what to do when one needs you.",
    category: "after-booking",
    order: 4,
    audiences: ["standard", "ba"],
    keywords: ["status", "booked", "processing", "documents pending", "in transit", "customs hold", "on hold", "out for delivery", "delivered", "cancelled", "stuck", "lifecycle"],
    updated: "2026.11.21",
    related: ["tracking", "faq-shipments"],
    blocks: [
      { type: "heading", text: "The normal journey" },
      {
        type: "flow",
        stages: [
          { label: "Booked" },
          { label: "Processing" },
          { label: "In transit" },
          { label: "Out for delivery" },
          { label: "Delivered", tone: "success" },
        ],
      },
      {
        type: "table",
        head: ["Status", "What it means", "Anything for you to do?"],
        rows: [
          ["[[badge:Booked]]", "We have your booking and payment. Our team is arranging the carrier.", "Get the parcel ready."],
          ["[[badge:Processing]]", "The carrier is being finalised and the airway bill prepared.", "Print the label as soon as it appears."],
          ["[[badge:In Transit]]", "The parcel has been collected and is moving to its destination.", "No."],
          ["[[badge:Out for Delivery]]", "Final leg. The courier is on the way to the receiver.", "Let the receiver know to be available."],
          ["[[badge:Delivered]]", "It has arrived.", "No."],
        ],
      },
      { type: "heading", text: "When something needs attention" },
      {
        type: "table",
        head: ["Status", "What it means", "What to do"],
        rows: [
          ["[[badge:Documents Pending]]", "We are missing something before the shipment can move.", "Open the shipment to see what is needed, and send or upload it."],
          ["[[badge:Customs Hold]]", "Customs has stopped the parcel, usually for a question about value, contents or documents.", "Our team handles it and contacts you if anything is needed from you. Reply quickly: storage charges can build up."],
          ["[[badge:On Hold]]", "The shipment is paused, for example over an address problem or a payment.", "Our team will explain. Check your email and notifications."],
          ["[[badge:Cancelled]]", "The shipment will not go ahead.", "Contact us if you did not expect this. Any refund goes back to your wallet."],
        ],
      },
      {
        type: "p",
        text: "Statuses move forward on their own as the carrier scans the parcel, so you do not need to ask us for updates. Each change also lands in your [notifications](help:notifications).",
      },
      {
        type: "callout",
        tone: "info",
        text: "With door pickup, the collection leg has its own short journey (scheduled, picked up, on the way to hub, at hub) shown above the main status. See [Door pickup](help:door-pickup).",
      },
    ],
  },
  {
    slug: "tracking",
    title: "Track a shipment",
    summary: "Track with your ARN shipment number or the carrier's tracking number.",
    category: "after-booking",
    order: 5,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/track" }],
    keywords: ["track", "tracking", "where is my parcel", "awb", "arn", "waybill", "tracking number", "timeline", "scan"],
    updated: "2026.11.21",
    related: ["shipment-statuses", "shipment-details"],
    blocks: [
      {
        type: "p",
        text: "Open [Track Shipment](app:/track) and enter either number. You do not need to know which is which.",
      },
      {
        type: "table",
        head: ["Number", "Looks like", "Where you find it"],
        rows: [
          ["Arena shipment number", "`ARN260130748291`", "Top of the shipment page, and in every email from us"],
          ["Carrier tracking number (AWB)", "Depends on the carrier", "On the label, and in the shipment's Status section"],
        ],
      },
      {
        type: "p",
        text: "The result is one timeline for the whole journey. With door pickup, the collection and the international flight are merged together, in order.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Just booked?",
        text: "Before the carrier issues a tracking number, your ARN still tracks: it shows the booking's own progress until the carrier's scans take over.",
      },
      {
        type: "p",
        text: "Your receiver can follow the parcel on the carrier's own website using the carrier tracking number.",
      },
    ],
  },
];
