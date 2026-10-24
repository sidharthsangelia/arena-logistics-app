/**
 * Whether a client is an individual (a person) or a company.
 *
 * An individual has no company name. Client.companyName is still required in
 * the schema because it is the client's display name everywhere, so for an
 * individual it holds the person's name, the same convention the CSV import
 * uses (lib/clients/clientImportSpec.ts).
 *
 * `companyKind` alone cannot be trusted on older rows: it defaults to
 * INDIVIDUAL and the client forms never set it before 2026-09-25, so most
 * company clients created through a form are marked INDIVIDUAL. A client is
 * therefore only treated as an individual when it is marked INDIVIDUAL AND its
 * display name is the person's own name.
 *
 * It matters beyond display: the booking sender copies the client's company
 * name, and a sender with a company name is declared to Aramex as a company
 * (GSTIN) rather than an individual (Aadhaar).
 */

type ClientKindFields = {
  companyKind?: "INDIVIDUAL" | "COMPANY" | null;
  companyName?: string | null;
  contactName?: string | null;
};

export function isIndividualClient(client: ClientKindFields): boolean {
  if (client.companyKind !== "INDIVIDUAL") return false;
  const display = client.companyName?.trim().toLowerCase() ?? "";
  const person = client.contactName?.trim().toLowerCase() ?? "";
  return !display || display === person;
}

/** The company name to show or prefill: none for an individual. */
export function clientCompanyName(client: ClientKindFields): string {
  return isIndividualClient(client) ? "" : (client.companyName?.trim() ?? "");
}
