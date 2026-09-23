/**
 * ARAMEX RATE ADAPTER
 * -----------------------------------------------------------------------------
 * Prices a consignment across EVERY Aramex account Arena holds and returns the
 * cheapest as one quote.
 *
 * ── WHY ONE ADAPTER AND NOT TWO VENDORS ─────────────────────────────────────
 * Arena's Aramex contracts (the direct one and the UPS-channel one) are separate
 * accounts with separate tariffs, so they must both be asked. They are NOT
 * separate vendors:
 *
 *   - The customer must never learn which of our contracts moved their parcel.
 *     A second vendor id would put that on a filter chip, in a quote PDF and in
 *     the partner API's response. See carrierBranding.md.
 *   - `vendorId` is stamped on every shipment, wallet transaction, rate
 *     snapshot and invoice ever raised. Splitting it would fork four years of
 *     reporting to save one `if`.
 *
 * So the fan-out is internal, and the account that won is recorded where the
 * platform already carries a vendor's own service id: `courierId` on the quote,
 * which the booking flow snapshots onto `Shipment.selectedCourierId` and hands
 * back to the booking adapter. That is what makes the parcel fly on the account
 * that sold it — see lib/aramex/accounts.ts for why that matters to the month's
 * invoice.
 *
 * ── WHY THE FAN-OUT LIVES INSIDE THE THREE-STEP CONTRACT ────────────────────
 * `transformRequest` returns N payloads, `callVendorApi` calls them in parallel
 * and returns N results, `transformResponse` picks the cheapest. Overriding
 * `fetchRates` would have been shorter and would have thrown away
 * BaseVendorAdapter's error classification, which the scheduled rate sweep
 * depends on to tell an unserviceable lane from a rotated credential.
 */

import { BaseVendorAdapter } from "../../core/base.adapter";
import {
  RateAdapterError,
  errorFromResponse,
  truncateBody,
  type RateErrorKind,
} from "../../core/errors";
import type { CanonicalRateRequest, RateQuote } from "../../core/types";
import type {
  AramexAccountRateCall,
  AramexAccountRateResult,
  AramexRateFanout,
  AramexRateFanoutResult,
  AramexRateRequest,
  AramexRateResponse,
} from "./aramex.types";
import {
  ARAMEX_CUSTOMER_PRODUCT_NAME,
  aramexAccounts,
  aramexClientInfo,
  aramexConfigurationGap,
  type AramexAccount,
} from "@/lib/aramex/accounts";
import {
  describeResponseErrors,
  looksLikeAramexAuthFailure,
} from "@/lib/aramex/notifications";
import {
  isAramexAccountSuspended,
  recordAramexAccountSuccess,
  recordAramexAuthFailure,
} from "@/lib/aramex/accountHealth";
import {
  computeShipmentWeights,
  normalizePackages,
} from "@/lib/pricing/chargeableWeight";

// Kept exported from this module because that is where it lived when the rate
// sweep's tests pinned it (utils/rateSweep.test.ts). The implementation moved
// to lib/aramex/notifications.ts so the booking and tracking adapters can read
// Aramex's notifications the same way without importing across adapter families.
export { looksLikeAramexAuthFailure };

const ARAMEX_API_URL =
  process.env.ARAMEX_API_URL ??
  "https://ws.aramex.net/ShippingAPI.V2/RateCalculator/Service_1_0.svc/json/CalculateRate";

/**
 * A ceiling on one account's call.
 *
 * Node's fetch has no default timeout, so before this a half-open connection to
 * Aramex hung until the platform killed the whole request — which on the rate
 * sweep means a step that never finishes rather than a lane that fails and
 * retries. Aramex's measured latency is around 1.1 s (see lib/rateSweep/config.ts),
 * so 45 s is not a limit any healthy call can reach; it is a floor under the
 * pathological case.
 */
const ARAMEX_TIMEOUT_MS = Number(process.env.ARAMEX_TIMEOUT_MS ?? 45_000);

export class AramexAdapter extends BaseVendorAdapter<
  AramexRateFanout,
  AramexRateFanoutResult
> {
  readonly vendorId = "aramex";
  readonly vendorName = "Aramex";

  /**
   * Canonical → one Aramex payload per configured account.
   *
   * ── THE WEIGHT ──────────────────────────────────────────────────────────
   * Aramex's rate calculator has no true multi-piece input — it takes a single
   * Dimensions block + ActualWeight + NumberOfPieces. So we normalise the
   * shipment to ONE chargeable weight (per-package max → sum) and feed it as
   * ActualWeight, with nominal 1×1×1 dimensions so Aramex's own
   * max(actual, volumetric) can never exceed the number we computed. This works
   * regardless of whether a given Aramex account honours an explicit
   * ChargeableWeight, which is why we drive it through ActualWeight instead.
   * NumberOfPieces stays the real piece count so any per-piece minimums still
   * apply correctly.
   *
   * ── THE ACCOUNTS ────────────────────────────────────────────────────────
   * Every payload is identical but for its ClientInfo. That is deliberate and
   * worth keeping: the ONLY thing separating these quotes must be the tariff,
   * so if the two accounts ever disagree about a price it is a fact about our
   * contracts rather than a bug in how we asked.
   */
  protected transformRequest(input: CanonicalRateRequest): AramexRateFanout {
    const configured = aramexAccounts();

    /**
     * An account whose credentials Aramex is currently rejecting is skipped
     * rather than asked again. See lib/aramex/accountHealth.ts — the short
     * version is that a rotated PIN on ONE contract used to be invisible here,
     * because the others kept quoting, and the scheduled sweep would spend six
     * hundred rejected calls on it in a night.
     *
     * If EVERY account is suspended the list falls through to the empty check
     * below and the whole vendor fails loudly, which is right: at that point
     * there is nothing left to price with.
     */
    const accounts = configured.filter(
      (account) => !isAramexAccountSuspended(account.key),
    );

    if (configured.length > 0 && accounts.length === 0) {
      throw new RateAdapterError(
        this.vendorId,
        `Every Aramex account is suspended after repeated credential rejections: ${configured
          .map((a) => a.key)
          .join(", ")}. Check the account PINs.`,
        { kind: "AUTH_ERROR" },
      );
    }

    if (accounts.length === 0) {
      // Previously this called Aramex with empty credentials and reported back
      // whatever they said about it, which read like a vendor outage. Naming the
      // missing variables is the difference between an operator fixing it in a
      // minute and an operator opening a ticket with Aramex.
      throw new RateAdapterError(
        this.vendorId,
        `Aramex is not configured: ${aramexConfigurationGap()}`,
        { kind: "CONFIG_ERROR" },
      );
    }

    const packages = normalizePackages({
      packages: input.shipment.packages,
      weight: input.shipment.weight,
      quantity: input.shipment.quantity,
      dimensions: input.shipment.dimensions,
    });
    const weights = computeShipmentWeights(packages);

    const calls = accounts.map<AramexAccountRateCall>((account) => ({
      account,
      payload: buildRatePayload(input, account, weights),
    }));

    return { calls };
  }

  /**
   * Every account, in parallel, with per-account failures kept rather than
   * thrown.
   *
   * Parallel because they are independent calls to the same host and running
   * them in series would double the latency of the main revenue path for no
   * benefit. It does double the CALL rate against Aramex, which is why the rate
   * sweep's pacing for this vendor was halved — see VENDOR_CALLS_PER_MINUTE in
   * lib/rateSweep/config.ts.
   *
   * This throws only when NOTHING worked. One account declining a lane while the
   * other quotes it is a normal, useful outcome: the customer gets the price
   * that exists.
   */
  protected async callVendorApi(
    request: AramexRateFanout,
  ): Promise<AramexRateFanoutResult> {
    const settled = await Promise.all(
      request.calls.map((call) => this.callOneAccount(call)),
    );

    const succeeded = settled.filter((r) => r.response);

    if (succeeded.length === 0) {
      throw combinedFailure(this.vendorId, settled);
    }

    // A failure alongside a success is not worth failing the quote over, but it
    // IS worth someone eventually noticing — a UPS-channel account that has been
    // silently rejecting every lane for a week would otherwise look exactly like
    // one that is simply never the cheapest.
    for (const result of settled) {
      if (result.error) {
        console.warn(
          `[${this.vendorId}] ${result.account.key} did not quote: ${result.error.message}`,
        );
      }
    }

    return { results: settled };
  }

  /**
   * EVERY account that quoted, each carrying its own account key.
   *
   * ── WHY THIS DOES NOT PICK THE CHEAPEST ─────────────────────────────────
   * It used to, and that was the wrong layer to decide it. Who may see which
   * of Arena's contracts quoted is a property of THE VIEWER, not of the vendor:
   *
   *   - A customer sees one Aramex row, the cheapest. Showing two identical
   *     "Aramex Express" rows at different prices would both confuse them and
   *     invite the question this whole masking layer exists to prevent.
   *   - Arena staff see both, because "which account is cheaper on this lane"
   *     is the question they open the calculator to answer.
   *   - The scheduled rate sweep stores both, because a matrix that recorded
   *     only whichever account happened to win can never answer that question
   *     retrospectively.
   *
   * An adapter knows nothing about viewers, so it reports everything it was
   * told and the collapse happens where the viewer is known —
   * lib/rates/sourcingAccounts.ts, applied by the rate service. The sweep calls
   * `fetchRates` directly and so keeps every row.
   *
   * ── D10 STILL HOLDS ─────────────────────────────────────────────────────
   * carrierBranding.md D10 says cheapest wins with no preference for our own
   * channel. Sorted cheapest-first here so that survives regardless of which
   * account was configured first, and enforced for real by the collapse.
   */
  protected transformResponse(
    response: AramexRateFanoutResult,
  ): RateQuote[] {
    const candidates = response.results.flatMap((result) => {
      const quote = result.response
        ? toQuote(result.account, result.response, this.vendorId, this.vendorName)
        : null;
      return quote ? [quote] : [];
    });

    return candidates.sort((a, b) => a.totalWithTax - b.totalWithTax);
  }

  // -------------------------------------------------------------------------

  /**
   * One account's call, reduced to "a rate" or "a reason there is not one".
   *
   * Nothing here throws. A transport error, a malformed body and Aramex's own
   * HTTP-200 rejection all come back as the same `error` shape, because from the
   * fan-out's point of view they are the same thing: this account produced no
   * price. Which of them it was only matters when EVERY account failed, and
   * `combinedFailure` is where that gets decided.
   */
  private async callOneAccount(
    call: AramexAccountRateCall,
  ): Promise<AramexAccountRateResult> {
    try {
      const json = await this.post(call.payload);

      if (json.HasErrors) {
        const message = describeResponseErrors(json, "Unknown Aramex error");

        // Aramex's own rejection. Either our key is wrong, or the lane is one
        // they will not fly — and only the wording can say which.
        const isAuthFailure = looksLikeAramexAuthFailure(message);

        if (isAuthFailure) {
          // Counted per account. Three in a row puts THIS contract aside and
          // alerts, without touching the ones that are working.
          const suspended = recordAramexAuthFailure(call.account.key, message);
          if (suspended) {
            console.error(
              `[${this.vendorId}] ${call.account.key} suspended after repeated credential rejections: ${message}`,
            );
          }
        } else {
          // A lane they DECLINE is still proof the credentials work. Clearing
          // the streak here matters: an account that is simply unserviceable on
          // a run of consecutive lanes must never accumulate its way to a
          // suspension it does not deserve.
          recordAramexAccountSuccess(call.account.key);
        }

        return {
          account: call.account,
          error: {
            message,
            kind: isAuthFailure ? "AUTH_ERROR" : "NO_SERVICE",
          },
        };
      }

      recordAramexAccountSuccess(call.account.key);

      return { account: call.account, response: json };
    } catch (err) {
      // A transport failure keeps the classification `post` already made from
      // the status line. It is never downgraded to NO_SERVICE: a 503 says
      // nothing about whether Aramex serves this lane, and recording it as if
      // it did would teach the rate sweep a permanent falsehood about a route
      // that was simply asked on a bad night.
      if (err instanceof RateAdapterError) {
        return {
          account: call.account,
          error: {
            message: err.message,
            kind: err.kind,
            status: err.status,
            retryAfterSeconds: err.retryAfterSeconds,
          },
        };
      }

      return {
        account: call.account,
        error: {
          message: err instanceof Error ? err.message : "Unknown Aramex error",
          // Includes the AbortSignal timeout, which arrives as a TimeoutError
          // DOMException rather than anything typed.
          kind: isTimeout(err) ? "TIMEOUT" : "VENDOR_ERROR",
        },
      };
    }
  }

  private async post(payload: AramexRateRequest): Promise<AramexRateResponse> {
    const res = await fetch(ARAMEX_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(ARAMEX_TIMEOUT_MS),
    });

    const rawBody = await res.text();

    if (!res.ok) {
      throw errorFromResponse(this.vendorId, "Aramex API", res, rawBody);
    }

    try {
      return JSON.parse(rawBody) as AramexRateResponse;
    } catch (err) {
      throw new RateAdapterError(
        this.vendorId,
        `Failed to parse Aramex response: ${truncateBody(rawBody)}`,
        { kind: "VENDOR_ERROR", cause: err },
      );
    }
  }
}

// ---------------------------------------------------------------------------

function buildRatePayload(
  input: CanonicalRateRequest,
  account: AramexAccount,
  weights: ReturnType<typeof computeShipmentWeights>,
): AramexRateRequest {
  return {
    ClientInfo: aramexClientInfo(account),

    OriginAddress: {
      Line1: input.origin.line1 ?? "",
      Line2: "",
      Line3: "",
      StateOrProvinceCode: "",
      City: input.origin.city,
      PostCode: input.origin.pincode ?? "",
      CountryCode: input.origin.countryCode,
    },

    DestinationAddress: {
      Line1: input.destination.line1 ?? "",
      Line2: "",
      Line3: "",
      StateOrProvinceCode: "",
      City: input.destination.city,
      PostCode: input.destination.pincode ?? "",
      CountryCode: input.destination.countryCode,
    },

    ShipmentDetails: {
      // Nominal 1×1×1 box: volumetric ≈ 0, so Aramex's internal
      // max(actual, volumetric) resolves to the ActualWeight we set below —
      // which is already the normalised total chargeable weight.
      Dimensions: { Length: 1, Width: 1, Height: 1, Unit: "cm" },

      ActualWeight: { Unit: "KG", Value: weights.totalChargeableKg },

      ChargeableWeight: null,

      DescriptionOfGoods: input.shipment.description ?? "Goods",
      GoodsOriginCountry:
        input.shipment.goodsOriginCountry ?? input.origin.countryCode,

      NumberOfPieces: weights.totalPieces,

      ProductGroup: "EXP",
      ProductType: "PPX",

      PaymentType: "P",
      PaymentOptions: "",
      Services: "",
    },
  };
}

function toQuote(
  account: AramexAccount,
  response: AramexRateResponse,
  vendorId: string,
  vendorName: string,
): RateQuote | null {
  if (!response.RateDetails) return null;

  const total = response.TotalAmount?.Value ?? 0;
  // A zero or negative total is not a free shipment, it is an account that
  // answered without pricing the lane. Quoting it would undercut every real
  // rate and win the sort outright.
  if (!Number.isFinite(total) || total <= 0) return null;

  const currency = response.TotalAmount?.CurrencyCode ?? "INR";

  return {
    vendorId,
    vendorName,

    // Account-neutral on purpose. Arena staff read the account off `courierId`
    // below; the customer never sees which contract carried it. See
    // lib/aramex/accountKeys.ts.
    productName: ARAMEX_CUSTOMER_PRODUCT_NAME,

    currency,
    totalWithTax: total,
    totalWithoutTax: response.RateDetails.TotalAmountBeforeTax ?? 0,
    tatDays: 0,

    charges: [
      { name: "FREIGHT", amount: response.RateDetails.Amount, currency },
      { name: "TAX", amount: response.RateDetails.TaxAmount, currency },
    ],

    // THE WHOLE POINT. This is what the booking adapter reads back to bill the
    // consignment to the contract that quoted it.
    courierId: account.key,
  };
}

/**
 * What to report when NO account produced a price.
 *
 * The kind matters more than the message, because the rate sweep acts on it:
 * AUTH_ERROR stops the vendor for the whole run, RATE_LIMITED backs off and
 * honours Retry-After, NO_SERVICE is recorded as a permanent fact about the
 * lane, and everything else is retried.
 *
 * ── WHY THE WORST KIND WINS ────────────────────────────────────────────────
 * The accounts can fail for different reasons at once — one declines the lane,
 * the other times out — and collapsing that to "no rate" would record a
 * permanent NO_SERVICE for a route we never actually finished asking about.
 * So the most actionable failure decides, in the order below, and NO_SERVICE is
 * only reported when EVERY account genuinely answered and said no.
 *
 * ANY account failing on credentials is enough to stop the vendor. That is the
 * cautious direction: one rotated PIN out of two is still a rotated PIN, and the
 * cost of stopping a sweep early is a re-run, whereas the cost of not stopping
 * is several hundred more rejected calls and, on some vendors, a lockout.
 */
const KIND_PRIORITY: readonly RateErrorKind[] = [
  "AUTH_ERROR",
  "CONFIG_ERROR",
  "RATE_LIMITED",
  "TIMEOUT",
  "VENDOR_ERROR",
  "UNKNOWN",
  "NO_SERVICE",
];

function combinedFailure(
  vendorId: string,
  results: AramexAccountRateResult[],
): RateAdapterError {
  const message = results
    .map((r) => `${r.account.key}: ${r.error?.message ?? "no rate"}`)
    .join(" | ");

  const failures = results.flatMap((r) => (r.error ? [r.error] : []));

  const kind =
    KIND_PRIORITY.find((candidate) =>
      failures.some((f) => f.kind === candidate),
    ) ?? "UNKNOWN";

  // Carried through so the sweep can honour a 429 it was actually given rather
  // than falling back to its own guess at a backoff.
  const rateLimited = failures.find((f) => f.retryAfterSeconds != null);

  return new RateAdapterError(vendorId, `Aramex API error: ${message}`, {
    kind,
    status: failures.find((f) => f.status != null)?.status,
    retryAfterSeconds: rateLimited?.retryAfterSeconds,
  });
}

/** AbortSignal.timeout rejects with a DOMException, not anything we can type. */
function isTimeout(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}
