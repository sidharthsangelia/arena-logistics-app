import "server-only";

import {
  DOMESTIC_PROHIBITED_GROUPS,
  PROHIBITED_GROUPS,
} from "@/lib/booking/prohibitedItems";
import { CSB4_MAX_VALUE } from "@/lib/booking/cargo";
import { EWAY_BILL_THRESHOLD, EWAY_BILL_NUMBER_DIGITS } from "@/lib/booking/domesticDocs";
import type { HelpArticle } from "../types";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Booking. Thresholds are read from the same constants the booking form
 * enforces, so the guide cannot drift from the rule when a number changes.
 */
export const bookingArticles: HelpArticle[] = [
  {
    slug: "book-international",
    title: "Book an international shipment",
    summary: "Every step of the booking form for a parcel leaving India, in order.",
    category: "booking",
    order: 1,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/book" }],
    keywords: ["book", "booking", "export", "send abroad", "create shipment", "new shipment", "wizard", "form", "draft", "save and next", "resume"],
    updated: "2026.11.26",
    related: ["customs-categories", "identity-documents", "door-pickup", "book-domestic", "prohibited-items"],
    blocks: [
      {
        type: "p",
        text: "Open [Book Shipment](app:/book). The form is split into short steps shown along the top. **Save & Next** checks the step and saves your progress, so you can close the page and carry on later from where you stopped. If something is missing, the fields are marked in red and each mark clears as soon as you fix it.",
      },
      {
        type: "flow",
        stages: [
          { label: "Type" },
          { label: "Sender" },
          { label: "Receiver" },
          { label: "Items" },
          { label: "KYC" },
          { label: "Rates" },
          { label: "Pickup", hint: "Only with door pickup" },
          { label: "Review", tone: "success" },
        ],
      },
      { type: "heading", text: "1. Type" },
      { type: "p", text: "Choose **International**. (For India to India, see [Book a domestic shipment](help:book-domestic).)" },
      { type: "heading", text: "2. Sender" },
      {
        type: "list",
        items: [
          "**My Self** ships as your organisation. Your saved [contact details](help:profile-and-contact) fill in automatically.",
          "**Someone else** is for sending on behalf of a friend or relative. Type their details in. Your own KYC documents are used.",
        ],
      },
      {
        type: "p",
        audiences: ["ba"],
        text: "**A client** books for one of your saved clients: search for them and their details, saved addresses and KYC documents are used for this booking. See [Book for a client](help:book-for-client).",
      },
      {
        type: "p",
        text: "Tick **Collect from the sender's address** unless the parcel is collected from somewhere else.",
      },
      { type: "heading", text: "3. Receiver" },
      {
        type: "p",
        text: "Fill in who receives the parcel abroad, or click a saved address chip to fill it in. A phone number and email help the carrier deliver first time. Tick **Billing same as delivery** unless the receiver is billed at a different address.",
      },
      { type: "heading", text: "4. Items" },
      {
        type: "list",
        items: [
          "**Boxes**: a count for identical boxes, the weight of one box, then its length, breadth and height. Switch **Size in** between cm and inches. **How to measure** shows which side is which, and the **Common sizes** chips fill in a standard carton. Each box shows its size weight as you type, with a note if a number looks off. The summary bar shows the total declared value and [chargeable weight](help:chargeable-weight).",
          "**Contents**: inside each box, list every item with a description, HSN code, quantity and unit price. Pick the currency under **Values in**.",
          `**Customs category**: chosen for you from the declared value. Under ${inr(CSB4_MAX_VALUE)} it is CSB-IV; at ${inr(CSB4_MAX_VALUE)} or more you choose CSB-V or Commercial. See [Customs categories](help:customs-categories).`,
          "**Invoice**: let us build the commercial invoice and packing list from your boxes, or upload your own. Fill in the boxes either way; they decide the price and the KYC.",
          "**Door pickup**: tick it to have the parcel collected from your pickup address. Leave it off to drop the parcel at our hub yourself; our team shares the address. See [Door pickup](help:door-pickup).",
        ],
      },
      { type: "heading", text: "5. KYC" },
      {
        type: "p",
        text: "Shows the documents this customs category needs. Anything already on file appears as ready: confirm we may use it. Upload anything missing right here. A progress bar shows how many are done. See [Identity documents](help:identity-documents).",
      },
      { type: "heading", text: "6. Rates" },
      {
        type: "p",
        text: "Live prices for the exact parcel you entered. Sort, filter by carrier, open the charge breakdown, then pick one service.",
      },
      { type: "heading", text: "7. Pickup (door pickup only)" },
      {
        type: "p",
        text: "Pick the courier that collects the parcel from your door and takes it to our hub. The cheapest is selected for you. Its charge is added to the total.",
      },
      { type: "heading", text: "8. Review and pay" },
      {
        type: "p",
        text: "Check the route, addresses, items, documents, service and the **Total payable**. Tick the confirmation, which includes that nothing in your boxes is on the [prohibited items list](help:prohibited-items), then confirm. The total is taken from your wallet straight away.",
      },
      {
        type: "callout",
        tone: "tip",
        title: "Wallet short?",
        text: "The Review step shows how much more you need and offers a top-up for exactly that amount without leaving the form.",
      },
      {
        type: "callout",
        tone: "info",
        title: "Pay at the hub",
        text: "If Arena has set your account to pay later, there is no wallet charge at booking. The shipment is booked and marked **Payment pending**, and payment is collected when the parcel reaches our hub.",
      },
      { type: "heading", text: "What happens next" },
      {
        type: "p",
        text: "You get a shipment number starting with `ARN` and a confirmation email. The shipment appears under [Shipments](app:/shipments) as [[badge:Booked]]. Once the carrier issues the airway bill, your label appears under **Documents** on the shipment page and you are notified. See [Shipping labels](help:shipping-labels) and [What each status means](help:shipment-statuses).",
      },
    ],
  },
  {
    slug: "book-domestic",
    title: "Book a domestic shipment",
    summary: "India to India by courier: paperwork, cash on delivery and labels.",
    category: "booking",
    order: 2,
    audiences: ["standard", "ba"],
    keywords: ["domestic", "india", "within india", "courier", "cod", "cash on delivery", "e-way bill", "eway", "tax invoice", "delivery challan", "hsn"],
    updated: "2026.11.21",
    related: ["domestic-rates", "book-international", "shipping-labels", "prohibited-items"],
    blocks: [
      {
        type: "p",
        text: "Open [Book Shipment](app:/book) and choose **Domestic**. It is a door to door courier move inside India: the courier collects from your pickup address and delivers to the receiver.",
      },
      {
        type: "flow",
        stages: [
          { label: "Type" },
          { label: "Sender" },
          { label: "Receiver" },
          { label: "Items" },
          { label: "KYC", hint: "Individual senders only" },
          { label: "Rates" },
          { label: "Review", tone: "success" },
        ],
      },
      { type: "heading", text: "Company or individual sender" },
      {
        type: "p",
        text: "Whether the sender's **Company** field is filled in decides the paperwork. Fill it in only when a business is sending.",
      },
      {
        type: "table",
        head: ["", "Company sender", "Individual sender"],
        rows: [
          ["HSN code per item", "Required", "Optional"],
          ["Tax invoice", "Required, uploaded", "Not needed"],
          ["KYC step", "Skipped", "Aadhaar card only"],
          [`E-way bill over ${inr(EWAY_BILL_THRESHOLD)}`, "Required", "Required"],
          ["Delivery challan", "Optional", "Optional"],
        ],
      },
      {
        type: "p",
        text: `**E-way bill.** Once the declared value is over ${inr(EWAY_BILL_THRESHOLD)}, upload the e-way bill PDF from the GST portal and type its ${EWAY_BILL_NUMBER_DIGITS}-digit number.`,
      },
      { type: "heading", text: "Cash on delivery" },
      {
        type: "p",
        text: "On the Rates step you can choose **Cash on delivery**. The courier collects the value of your goods from the receiver and it is sent on to you. The shipping charge itself is still paid from your wallet when you book; it is not added to what the receiver pays.",
      },
      { type: "heading", text: "After you pay" },
      {
        type: "p",
        text: "The courier order is placed straight away. Within a few minutes the shipping label appears under **Documents** on the shipment page and you get a notification and email. Print it, attach it to the parcel and hand it to the courier when they arrive.",
      },
      {
        type: "callout",
        tone: "info",
        title: "If the label does not appear",
        text: "Now and then a courier cannot accept an order immediately. Your payment is safe and our team is alerted at once; we either retry with the same courier or contact you. We never switch you to a different courier without asking.",
      },
    ],
  },
  {
    slug: "customs-categories",
    title: "Customs categories: CSB-IV, CSB-V and Commercial",
    summary: "Which customs route your export takes, and what each one asks for.",
    category: "booking",
    order: 3,
    audiences: ["standard", "ba"],
    keywords: ["csb", "csb4", "csb-iv", "csb5", "csb-v", "commercial", "shipment type", "customs", "export type", "declared value", "25000"],
    updated: "2026.11.21",
    related: ["identity-documents", "export-documents"],
    blocks: [
      {
        type: "p",
        text: "Every export from India is filed with customs under a category. The booking form picks the category from the total declared value of your items, and you can change it within the rules below.",
      },
      {
        type: "table",
        head: ["Category", "When", "Typical use", "Documents"],
        rows: [
          ["CSB-IV", `Declared value under ${inr(CSB4_MAX_VALUE)}`, "Gifts, samples, small orders", "PAN, Aadhaar"],
          ["CSB-V", `Commercial courier exports, required at ${inr(CSB4_MAX_VALUE)} or more`, "Regular e-commerce or trade parcels", "PAN, Aadhaar, GST, IEC"],
          ["Commercial", "Any value, when you choose it", "Formal exports under a full shipping bill", "Company PAN, founder PAN and Aadhaar, GST, IEC, LUT"],
        ],
      },
      {
        type: "list",
        items: [
          `Under ${inr(CSB4_MAX_VALUE)}, CSB-IV is chosen for you.`,
          `Once the value reaches ${inr(CSB4_MAX_VALUE)}, the form moves you to CSB-V and CSB-IV can no longer be picked. If you lower the value again, it moves you back, unless you chose the category yourself.`,
          "Commercial can always be chosen by hand.",
        ],
      },
      {
        type: "p",
        text: "CSB-V and Commercial exports also need your IEC number and AD code on file. See [Export documents](help:export-documents).",
      },
    ],
  },
  {
    slug: "export-documents",
    title: "Export documents: IEC, AD code and LUT",
    summary: "The numbers larger exports are filed under, who pays duty, and where to enter them.",
    category: "booking",
    order: 4,
    audiences: ["standard", "ba"],
    keywords: ["iec", "ad code", "lut", "letter of undertaking", "import export code", "authorised dealer", "export profile", "zero rated", "ioss", "bond", "ddp", "ddu", "incoterms", "duty"],
    updated: "2026.11.21",
    related: ["customs-categories", "identity-documents", "prices-and-tax"],
    blocks: [
      {
        type: "p",
        text: "Most low-value parcels (CSB-IV) need none of the numbers below. Enter them only if you export under CSB-V or Commercial, claim zero-rated GST, or ship to the EU under IOSS.",
      },
      {
        type: "table",
        head: ["Field", "What it is", "Needed for"],
        rows: [
          ["IEC number", "Import Export Code from the DGFT", "CSB-V and Commercial"],
          ["AD code", "Your bank's Authorised Dealer code. Ties the consignment to the account the money comes back to", "CSB-V and Commercial"],
          ["IOSS number", "Registration for the EU import scheme", "Only if you are registered for it"],
          ["How the export is declared", "Neither applies, Under an LUT (zero-rated) or Under bond", "Neither applies is the usual choice for samples and gifts"],
          ["LUT number, issued on, valid until", "Acknowledgement of your Letter of Undertaking filing", "Only when declared under an LUT. Bookings are held without it"],
          ["Who pays duty on arrival", "DDU: the receiver pays. DDP: you pay", "Every international booking. See [What the price includes](help:prices-and-tax)"],
        ],
      },
      {
        type: "p",
        text: "Enter them in [Settings](app:/settings) under **Export documents**. A booking that needs them and finds them missing tells you which one before you pay.",
      },
      {
        type: "p",
        audiences: ["ba"],
        text: "For a client, enter them on the client's page instead. A client's own values are used ahead of yours, field by field, because the client is the exporter.",
      },
    ],
  },
  {
    slug: "door-pickup",
    title: "Door pickup for international shipments",
    summary: "Have the parcel collected from your address and brought to our hub.",
    category: "booking",
    order: 5,
    audiences: ["standard", "ba"],
    keywords: ["pickup", "collection", "first mile", "collect from home", "hub", "drop off"],
    updated: "2026.11.21",
    related: ["book-international", "shipment-statuses"],
    blocks: [
      {
        type: "p",
        text: "An international parcel first has to reach our hub, where it is handed to the international carrier. You can bring it yourself, or tick **Door pickup** on the Items step and we collect it.",
      },
      {
        type: "flow",
        stages: [
          { label: "Scheduled", hint: "Pickup booked" },
          { label: "Picked up", hint: "Collected from you" },
          { label: "To hub", hint: "On the way" },
          { label: "At hub", hint: "International leg begins", tone: "success" },
        ],
      },
      {
        type: "list",
        items: [
          "You choose the pickup courier on the **Pickup** step. The cheapest is selected for you.",
          "The pickup charge is added to the total you pay at review.",
          "Each stage shows on the shipment page and in your notifications, and the tracking page shows the pickup and the international journey as one timeline.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text: "When the pickup courier marks the parcel delivered, it means delivered to our hub, not to your receiver. The shipment keeps moving from there.",
      },
    ],
  },
  {
    slug: "prohibited-items",
    title: "Prohibited items",
    summary: "What carriers will not take, by air and within India.",
    category: "booking",
    order: 6,
    audiences: ["standard", "ba"],
    keywords: ["restricted", "banned", "dangerous goods", "battery", "liquid", "perfume", "medicine", "food", "not allowed", "hazardous"],
    updated: "2026.11.21",
    related: ["book-international", "book-domestic"],
    blocks: [
      {
        type: "p",
        text: "Some goods are refused by every carrier. Some are returned to you at your cost; others are illegal to send and can be seized. You confirm none are in your boxes when you book. The full searchable list, with examples, is behind the **prohibited items** link on the Review step.",
      },
      { type: "heading", text: "International (by air)" },
      {
        type: "table",
        head: ["Rule", "Why"],
        rows: PROHIBITED_GROUPS.map((g) => [g.title, g.note]),
      },
      {
        type: "p",
        text: "Destination countries add their own restrictions on top of these.",
      },
      { type: "heading", text: "Domestic (within India)" },
      {
        type: "table",
        head: ["Rule", "Why"],
        rows: DOMESTIC_PROHIBITED_GROUPS.map((g) => [g.title, g.note]),
      },
      {
        type: "callout",
        tone: "warning",
        text: "When in doubt, email us before you pack. It is far cheaper than a parcel stopped at the hub or by customs.",
      },
    ],
  },
];
