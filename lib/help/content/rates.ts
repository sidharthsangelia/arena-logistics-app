import "server-only";

import type { HelpArticle } from "../types";

export const ratesArticles: HelpArticle[] = [
  {
    slug: "international-rates",
    title: "Check international rates",
    summary: "Compare prices and transit times for a parcel leaving India.",
    category: "rates",
    order: 1,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/rates" }],
    keywords: ["price", "quote", "calculator", "cost", "export", "abroad", "compare", "transit time", "cheapest", "fastest"],
    updated: "2026.11.21",
    related: ["chargeable-weight", "prices-and-tax", "book-international"],
    blocks: [
      {
        type: "p",
        text: "[International Rates](app:/rates) shows what each of our services would charge for your parcel, side by side. Nothing is booked from this page.",
      },
      {
        type: "steps",
        items: [
          { title: "Sending from", body: "Your pincode in India. The city fills itself in." },
          { title: "Sending to", body: "The destination country and the receiver's postal code." },
          {
            title: "Your boxes",
            body: "For each box: weight in kg, and length, breadth and height. Switch **Size in** between cm and inches. Identical boxes go on one row with a count; add a row for each different size.",
          },
          { title: "Get rates", body: "Each service shows its total price, transit time and a charge breakdown." },
        ],
      },
      { type: "heading", text: "Reading the results" },
      {
        type: "list",
        items: [
          "**Sort** by price or speed, and switch between grid and list view.",
          "**Filter by carrier** with the chips above the results. Click a chip again to bring it back.",
          "**Best price** and **Fastest** badges mark the standouts across all results, whatever you have filtered.",
          "Prices show **including GST** and **excluding GST**. You pay the price including GST.",
          "Open **View charge breakdown** on a card to see freight, fuel and other charges.",
          "Tick cards to **compare** them in a side panel.",
        ],
      },
      {
        type: "p",
        audiences: ["ba"],
        text: "Business Associates also see **Get quote** on each card, which turns that price into a branded quote you can send to a client.",
      },
      {
        type: "callout",
        tone: "info",
        title: "These prices are a guide",
        text: "Rates are fetched live when you search. The booking form fetches them again for the exact parcel you enter, and the price on its Review step is the one you pay.",
      },
      {
        type: "callout",
        tone: "tip",
        text: "Light but bulky? You are charged by size, not weight, once the box is large enough. See [Chargeable weight](help:chargeable-weight).",
      },
    ],
  },
  {
    slug: "domestic-rates",
    title: "Check domestic rates",
    summary: "Compare courier prices between two Indian pincodes.",
    category: "rates",
    order: 2,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/domestic-rates" }],
    keywords: ["india", "pincode", "courier", "within india", "local", "price", "invoice value"],
    updated: "2026.11.21",
    related: ["book-domestic", "chargeable-weight"],
    blocks: [
      {
        type: "p",
        text: "[Domestic Rates](app:/domestic-rates) compares courier services for a parcel moving inside India.",
      },
      {
        type: "steps",
        items: [
          { title: "Pickup pincode and delivery pincode", body: "Both cities fill themselves in. If a pincode is not recognised, check it; couriers only quote serviceable pincodes." },
          {
            title: "Invoice value",
            body: "The value of the goods inside, not the shipping cost. Couriers price their risk cover on it and some will not carry high-value parcels, so it changes both the price and which couriers you see.",
          },
          { title: "Boxes", body: "Weight and size of each box, as for international." },
        ],
      },
      {
        type: "p",
        text: "Results work the same way as international: sort, filter by courier, open the breakdown, compare. Couriers that offer more than one speed are grouped so you can pick between them.",
      },
    ],
  },
  {
    slug: "chargeable-weight",
    title: "Chargeable weight",
    summary: "Why a light, large box can cost more than its weight suggests.",
    category: "rates",
    order: 3,
    audiences: ["standard", "ba"],
    keywords: ["volumetric", "dimensional", "volume", "size", "weight", "5000", "dimensions", "bulky", "charged by size"],
    updated: "2026.11.21",
    related: ["international-rates"],
    blocks: [
      {
        type: "p",
        text: "Carriers charge for the space a parcel takes as well as its weight. For every box they work out two numbers and charge the higher one.",
      },
      {
        type: "table",
        head: ["Number", "How it is worked out"],
        rows: [
          ["Actual weight", "What the box weighs on a scale, in kg"],
          ["Volumetric weight", "Length × breadth × height in cm, divided by 5,000"],
          ["Chargeable weight", "The higher of the two, for each box, times the number of boxes"],
        ],
      },
      {
        type: "p",
        text: "**Example.** A 50 × 40 × 30 cm box weighing 4 kg has a volumetric weight of 50 × 40 × 30 ÷ 5,000 = **12 kg**. You are charged for 12 kg.",
      },
      {
        type: "p",
        text: "The booking form shows the chargeable weight of each box, and marks a box **charged by size** when its volume is what decides the price.",
      },
      {
        type: "callout",
        tone: "tip",
        text: "Measure the outside of the packed box, rounded up to the next centimetre. Carriers measure every parcel, and one that turns out larger than booked can cost more or be held.",
      },
    ],
  },
  {
    slug: "prices-and-tax",
    title: "What the price includes",
    summary: "GST, duties at the destination, and why the price can change before you pay.",
    category: "rates",
    order: 4,
    audiences: ["standard", "ba"],
    keywords: ["gst", "tax", "duty", "duties", "customs duty", "import tax", "ddp", "ddu", "inclusive", "breakdown"],
    updated: "2026.11.21",
    related: ["invoices", "international-rates"],
    blocks: [
      { type: "heading", text: "GST is included" },
      {
        type: "p",
        text: "Every price you are shown to pay already includes 18% GST. What comes out of your wallet is exactly the total on the Review step, and the tax invoice for the booking shows the same total split into taxable value and GST.",
      },
      { type: "heading", text: "Destination duties are not in the price" },
      {
        type: "p",
        text: "Your price covers getting the parcel to the receiver. Import duty or tax charged by the destination country is separate, and is not known until the parcel arrives.",
      },
      {
        type: "p",
        text: "Who pays it is set under **Export documents** in [Settings](app:/settings), as **Who pays duty on arrival**: **DDU** means the receiver pays, **DDP** means you do. If the receiver pays, tell them to expect it, especially for higher-value goods. Talk to us before choosing DDP.",
      },
      { type: "heading", text: "When the price can change" },
      {
        type: "list",
        items: [
          "Before you pay: prices are fetched live, so a rate you saw on the calculator yesterday may differ today. The Review step is final.",
          "After you pay: carriers weigh and measure every parcel. If what you hand over is heavier or larger than what was booked, the carrier can charge the difference or hold the parcel until it is settled, so enter real weights and sizes.",
        ],
      },
    ],
  },
];
