import "server-only";

import type { HelpArticle } from "../types";

/**
 * Business Associate guides: clients, quotes and client emails.
 *
 * A BA ships for the customers it brings in. Everything here is tagged `ba`,
 * except the one standard-org article explaining how to become one.
 */
export const clientArticles: HelpArticle[] = [
  {
    slug: "business-associate-guide",
    title: "Working as a Business Associate",
    summary: "What a Business Associate account adds, and the order to set it up in.",
    category: "clients",
    order: 1,
    audiences: ["ba"],
    keywords: ["ba", "business associate", "partner", "reseller", "agent", "on behalf", "my customers"],
    updated: "2026.11.21",
    related: ["clients", "book-for-client", "create-quote", "client-emails"],
    blocks: [
      {
        type: "p",
        text: "A Business Associate (BA) account does everything a normal account does, plus three things for shipping on behalf of your own customers, who Arena calls **clients**:",
      },
      {
        type: "list",
        items: [
          "**Clients**: a list of the people and companies you ship for, each with their own addresses, KYC documents and export details.",
          "**Quotes**: turn any rate into a branded PDF quote at your own markup, save it, and email it to the client.",
          "**Client emails**: let Arena email your clients about their shipments under your company name, or keep every update to yourself.",
        ],
      },
      { type: "heading", text: "Setting up, in order" },
      {
        type: "steps",
        items: [
          { title: "Your own profile and documents", body: "Fill in [Settings](app:/settings) and upload your PAN and Aadhaar, exactly as any account does. See [Your first shipment](help:first-shipment)." },
          { title: "Top up your wallet", body: "Every booking, including bookings for clients, is paid from your wallet. Charge your clients however you agree with them." },
          { title: "Add your clients", body: "One at a time or from a spreadsheet. See [Your clients](help:clients)." },
          { title: "Upload each client's KYC documents", body: "On the client's page. They are used instead of yours whenever you book for that client. See [Client documents](help:client-documents)." },
          { title: "Decide on client emails", body: "In [Settings](app:/settings), on the **Client emails** tab. See [Emails to your clients](help:client-emails)." },
          { title: "Quote, then book", body: "Send a quote from the rates page, and once the client agrees, book for them. See [Create a quote](help:create-quote) and [Book for a client](help:book-for-client)." },
        ],
      },
      { type: "heading", text: "What is different from a normal account" },
      {
        type: "list",
        items: [
          "There is no separate Address Book. Addresses are kept on each client's page, and your own on your profile.",
          "The [Document Vault](app:/document-vault) also lists every document you have uploaded for your clients.",
          "The dashboard shows a **Quotes** card alongside your shipments.",
        ],
      },
    ],
  },
  {
    slug: "clients",
    title: "Your clients",
    summary: "Add, find, edit and remove the clients you ship for.",
    category: "clients",
    order: 2,
    audiences: ["ba"],
    routes: [{ scope: "tenant", path: "/clients" }],
    keywords: ["client", "customer", "add client", "new client", "edit client", "delete client", "company", "individual", "export clients"],
    updated: "2026.11.21",
    related: ["client-page", "import-clients", "book-for-client"],
    blocks: [
      {
        type: "p",
        text: "[Clients](app:/clients) lists everyone you ship for. Search by name, contact or email, sort by any column, and click a client to open their page.",
      },
      { type: "heading", text: "Add a client" },
      {
        type: "steps",
        items: [
          { title: "Click Create Client" },
          {
            title: "Choose Company or Individual",
            body: "**Company** needs a company name. **Individual** needs only the person's name, which becomes the client's display name.",
          },
          {
            title: "Fill in what you have",
            body: "Contact name, email, phone and address. GSTIN, PAN and Aadhaar numbers are optional here; the Aadhaar number is stored encrypted. **Internal notes** are only ever seen by your team.",
          },
          { title: "Save", body: "The client is ready to quote and book for." },
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "Pick **Company** or **Individual** carefully. A client with a company name is declared to the carrier as a business (by GSTIN), an individual by their Aadhaar.",
      },
      {
        type: "p",
        text: "You can also add a client without leaving the quote form: search for them, and if they are not found, choose to add them with the name already filled in.",
      },
      { type: "heading", text: "Edit, export and delete" },
      {
        type: "list",
        items: [
          "**Edit** from the client's row or the client's page.",
          "**Export** downloads all your clients as an Excel file.",
          "**Import** adds many at once. See [Import clients from a spreadsheet](help:import-clients).",
          "**Delete** removes a client from your lists and searches. Their past shipments and quotes are kept.",
        ],
      },
    ],
  },
  {
    slug: "import-clients",
    title: "Import clients from a spreadsheet",
    summary: "Bulk-add clients from CSV or Excel, with a preview before anything is saved.",
    category: "clients",
    order: 3,
    audiences: ["ba"],
    keywords: ["import", "bulk", "csv", "excel", "xlsx", "upload clients", "template", "spreadsheet", "duplicates"],
    updated: "2026.11.21",
    related: ["clients"],
    blocks: [
      {
        type: "steps",
        items: [
          { title: "On Clients, click Import" },
          { title: "Download the template", body: "Click **New here? Start from the template**. It lists every column, which ones are required, and an example row. Column names are matched loosely, so \"Phone\", \"Mobile\" and \"Contact Number\" all work." },
          { title: "Fill it in and upload", body: "A .csv or .xlsx file, up to 5,000 rows and 5 MB." },
          { title: "Check the preview", body: "Rows are sorted into **Ready**, **Duplicates skipped** and **Errors**, each with a reason. Nothing is saved yet." },
          { title: "Import", body: "Only the ready rows are added." },
        ],
      },
      {
        type: "table",
        head: ["Rule", "What happens"],
        rows: [
          ["Contact Name and Phone", "Required in every row, or the row is skipped"],
          ["A client you already have", "Matched by email, or by name when there is no email. Skipped, never overwritten"],
          ["The same client twice in the file", "Collapsed to one"],
        ],
      },
    ],
  },
  {
    slug: "client-page",
    title: "A client's page",
    summary: "Everything about one client: activity, contact, addresses, documents and email setting.",
    category: "clients",
    order: 4,
    audiences: ["ba"],
    routes: [{ scope: "tenant", path: "/clients/[id]" }],
    keywords: ["client detail", "client profile", "win rate", "client shipments", "client quotes", "client address"],
    updated: "2026.11.21",
    related: ["client-documents", "client-emails", "create-quote"],
    blocks: [
      {
        type: "table",
        head: ["Section", "What it holds"],
        rows: [
          ["Stats", "Total shipments, total quotes, quote win rate and last activity"],
          ["Contact and Address", "The client's details. **Edit** at the top changes them"],
          ["Shipment emails", "Whether this client is emailed about their shipments. See [Emails to your clients](help:client-emails)"],
          ["Export documents", "The client's IEC, AD code, IOSS and LUT, used when you book for them. See [Export documents](help:export-documents)"],
          ["Notes", "Your internal notes"],
          ["Quotes and Shipments", "Their latest quotes and bookings"],
          ["Addresses", "Saved pickup, delivery and billing addresses for booking for them in one tap"],
          ["KYC documents", "Their identity and export documents. See [Client documents](help:client-documents)"],
        ],
      },
      {
        type: "p",
        text: "**New quote** at the top takes you to [International Rates](app:/rates) to price a shipment for them.",
      },
      {
        type: "callout",
        tone: "info",
        text: "A client's own export details are used ahead of yours, field by field, because the client is the exporter. Anything left blank on the client falls back to yours.",
      },
    ],
  },
  {
    slug: "client-documents",
    title: "Client documents (KYC)",
    summary: "Uploading the documents customs needs for each client you book for.",
    category: "clients",
    order: 5,
    audiences: ["ba"],
    keywords: ["client kyc", "client pan", "client aadhaar", "client gst", "client iec", "upload for client", "client vault"],
    updated: "2026.11.21",
    related: ["identity-documents", "customs-categories", "client-page"],
    blocks: [
      {
        type: "p",
        text: "When you book for a client, customs needs to know **the client**, not you. So the booking asks for the client's documents, following the same rules as your own: PAN and Aadhaar for CSB-IV, plus GST and IEC for CSB-V, plus Company PAN and LUT for Commercial. See [Identity documents](help:identity-documents).",
      },
      {
        type: "steps",
        items: [
          { title: "Open the client's page", body: "From [Clients](app:/clients)." },
          { title: "Click Upload KYC document", body: "In the KYC documents section." },
          { title: "Choose the document type, attach the file and type the number", body: "Add a note if it helps your team." },
        ],
      },
      {
        type: "list",
        items: [
          "You can also upload a missing client document from inside the booking form, at the KYC step. It is saved to the client, so it is there next time.",
          "Every client document is also listed in the [Document Vault](app:/document-vault), under **Client documents**.",
          "Your own documents are never used for a client booking, and a client's are never used for yours.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "KYC requirements relaxed",
        text: "If the KYC step shows this for a client, Arena has agreed an exception for that client for a limited time, and only their Aadhaar card is needed. An exception for your account does not cover your clients; each is agreed separately.",
      },
    ],
  },
  {
    slug: "book-for-client",
    title: "Book for a client",
    summary: "What changes in the booking form when you ship on a client's behalf.",
    category: "clients",
    order: 6,
    audiences: ["ba"],
    keywords: ["book for client", "on behalf", "client booking", "client sender", "a client"],
    updated: "2026.11.21",
    related: ["book-international", "book-domestic", "client-documents", "client-emails"],
    blocks: [
      {
        type: "p",
        text: "Booking for a client uses the same form as any booking, international or domestic. The difference is all on the first step.",
      },
      {
        type: "steps",
        items: [
          { title: "Sender: choose A client", body: "Search by name or email. The client's details fill the sender, and their saved addresses appear as chips." },
          { title: "Carry on as normal", body: "Receiver, Items, Rates and Review are the same as in [Book an international shipment](help:book-international)." },
          { title: "KYC uses the client's documents", body: "Anything already on the client's file shows as ready. Upload anything missing right there; it is saved to the client." },
          { title: "Pay from your wallet", body: "The total comes out of your wallet. The client never pays Arena directly." },
        ],
      },
      { type: "heading", text: "After booking" },
      {
        type: "list",
        items: [
          "The shipment appears in your [Shipments](app:/shipments) with the client's name, and on the client's page.",
          "Status emails go to the client if client emails are on for them, and to you otherwise. See [Emails to your clients](help:client-emails).",
          "Notifications in the app always come to you.",
        ],
      },
    ],
  },
  {
    slug: "create-quote",
    title: "Create a quote for a client",
    summary: "Turn any rate into a PDF quote at your own markup.",
    category: "clients",
    order: 7,
    audiences: ["ba"],
    keywords: ["quote", "quotation", "markup", "margin", "pdf quote", "price for client", "get quote", "generate quote"],
    updated: "2026.11.21",
    related: ["quotes", "international-rates", "clients"],
    blocks: [
      {
        type: "steps",
        items: [
          { title: "Check rates", body: "On [International Rates](app:/rates), enter the shipment and get rates. See [Check international rates](help:international-rates)." },
          { title: "Click Get quote on the service you want to offer" },
          { title: "Choose the client", body: "Search your clients, or add a new one without leaving the form." },
          {
            title: "Set your markup",
            body: "Pick 5%, 10%, 15% or 20%, or type your own. You see the carrier price, your markup and the **Client quoted price** side by side.",
          },
          { title: "Generate Quote", body: "A preview of the PDF opens." },
          {
            title: "Save, Download or Edit",
            body: "**Save** stores the quote in [Quotes](app:/quotes) with its PDF. **Download** saves the PDF to your computer only. **Edit** goes back to change it; saving again updates the same quote rather than making a new one.",
          },
        ],
      },
      {
        type: "callout",
        tone: "info",
        title: "What the client sees",
        text: "The PDF shows the client quoted price only. Your markup and the carrier price are never printed on it.",
      },
      {
        type: "p",
        text: "Every quote is valid for **7 days** from when it is saved. Rates move, so re-quote anything older before booking.",
      },
    ],
  },
  {
    slug: "quotes",
    title: "Manage and send quotes",
    summary: "Find a saved quote, email it to the client and see whether they opened it.",
    category: "clients",
    order: 8,
    audiences: ["ba"],
    routes: [{ scope: "tenant", path: "/quotes" }],
    keywords: ["quotes", "send quote", "email quote", "mark as sent", "opened", "bounced", "quote status", "valid until", "expired quote"],
    updated: "2026.11.21",
    related: ["create-quote", "client-page"],
    blocks: [
      {
        type: "p",
        text: "[Quotes](app:/quotes) lists every quote you have saved: number, status, client, service, total, valid-until date and when it was created. Search, filter by status, and **Export** the list to Excel.",
      },
      { type: "heading", text: "Sending a quote" },
      {
        type: "list",
        items: [
          "Open the **⋯** menu on a quote and choose **Send by Email**. Write the subject and message; a link to the PDF is added. Sending marks the quote **Sent**.",
          "Sent it another way, such as WhatsApp? Choose **Mark as Sent** so your list stays accurate.",
          "**View PDF** opens the quote document.",
        ],
      },
      { type: "heading", text: "Did they read it?" },
      {
        type: "p",
        text: "Emailed quotes show what happened to the email: **Delivered**, **Opened**, **Clicked** (they opened the PDF link), **Bounced** (check the address) or marked as spam.",
      },
      { type: "heading", text: "Statuses" },
      {
        type: "table",
        head: ["Status", "Meaning"],
        rows: [
          ["Draft", "Saved, not yet sent"],
          ["Sent", "Emailed from Arena, or marked as sent by you"],
          ["Expired", "Past its date. A draft expires the day after its valid-until date; a sent quote three days after, to allow for a client who replies late"],
        ],
      },
    ],
  },
  {
    slug: "client-emails",
    title: "Emails to your clients",
    summary: "Choose whether Arena emails your clients about their shipments, and which updates.",
    category: "clients",
    order: 9,
    audiences: ["ba"],
    keywords: ["client emails", "notify client", "white label", "branding", "reply to", "exceptions", "stop emails", "my company name"],
    updated: "2026.11.21",
    related: ["notifications", "client-page", "book-for-client"],
    blocks: [
      {
        type: "p",
        text: "When you book for a client, Arena can email them at each milestone, **under your company name**. Clients never see an Arena address. Or you can keep every update to yourself. Set it up in [Settings](app:/settings), on the **Client emails** tab.",
      },
      {
        type: "table",
        head: ["Setting", "What it does"],
        rows: [
          ["Client emails on or off", "Off: every update comes to you instead. Nothing is lost either way"],
          ["Which updates they get", "Any of: booking confirmed, being prepared, on its way, out for delivery, delivered. Anything unticked comes to you"],
          ["Where replies go", "The inbox a client's reply lands in. Add one, or replies have nowhere to go"],
          ["Exceptions", "Clients set differently from the switch above, in either direction"],
        ],
      },
      { type: "heading", text: "One client differently" },
      {
        type: "p",
        text: "On a client's page, **Shipment emails** offers **Follow my setting**, **Always email them** or **Never email them**. A client with no email address on file is never emailed; their updates come to you.",
      },
      {
        type: "callout",
        tone: "tip",
        text: "You can set all of this up before switching client emails on. Nothing is sent until you do.",
      },
    ],
  },
  {
    slug: "become-business-associate",
    title: "Becoming a Business Associate",
    summary: "For freight agents and resellers who ship on behalf of their own customers.",
    category: "account",
    order: 7,
    audiences: ["standard"],
    keywords: ["ba", "business associate", "partner", "reseller", "agent", "upgrade", "clients", "quotes"],
    updated: "2026.11.21",
    related: ["team-and-access"],
    blocks: [
      {
        type: "p",
        text: "If you ship on behalf of your own customers, a Business Associate account lets you keep a client list with each client's documents, send branded quotes at your own markup, and have Arena email your clients under your company name.",
      },
      {
        type: "p",
        text: "Accounts are switched by our team. Email us with your organisation name and a line about the customers you ship for. If you have applied, the dashboard shows that your application is in review until we come back to you.",
      },
    ],
  },
];
