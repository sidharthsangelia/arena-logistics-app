/**
 * ARAMEX SHIPPING API CLIENT
 * -----------------------------------------------------------------------------
 * Every HTTP call the booking adapter makes, and nothing else. The adapter
 * decides what a failure MEANS for a booking; this file decides only what
 * happened on the wire.
 *
 * ── THE ONE THING TO UNDERSTAND ABOUT THIS VENDOR ───────────────────────────
 * Aramex answers HTTP 200 to almost everything, including refusals. A booking
 * that was rejected, a lane they do not fly and an expired PIN all arrive as
 * `HasErrors: true` inside a perfectly successful response. So `AramexApiError`
 * carries an OPTIONAL status: present means a real transport-level failure
 * (which may not have reached them and is therefore worth retrying), absent
 * means Aramex received the request, understood it, and said no (which a retry
 * cannot change).
 *
 * The booking adapter reads exactly that distinction to decide whether to retry
 * an export, and getting it backwards means either a stuck booking or a second
 * consignment at full price.
 */

import "server-only";

import { describeResponseErrors } from "@/lib/aramex/notifications";
import type { AramexBaseResponse } from "@/lib/aramex/types";

const SHIPPING_BASE =
  process.env.ARAMEX_SHIPPING_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json";

const LOCATION_BASE =
  process.env.ARAMEX_LOCATION_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/Location/Service_1_0.svc/json";

/**
 * Generous, and deliberately so.
 *
 * CreateShipments renders a label as part of the same call, which is slower
 * than a rate lookup by an order of magnitude. Cutting this short would abort a
 * booking that Aramex is in the middle of accepting — the single worst outcome
 * available here, because the export then exists and we do not know its AWB.
 */
const BOOKING_TIMEOUT_MS = Number(
  process.env.ARAMEX_BOOKING_TIMEOUT_MS ?? 90_000,
);

/** Downloading a rendered PDF. Nothing is at stake if this one gives up. */
const DOCUMENT_TIMEOUT_MS = Number(
  process.env.ARAMEX_DOCUMENT_TIMEOUT_MS ?? 60_000,
);

/**
 * What actually went wrong, stated rather than inferred.
 *
 * The booking adapter decides whether to retry an export from this one field,
 * and the three cases could not be further apart in consequence:
 *
 *   transport  nothing came back. The request MAY never have arrived, so a
 *              retry is right — and is the only way a booking survives a blip.
 *   http       a non-2xx. Retriable on 5xx/408/429, not otherwise.
 *   rejection  HTTP 200 and `HasErrors`. Aramex read the request and said no.
 *              A retry cannot change that and, on CreateShipments, risks a
 *              second export at full price.
 *
 * This used to be inferred from "is there a status?", which conflated transport
 * and rejection because neither carries one. The distinction is too expensive to
 * get wrong to leave it to a heuristic.
 */
export type AramexFailureKind = "transport" | "http" | "rejection";

export class AramexApiError extends Error {
  readonly kind: AramexFailureKind;
  /** HTTP status, on `http` failures. */
  readonly status?: number;
  /** Aramex's own notification codes, when they gave any. */
  readonly codes: string[];

  constructor(
    message: string,
    options: {
      kind: AramexFailureKind;
      status?: number;
      codes?: string[];
      cause?: unknown;
    },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AramexApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.codes = options.codes ?? [];
  }

  /** True when Aramex received and rejected the request, rather than missing it. */
  get isVendorRejection(): boolean {
    return this.kind === "rejection";
  }
}

function truncate(body: string, max = 500): string {
  const text = body.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * POST JSON, and turn anything that is not a clean 200 into an AramexApiError.
 *
 * `expectEnvelopeErrors: false` (the default) also rejects a 200 whose body
 * says HasErrors. The one caller that passes true is the serviceability check,
 * which needs to read HasErrors itself rather than have it thrown.
 */
async function post<TResponse extends AramexBaseResponse>(
  url: string,
  payload: unknown,
  options: { timeoutMs?: number; expectEnvelopeErrors?: boolean } = {},
): Promise<TResponse> {
  const timeoutMs = options.timeoutMs ?? BOOKING_TIMEOUT_MS;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AramexApiError(
      err instanceof Error && err.name === "TimeoutError"
        ? `Aramex did not answer within ${Math.round(timeoutMs / 1000)}s.`
        : `Could not reach Aramex: ${err instanceof Error ? err.message : "unknown network error"}`,
      { kind: "transport", cause: err },
    );
  }

  const rawBody = await res.text();

  if (!res.ok) {
    throw new AramexApiError(
      `Aramex returned ${res.status} ${res.statusText}: ${truncate(rawBody)}`,
      { kind: "http", status: res.status },
    );
  }

  let json: TResponse;
  try {
    json = JSON.parse(rawBody) as TResponse;
  } catch (err) {
    // A 200 we cannot read. Classified as `http` rather than `rejection`
    // because it is OUR problem or a gateway's, not a considered refusal — so
    // the adapter is free to retry it.
    throw new AramexApiError(
      `Could not read Aramex's response: ${truncate(rawBody)}`,
      { kind: "http", status: res.status, cause: err },
    );
  }

  if (json.HasErrors && !options.expectEnvelopeErrors) {
    throw new AramexApiError(describeResponseErrors(json), {
      kind: "rejection",
      codes: (json.Notifications ?? [])
        .map((n) => n?.Code)
        .filter((code): code is string => Boolean(code)),
    });
  }

  return json;
}

export function createShipments<TResponse extends AramexBaseResponse>(
  payload: unknown,
): Promise<TResponse> {
  return post<TResponse>(`${SHIPPING_BASE}/CreateShipments`, payload);
}

export function holdShipments<TResponse extends AramexBaseResponse>(
  payload: unknown,
): Promise<TResponse> {
  return post<TResponse>(`${SHIPPING_BASE}/HoldShipments`, payload);
}

export function addShipmentAttachment<TResponse extends AramexBaseResponse>(
  payload: unknown,
): Promise<TResponse> {
  return post<TResponse>(`${SHIPPING_BASE}/AddShipmentAttachment`, payload);
}

/**
 * Serviceability. Returns the envelope rather than throwing on HasErrors,
 * because "they said no" is the ANSWER to this question, not a failure of it.
 */
export function isAddressServiced<TResponse extends AramexBaseResponse>(
  payload: unknown,
): Promise<TResponse> {
  return post<TResponse>(`${LOCATION_BASE}/IsAddressServiced`, payload, {
    timeoutMs: 30_000,
    expectEnvelopeErrors: true,
  });
}

/**
 * Download a label Aramex rendered for us.
 *
 * The PDF magic-byte check is the point. An expired or mis-rendered label URL
 * on Aramex's report server answers 200 with an HTML error page, and without
 * this we would file that page as the customer's airway bill and only find out
 * at the hub. Better to fail the download and retry.
 */
export async function fetchDocument(
  url: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(DOCUMENT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new AramexApiError(
      `Could not download ${url}: ${err instanceof Error ? err.message : "unknown network error"}`,
      { kind: "transport", cause: err },
    );
  }

  if (!res.ok) {
    throw new AramexApiError(
      `Aramex's label server returned ${res.status} ${res.statusText}`,
      { kind: "http", status: res.status },
    );
  }

  const bytes = new Uint8Array(await res.arrayBuffer());

  if (bytes.length === 0) {
    throw new AramexApiError("Aramex's label server returned an empty file.", {
      kind: "http",
      status: res.status,
    });
  }

  const looksLikePdf =
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46; // F

  if (!looksLikePdf) {
    throw new AramexApiError(
      "Aramex's label server answered with something that is not a PDF, which usually means the label link has expired.",
      { kind: "http", status: res.status },
    );
  }

  return {
    bytes,
    mimeType: res.headers.get("content-type")?.split(";")[0].trim() || "application/pdf",
  };
}
