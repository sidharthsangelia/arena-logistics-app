import { CompanyKind } from "@/generated/prisma";

// ---------------------------------------------------------------------------
// Client bulk-import: single source of truth
//
// Every part of the import feature — the downloadable template, the header
// matcher, the on-screen instructions, and the server-side validator — is
// derived from the COLUMN_SPECS below. Change a header, alias, or required
// flag here and the whole pipeline stays consistent. This is deliberate:
// with 50+ rows a user cannot eyeball, the one thing we must never get wrong
// is *which column means what*.
//
// This module is intentionally free of "use server" and of any Node-only
// dependency so it can be imported by both the client dialog and the server
// action.
// ---------------------------------------------------------------------------

export type ClientImportField =
  | "companyName"
  | "contactName"
  | "email"
  | "phone"
  | "companyKind"
  | "addressLine1"
  | "city"
  | "state"
  | "country"
  | "postalCode"
  | "notes";

export type ClientImportRow = Partial<Record<ClientImportField, string>>;

export interface ClientColumnSpec {
  field: ClientImportField;
  /** Recommended header, shown verbatim in the template. */
  header: string;
  required: boolean;
  /** Human-readable header variants we also accept (normalized when matched). */
  aliases: string[];
  description: string;
  example: string;
}

// Order here is the column order in the template.
export const COLUMN_SPECS: readonly ClientColumnSpec[] = [
  {
    field: "companyName",
    header: "Company Name",
    required: false,
    aliases: ["company", "organisation", "organization", "business", "business name", "firm"],
    description:
      "Legal / business name. Optional — leave blank for an individual and we'll use the Contact Name automatically.",
    example: "Acme Exports Pvt Ltd",
  },
  {
    field: "contactName",
    header: "Contact Name",
    required: true,
    aliases: ["contact", "contact person", "name", "person", "full name"],
    description: "Full name of the primary contact person.",
    example: "Rajesh Kumar",
  },
  {
    field: "email",
    header: "Email",
    required: false,
    aliases: ["email address", "e-mail", "mail", "e mail"],
    description: "Contact email. Optional, but if provided it must be a valid address, otherwise it is cleared.",
    example: "rajesh@acme.com",
  },
  {
    field: "phone",
    header: "Phone",
    required: true,
    aliases: ["phone number", "mobile", "mobile number", "contact number", "tel", "telephone"],
    description: "Contact phone number.",
    example: "+91 98765 43210",
  },
  {
    field: "companyKind",
    header: "Type",
    required: false,
    aliases: ["client type", "company kind", "category", "kind"],
    description: "Either \"Individual\" or \"Company\". Optional — defaults to Individual.",
    example: "Company",
  },
  {
    field: "addressLine1",
    header: "Address",
    required: false,
    aliases: ["address line 1", "street", "street address", "address1"],
    description: "Street address.",
    example: "12, MG Road",
  },
  {
    field: "city",
    header: "City",
    required: false,
    aliases: ["town"],
    description: "City / town.",
    example: "Bengaluru",
  },
  {
    field: "state",
    header: "State",
    required: false,
    aliases: ["province", "region"],
    description: "State / province.",
    example: "Karnataka",
  },
  {
    field: "country",
    header: "Country",
    required: false,
    aliases: ["nation"],
    description: "Country.",
    example: "India",
  },
  {
    field: "postalCode",
    header: "Postal Code",
    required: false,
    aliases: ["postalcode", "zip", "zip code", "pincode", "pin code", "pin"],
    description: "Postal / ZIP / PIN code.",
    example: "560001",
  },
  {
    field: "notes",
    header: "Notes",
    required: false,
    aliases: ["remarks", "comments", "note"],
    description: "Any free-form notes about this client.",
    example: "Priority client",
  },
] as const;

export const REQUIRED_FIELDS: readonly ClientImportField[] = COLUMN_SPECS.filter(
  (c) => c.required,
).map((c) => c.field);

// ---------------------------------------------------------------------------
// Header matching — tolerant by design (flexible mapping was the chosen policy).
// Everything is normalized to lowercase alphanumerics so "Company Name",
// "company_name", "COMPANY-NAME" all collapse to the same key.
// ---------------------------------------------------------------------------

export function normalizeHeaderKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_LOOKUP: Record<string, ClientImportField> = (() => {
  const map: Record<string, ClientImportField> = {};
  for (const spec of COLUMN_SPECS) {
    for (const label of [spec.header, spec.field, ...spec.aliases]) {
      map[normalizeHeaderKey(label)] = spec.field;
    }
  }
  return map;
})();

export function matchHeader(header: string): ClientImportField | null {
  return HEADER_LOOKUP[normalizeHeaderKey(header)] ?? null;
}

// ---------------------------------------------------------------------------
// Company type parsing
// ---------------------------------------------------------------------------

export function parseCompanyKind(value: string | undefined): CompanyKind {
  const key = normalizeHeaderKey(value ?? "");
  if (!key) return CompanyKind.INDIVIDUAL;
  if (key.startsWith("comp") || key.startsWith("business") || key.startsWith("org") || key.startsWith("firm")) {
    return CompanyKind.COMPANY;
  }
  return CompanyKind.INDIVIDUAL;
}

// ---------------------------------------------------------------------------
// Limits shared between client and server
// ---------------------------------------------------------------------------

export const MAX_ROWS_PER_IMPORT = 5000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Analysis result types (kept here, NOT in the "use server" action file,
// because Next 16 forbids non-async exports from "use server" modules).
// ---------------------------------------------------------------------------

/** A row that could not be imported, with the reasons why. */
export interface RowIssue {
  /** 1-based spreadsheet row number (accounting for the header row). */
  row: number;
  label: string;
  reasons: string[];
}

/** A cleaned row that will be / was imported, shown in the preview. */
export interface PreviewRow {
  row: number;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  type: "Individual" | "Company";
  /** Non-fatal notes, e.g. "Company Name was blank — using Contact Name". */
  warnings: string[];
}

export interface ImportAnalysis {
  success: boolean;
  dryRun: boolean;
  /** Set only after a real (non-dry-run) import completes. */
  committed?: boolean;
  message?: string;
  total: number;
  /** Count of rows that are ready to import (dry run) or were imported. */
  readyCount: number;
  importedCount?: number;
  invalidRows: RowIssue[];
  duplicateInFileRows: RowIssue[];
  duplicateExistingRows: RowIssue[];
  /** Capped sample of the rows that will be saved. */
  preview: PreviewRow[];
  /** True when any issue/preview list was truncated for size. */
  truncated: boolean;
}

/** How many detail rows we round-trip to the browser for the preview UI. */
export const PREVIEW_CAP = 200;

// ---------------------------------------------------------------------------
// Template data (plain arrays; the client builds the XLSX workbook from these
// so this module stays dependency-free).
// ---------------------------------------------------------------------------

export const TEMPLATE_HEADERS: string[] = COLUMN_SPECS.map((c) => c.header);

export const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  // A company with everything filled in.
  COLUMN_SPECS.map((c) => c.example),
  // An individual: Company Name left blank (falls back to Contact Name).
  ["", "Meera Nair", "meera@example.com", "+91 91234 56780", "Individual", "Flat 4B, Sea View", "Kochi", "Kerala", "India", "682001", ""],
  // The bare minimum: only the required columns.
  ["", "Arjun Singh", "", "+91 99887 76655", "", "", "", "", "", "", ""],
];

/** Rows for the "Instructions" sheet of the template. */
export function buildInstructionSheetRows(): string[][] {
  const rows: string[][] = [
    ["How to import your clients"],
    [""],
    ["1. Fill in your clients on the \"Clients\" sheet — one client per row."],
    ["2. Keep the header row (row 1) as-is. Column order does not matter, and headers are"],
    ["   matched loosely (e.g. \"Phone\", \"Mobile\" and \"Contact Number\" all work)."],
    ["3. Columns marked REQUIRED must have a value in every row, or that row is skipped."],
    ["4. Delete these example rows before importing, or leave them — example emails are"],
    ["   fictional and will import as normal clients if you keep them."],
    ["5. Save as .xlsx or .csv and upload it. You'll see a preview to confirm before anything is saved."],
    [""],
    ["Columns"],
    ["Header", "Required?", "Description", "Example"],
  ];
  for (const spec of COLUMN_SPECS) {
    rows.push([spec.header, spec.required ? "REQUIRED" : "Optional", spec.description, spec.example]);
  }
  rows.push([""]);
  rows.push(["Notes on duplicates"]);
  rows.push(["A client already in your account (matched by email, or by name when there is no email)"]);
  rows.push(["is skipped, not overwritten. Duplicate rows within this file are collapsed to one."]);
  return rows;
}
