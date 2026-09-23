/**
 * WCF DATES
 * -----------------------------------------------------------------------------
 * Aramex's JSON endpoints are a thin shim over a .NET WCF service, and .NET's
 * old JSON serialiser writes dates as
 *
 *     /Date(1705900653000+0530)/
 *
 * That is milliseconds since the Unix epoch, UTC, followed by the ORIGINATING
 * OFFSET. The offset is presentational — it says which clock the value was read
 * off, not what to add. Adding it is the classic bug here and it moves every
 * tracking event five and a half hours into the future.
 *
 * Both directions live in one file because they have to agree: we send this
 * format on CreateShipments and read it back on TrackShipments, and a mismatch
 * between a writer and a reader in two places is the sort of thing that shows
 * up as a shipment dated 1970.
 */

const WCF_DATE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/;

/**
 * `/Date(...)/` → ISO-8601, or null when the value is not a date we understand.
 *
 * Null rather than a thrown error or an epoch fallback: a tracking event with
 * an unreadable timestamp should be visibly missing one, not silently dated
 * 1 January 1970 and sorted to the bottom of a customer's timeline. Already-ISO
 * input is passed through, because Aramex is not consistent about which of the
 * two it sends and both are valid answers to "when did this happen".
 */
export function parseWcfDate(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const match = WCF_DATE.exec(raw);
  if (match) {
    const ms = Number(match[1]);
    if (!Number.isFinite(ms)) return null;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Not the WCF shape. Aramex sometimes answers plain ISO-8601, so try that
  // before giving up.
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Date → `/Date(...)/`, with the offset Aramex's own samples carry.
 *
 * The offset defaults to India's +0530 because every shipment this system books
 * originates in India, and Aramex's India samples all send it. It is written
 * literally rather than derived from the server's own timezone: the server runs
 * in UTC, and a value that changes meaning depending on where the code happens
 * to be deployed is not a value.
 */
export function toWcfDate(date: Date, offset = "+0530"): string {
  return `/Date(${date.getTime()}${offset})/`;
}

/**
 * `yyyy-mm-dd` → `MM/DD/YYYY`, which is the format Aramex's AdditionalProperties
 * take for InvoiceDate. Their samples send `08/17/2020`.
 *
 * Returns "" for anything unparseable rather than inventing today's date. An
 * invoice date we cannot read is a field to leave off the customs declaration,
 * not one to guess at.
 */
export function toAramexPropertyDate(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return "";

  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}
