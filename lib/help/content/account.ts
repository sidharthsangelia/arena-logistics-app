import "server-only";

import type { HelpArticle } from "../types";

export const accountArticles: HelpArticle[] = [
  {
    slug: "profile-and-contact",
    title: "Profile and contact details",
    summary: "The sender details that pre-fill every booking, and where to change them.",
    category: "account",
    order: 1,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/settings" }],
    keywords: ["settings", "address", "company name", "sender", "phone", "email", "profile"],
    updated: "2026.11.21",
    related: ["identity-documents", "export-documents", "team-and-access"],
    blocks: [
      {
        type: "p",
        text: "[Settings](app:/settings) holds the details Arena reuses on every booking. Each row shows whether it is done; click it to open and edit.",
      },
      {
        type: "table",
        head: ["Row", "What it holds", "Used for"],
        rows: [
          ["Contact and address", "Your name, company, email, phone and pickup address", "Pre-filled as the sender on every booking"],
          ["Identity documents", "PAN and Aadhaar, with their numbers", "Attached to every international booking"],
          ["Export documents", "IEC, AD code, IOSS, LUT and who pays duty on arrival", "International bookings. See [Export documents](help:export-documents)"],
        ],
      },
      { type: "heading", text: "Shipping as an individual" },
      {
        type: "p",
        text: "Leave **Company** blank if you are not shipping for a business, for example sending a parcel to family. Your full name is the only identity field that is required. On a domestic booking, a blank company name is what tells us you are an individual sender, which changes the paperwork we ask for.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Changing your company name here also renames your organisation everywhere in Arena, including the switcher at the top of the sidebar.",
      },
      {
        type: "p",
        text: "Changes apply to bookings you start from now on. A shipment you have already booked keeps the details it was booked with.",
      },
      {
        type: "heading",
        text: "Client emails",
        audiences: ["ba"],
      },
      {
        type: "p",
        audiences: ["ba"],
        text: "Business Associates see a second tab, **Client emails**, which decides whether Arena emails your clients directly about their shipments. More on this in the client guides.",
      },
    ],
  },
  {
    slug: "identity-documents",
    title: "Identity documents (KYC)",
    summary: "Which documents customs needs, when, and how to upload them once.",
    category: "account",
    order: 2,
    audiences: ["standard", "ba"],
    keywords: ["kyc", "pan", "aadhaar", "gst", "iec", "lut", "company pan", "upload", "verification", "documents required"],
    updated: "2026.11.21",
    related: ["customs-categories", "document-vault", "export-documents"],
    blocks: [
      {
        type: "p",
        text: "Indian customs needs to know who is exporting. Which documents that takes depends on the customs category of the shipment, which the booking form picks from the declared value. Upload them once and every later booking uses them automatically.",
      },
      { type: "heading", text: "What is needed for each category" },
      {
        type: "table",
        head: ["Document", "CSB-IV", "CSB-V", "Commercial"],
        rows: [
          ["PAN card", "Required", "Required", "Required (founder or director)"],
          ["Aadhaar card", "Required", "Required", "Required (founder or director)"],
          ["GST certificate", "", "Required", "Required"],
          ["IEC certificate", "", "Required", "Required"],
          ["Company PAN", "", "", "Required"],
          ["LUT", "", "", "Required"],
        ],
      },
      {
        type: "p",
        text: "Most parcels under ₹25,000 go as **CSB-IV**, which needs only PAN and Aadhaar. See [Customs categories](help:customs-categories) for how the category is chosen.",
      },
      {
        type: "p",
        text: "**Domestic** shipments are different: an individual sender is asked for an Aadhaar card only, and a company sender is asked for no identity document at all (the tax invoice identifies them).",
      },
      { type: "heading", text: "Uploading" },
      {
        type: "steps",
        items: [
          { title: "Open Settings, then Identity documents", body: "Or go to the [Document Vault](app:/document-vault). Both save to the same place." },
          { title: "Upload a clear PDF or photo", body: "Both sides of the Aadhaar card on one file if you can." },
          { title: "Type the document number", body: "PAN, Aadhaar and GST uploads ask for the number too, because carriers need it as text. Your Aadhaar number is stored encrypted and only the last four digits are ever shown." },
        ],
      },
      {
        type: "p",
        text: "You can also upload a missing document from inside the booking form at the KYC step. Anything already on file shows there as ready; tick to confirm we may use it for this shipment.",
      },
      {
        type: "callout",
        tone: "warning",
        title: "Uploaded your Aadhaar before 25 September 2026?",
        text: "Some carriers now need the full Aadhaar number. If a booking asks you to upload it again, that is why. Upload it once more and type the number; it will not be asked for again.",
      },
      {
        type: "callout",
        tone: "info",
        audiences: ["ba"],
        title: "Booking for a client",
        text: "When you book on behalf of a client, the client's own documents are used, not yours. Upload them on the client's page under [Clients](app:/clients).",
      },
      {
        type: "callout",
        tone: "info",
        title: "KYC requirements relaxed",
        text: "If you see this message on the KYC step, Arena has agreed an exception with you for a limited time. Only the Aadhaar card is required while it lasts.",
      },
    ],
  },
  {
    slug: "document-vault",
    title: "Document Vault",
    summary: "Every document on your account in one place: view, replace or add.",
    category: "account",
    order: 3,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/document-vault" }],
    keywords: ["vault", "files", "uploads", "replace document", "kyc documents"],
    updated: "2026.11.21",
    related: ["identity-documents"],
    blocks: [
      {
        type: "p",
        text: "The [Document Vault](app:/document-vault) keeps the identity documents you upload, so they can be reused on every booking.",
      },
      {
        type: "list",
        items: [
          "**My documents** always shows PAN and Aadhaar, the two every international shipment needs.",
          "**Commercial and export documents** (GST, IEC, LUT, Company PAN) are tucked into a section that opens when you need them. It opens on its own if any are already on file.",
          "To replace a document, upload a new one over it. Bookings already made keep the copy they were booked with.",
        ],
      },
      {
        type: "p",
        audiences: ["ba"],
        text: "Business Associates also see **Client documents**: every document uploaded for each of your clients, searchable in one table.",
      },
      {
        type: "p",
        text: "Documents for a particular shipment, such as its label, tax invoice and customs papers, are not kept here. They are on that shipment's page under **Documents**.",
      },
    ],
  },
  {
    slug: "address-book",
    title: "Address book",
    summary: "Save pickup, delivery and billing addresses to fill bookings in one click.",
    category: "account",
    order: 4,
    audiences: ["standard"],
    routes: [{ scope: "tenant", path: "/addressbook" }],
    keywords: ["addresses", "saved address", "receiver", "consignee", "pickup address", "primary"],
    updated: "2026.11.21",
    related: ["book-international"],
    blocks: [
      {
        type: "p",
        text: "The [Address Book](app:/addressbook) stores addresses you use often. On the booking form they appear as chips above the address fields; click one to fill everything in.",
      },
      {
        type: "table",
        head: ["Type", "Use it for"],
        rows: [
          ["Pickup", "Where a parcel is collected from, if not your main address"],
          ["Delivery", "Receivers you ship to again and again"],
          ["Billing", "A different billing address for the receiver"],
          ["Other", "Warehouses, registered offices, anything else"],
        ],
      },
      {
        type: "list",
        items: [
          "**Add** an address from the page, or save one while booking with the **Save this address** button under the fields.",
          "**Set as primary** puts an address first in its list.",
          "**Edit** and **Delete** are on each card. Deleting never changes shipments you have already booked.",
        ],
      },
    ],
  },
  {
    slug: "team-and-access",
    title: "Team members and your organisation",
    summary: "Invite colleagues, manage roles, switch organisation and edit your own profile.",
    category: "account",
    order: 5,
    audiences: ["standard", "ba"],
    keywords: ["invite", "members", "team", "users", "roles", "password", "switch organisation", "sign out", "colleague"],
    updated: "2026.11.21",
    related: ["profile-and-contact"],
    blocks: [
      {
        type: "p",
        text: "Your account in Arena is an **organisation**. Everyone you invite works in the same organisation and sees the same shipments, wallet and documents.",
      },
      { type: "heading", text: "Invite a colleague" },
      {
        type: "steps",
        items: [
          { title: "Click your name at the bottom of the sidebar" },
          { title: "Choose Settings", body: "This opens your organisation's settings window." },
          { title: "Open Members and invite by email", body: "They get an email to join. Choose **Admin** for someone who should manage members, or **Member** for everyone else." },
        ],
      },
      { type: "heading", text: "Your own profile" },
      {
        type: "p",
        text: "**Profile** in the same menu is for you personally: your name, photo, email addresses, password and signed-in devices. **Sign out** is at the bottom.",
      },
      { type: "heading", text: "More than one organisation" },
      {
        type: "p",
        text: "If you belong to several organisations, switch between them with the organisation name at the top of the sidebar. Everything on screen changes to the one you pick.",
      },
    ],
  },
  {
    slug: "notifications",
    title: "Notifications and emails",
    summary: "What the bell tells you, which emails we send, and to whom.",
    category: "account",
    order: 6,
    audiences: ["standard", "ba"],
    routes: [{ scope: "tenant", path: "/notifications" }],
    keywords: ["bell", "inbox", "alerts", "email", "updates", "milestone"],
    updated: "2026.11.21",
    related: ["shipment-statuses", "shipping-labels"],
    blocks: [
      {
        type: "p",
        text: "The bell at the top right shows a count of unread notifications. Click it to see the latest, or open [Notifications](app:/notifications) for the full history.",
      },
      { type: "heading", text: "What you are told about" },
      {
        type: "list",
        items: [
          "Every change in a shipment's status, including holds that need your attention.",
          "Progress of a door pickup, from collection to arrival at our hub.",
          "Your shipping label being ready to print.",
          "Messages our team sends you directly.",
        ],
      },
      {
        type: "p",
        text: "Notices that apply to everyone, such as holidays or service changes, appear as a bar across the top of the page instead.",
      },
      {
        type: "p",
        text: "Amber notifications are the ones where you may need to do something. Everything else is information.",
      },
      { type: "heading", text: "Emails" },
      {
        type: "p",
        text: "We also email the sender's email address on the booking at the main milestones: booking confirmed, being prepared, label ready (with the label attached), in transit, out for delivery and delivered. Holds and cancellations are not emailed, because each one needs a person to explain it; our team contacts you instead.",
      },
    ],
  },
];
