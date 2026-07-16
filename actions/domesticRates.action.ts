"use server";

import { activateRateVersion, submitRateJob, getActiveRateVersionId } from "@/lib/services/domesticRate.service";
import { auth } from "@clerk/nextjs/server";



 

/**
 * actions/domestic-rates.ts
 *
 * Server Action — finds the best domestic air rate(s) for a shipment by
 * querying the local DB (RateVersion / RateCard / RateSlab / FlightSurcharge
 * / VendorAwbCharge), instead of calling any carrier adapter.
 *
 * ALGORITHM
 * ---------
 * For each requested vendor (or all vendors if `vendors` is empty):
 *
 * 1. Find the ACTIVE, non-staged RateVersion for that vendor.
 *    (isActive: true, isStaged: false) — this is "the live rate sheet".
 *
 * 2. Find all RateCards for that version matching origin + destination +
 *    cargoType. A vendor can have multiple matching cards (e.g. different
 *    flight numbers / consol codes / time slabs) — each is evaluated
 *    independently and the cheapest is kept per vendor.
 *
 * 3. For each candidate RateCard:
 *    a. Compute chargeable weight:
 *       - volumetric weight = (L × W × H × qty) / volDivisor   (cm-based;
 *         inches are converted to cm first)
 *       - chargeable weight = max(actualWeightKg, volumetricWeightKg)
 *       - if no dimensions supplied, chargeable weight = actualWeightKg
 *    b. Find the RateSlab whose [weightMin, weightMax] range contains the
 *       chargeable weight (weightMax null = open-ended / highest slab).
 *    c. Base freight = chargeable weight × ratePerKg, floored at minCharge
 *       if present. If the slab provides `flatRate` instead, use that.
 *    d. Add slab-level extras: rate100kg-derived charge (if rate100kg set,
 *       compute chargeable/100 × rate100kg and use whichever is *lower* of
 *       that vs. the per-kg result — common in air cargo rate cards where
 *       a "per 100kg" slab undercuts the per-kg rate), miscCharges,
 *       airportOut, airportRet, surchargeComp — each added as a line item
 *       if present and non-zero.
 *    e. Add FlightSurcharge rows for the card (surchargePerKg × chargeable
 *       weight, or flat if surchargePerKg is 0 and surchargeText implies a
 *       flat note — kept simple: surchargePerKg × weight, skipped if 0).
 *    f. Add VendorAwbCharge rows for the RateVersion (AWB fee, fuel
 *       surcharge, security surcharge, etc.) — amountPerKg × chargeable
 *       weight, or amountFlat, whichever is defined, floored at minAmount.
 *    g. Sum all of the above = totalWithoutTax.
 *    h. Apply GST (5% on freight for domestic air cargo, applied to the
 *       whole total here for simplicity) = totalWithTax.
 *
 * 4. Pick the cheapest RateCard per vendor → one DomesticRateQuote per
 *    vendor that has a match.
 *
 * 5. Vendors with no active rate version, no matching rate card, or no
 *    matching slab are reported in `vendorErrors` instead of throwing —
 *    matches the international flow's "partial failure" UX.
 *
 * ERRORS
 * ------
 * - If origin/destination airports don't exist (or are inactive) in the
 *   Airport table, return a top-level `fieldErrors` object instead of
 *   `quotes`/`vendorErrors`, so the form can surface it next to the
 *   relevant input.
 */

 
import {
  domesticRateFormSchema,
  type DomesticRateFormValues,
} from "@/lib/domestic/domesticSchema";
import {
  DOMESTIC_VENDORS,
  type DomesticRateQuote,
  type DomesticRateResult,
  type DomesticVendorError,
  type DomesticCargoType,
} from "@/lib/domestic/domestic.types";
import { CargoType, Prisma, RateVendor } from "@/generated/prisma";
import { prisma } from "@/utils/db";

const GST_RATE = 0.05; // 5% IGST on domestic air freight — adjust if needed

// ---------------------------------------------------------------------------
// Action result type — discriminated so the client can branch cleanly
// ---------------------------------------------------------------------------

export type DomesticRateActionResult =
  | { ok: true; data: DomesticRateResult }
  | { ok: false; fieldErrors: Partial<Record<"origin" | "destination" | "form", string>> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toCm(value: number, unit: "cm" | "in") {
  return unit === "in" ? value * 2.54 : value;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function decToNum(d: Prisma.Decimal | null | undefined): number | null {
  if (d === null || d === undefined) return null;
  return Number(d);
}

/**
 * Computes chargeable weight in kg given actual weight and optional
 * dimensions, using the rate card's volumetric divisor.
 */
function computeChargeableWeight(
  actualWeightKg: number,
  dims: DomesticRateFormValues["dimensions"],
  volDivisor: number,
): { chargeableWeight: number; volumetricWeight: number | null } {
  if (!dims) {
    return { chargeableWeight: actualWeightKg, volumetricWeight: null };
  }

  const lCm = toCm(dims.length, dims.unit);
  const wCm = toCm(dims.width, dims.unit);
  const hCm = toCm(dims.height, dims.unit);

  const volumetricWeight = (lCm * wCm * hCm * dims.quantity) / volDivisor;
  const chargeable = Math.max(actualWeightKg, volumetricWeight);

  return {
    chargeableWeight: round2(chargeable),
    volumetricWeight: round2(volumetricWeight),
  };
}

const VENDOR_LABEL: Record<string, string> = Object.fromEntries(
  DOMESTIC_VENDORS.map((v) => [v.id, v.label]),
);

// ---------------------------------------------------------------------------
// Per-vendor quote builder
// ---------------------------------------------------------------------------

async function buildQuoteForVendor(
  vendorId: RateVendor,
  input: DomesticRateFormValues,
  cargoTypeEnum: CargoType,
): Promise<{ quote: DomesticRateQuote | null; error: DomesticVendorError | null }> {
  const vendorName = VENDOR_LABEL[vendorId] ?? vendorId;

  // 1. Active, non-staged rate version for this vendor (cached — see
  // getActiveRateVersionId's doc comment for why this is safe to cache)
  const versionId = await getActiveRateVersionId(vendorId);

  if (!versionId) {
    return {
      quote: null,
      error: {
        vendorId: vendorId.toLowerCase(),
        vendorName,
        message: "No active rate card published for this carrier.",
      },
    };
  }

  // 2. Matching rate cards for this version + origin/destination/cargo
  const rateCards = await prisma.rateCard.findMany({
    where: {
      versionId,
      vendor: vendorId,
      origin: input.origin,
      destination: input.destination,
      cargoType: cargoTypeEnum,
      opsSuspended: false,
    },
    include: {
      slabs: { orderBy: { weightMin: "asc" } },
      surcharges: true,
    },
  });

  if (rateCards.length === 0) {
    return {
      quote: null,
      error: {
        vendorId: vendorId.toLowerCase(),
        vendorName,
        message: `No published rate for ${input.origin} → ${input.destination} (${input.cargoType}).`,
      },
    };
  }

  // 3. AWB-level charges for this version (fuel surcharge, AWB fee, etc.)
  const awbCharges = await prisma.vendorAwbCharge.findMany({
    where: { versionId, vendor: vendorId },
  });

  let best: {
    quote: DomesticRateQuote;
  } | null = null;
  let lastSlabMissError: string | null = null;

  for (const card of rateCards) {
    const volDivisor = card.volDivisor || 6000;
    const { chargeableWeight, volumetricWeight } = computeChargeableWeight(
      input.actualWeightKg,
      input.useDimensions ? input.dimensions : undefined,
      volDivisor,
    );

    // Find slab whose range contains chargeableWeight
    const slab = card.slabs.find((s) => {
      const min = Number(s.weightMin);
      const max = s.weightMax === null ? Infinity : Number(s.weightMax);
      return chargeableWeight >= min && chargeableWeight <= max;
    });

    if (!slab) {
      lastSlabMissError = `No rate slab covers ${chargeableWeight}kg for ${input.origin} → ${input.destination}.`;
      continue;
    }

    const charges: DomesticRateQuote["charges"] = [];

    // --- Base freight ---------------------------------------------------
    const ratePerKg = decToNum(slab.ratePerKg);
    const flatRate = decToNum(slab.flatRate);
    const minCharge = decToNum(slab.minCharge);
    const rate100kg = decToNum(slab.rate100kg);

    let baseFreight: number;

    if (flatRate !== null && flatRate > 0) {
      baseFreight = flatRate;
      charges.push({
        name: `Flat rate (${slab.slabLabel})`,
        amount: round2(flatRate),
        currency: "INR",
      });
    } else {
      const perKgTotal = (ratePerKg ?? 0) * chargeableWeight;
      let candidates = [perKgTotal];
      let label = `Freight @ ₹${ratePerKg ?? 0}/kg`;

      if (rate100kg !== null && rate100kg > 0) {
        const per100Total = (chargeableWeight / 100) * rate100kg;
        if (per100Total < perKgTotal) {
          candidates.push(per100Total);
          label = `Freight @ ₹${rate100kg}/100kg`;
        }
      }

      const computed = Math.min(...candidates);
      baseFreight =
        minCharge !== null ? Math.max(computed, minCharge) : computed;

      charges.push({
        name:
          minCharge !== null && baseFreight === minCharge && baseFreight !== computed
            ? `Freight (min charge applied)`
            : label,
        amount: round2(baseFreight),
        currency: "INR",
      });
    }

    // --- Slab-level extras ------------------------------------------------
    const miscCharges = decToNum(slab.miscCharges);
    if (miscCharges) {
      charges.push({ name: "Miscellaneous charges", amount: round2(miscCharges), currency: "INR" });
    }

    const airportOut = decToNum(slab.airportOut);
    if (airportOut) {
      charges.push({ name: "Airport charges (origin)", amount: round2(airportOut), currency: "INR" });
    }

    const airportRet = decToNum(slab.airportRet);
    if (airportRet) {
      charges.push({ name: "Airport charges (destination)", amount: round2(airportRet), currency: "INR" });
    }

    const surchargeComp = decToNum(slab.surchargeComp);
    if (surchargeComp) {
      charges.push({ name: "Surcharge component", amount: round2(surchargeComp), currency: "INR" });
    }

    // --- Flight-level surcharges -------------------------------------------
    for (const fs of card.surcharges) {
      const perKg = decToNum(fs.surchargePerKg);
      if (perKg) {
        const amount = round2(perKg * chargeableWeight);
        if (amount > 0) {
          charges.push({
            name: fs.surchargeText || fs.surchargeType,
            amount,
            currency: "INR",
          });
        }
      }
    }

    // --- Vendor / AWB-level charges -----------------------------------------
    for (const ac of awbCharges) {
      const perKg = decToNum(ac.amountPerKg);
      const flat = decToNum(ac.amountFlat);
      const min = decToNum(ac.minAmount);

      let amount: number | null = null;
      if (perKg) {
        amount = perKg * chargeableWeight;
        if (min !== null) amount = Math.max(amount, min);
      } else if (flat) {
        amount = flat;
      }

      if (amount && amount > 0) {
        charges.push({
          name: ac.notes || ac.chargeType,
          amount: round2(amount),
          currency: "INR",
        });
      }
    }

    // --- Totals ---------------------------------------------------------
    const totalWithoutTax = round2(
      charges.reduce((sum, c) => sum + c.amount, 0),
    );
    const taxAmount = round2(totalWithoutTax * GST_RATE);
    const totalWithTax = round2(totalWithoutTax + taxAmount);

    charges.push({
      name: "GST (5%)",
      amount: taxAmount,
      currency: "INR",
    });

    const candidateQuote: DomesticRateQuote = {
      vendorId: vendorId.toLowerCase(),
      vendorName,
      productName: `${vendorName} · ${input.cargoType} · ${input.origin} → ${input.destination}`,
      currency: "INR",
      totalWithoutTax,
      totalWithTax,
      tatDays: 1, // domestic air — default to next-day; refine if a TAT field is added to RateCard
      charges,
      meta: {
        rateCardId: card.id,
        versionId,
        cargoType: input.cargoType,
        chargeableWeightKg: chargeableWeight,
        actualWeightKg: input.actualWeightKg,
        appliedSlabLabel: slab.slabLabel,
        ratePerKg,
        minCharge,
      },
    };

    if (!best || candidateQuote.totalWithTax < best.quote.totalWithTax) {
      best = { quote: candidateQuote };
    }

    // surface volumetric weight via a synthetic note if it won
    if (volumetricWeight !== null && volumetricWeight > input.actualWeightKg) {
      candidateQuote.charges = candidateQuote.charges; // no-op, kept for clarity
    }
  }

  if (!best) {
    return {
      quote: null,
      error: {
        vendorId: vendorId.toLowerCase(),
        vendorName,
        message: lastSlabMissError ?? "No matching rate slab found.",
      },
    };
  }

  return { quote: best.quote, error: null };
}

// ---------------------------------------------------------------------------
// Main server action
// ---------------------------------------------------------------------------

export async function getDomesticRates(
  rawInput: unknown,
): Promise<DomesticRateActionResult> {
  const parsed = domesticRateFormSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: { form: "Invalid input. Please check the form and try again." },
    };
  }

  const input = parsed.data;

  // Validate origin/destination airports exist & are active
  const [originAirport, destAirport] = await Promise.all([
    prisma.airport.findUnique({ where: { iataCode: input.origin } }),
    prisma.airport.findUnique({ where: { iataCode: input.destination } }),
  ]);

  const fieldErrors: Partial<Record<"origin" | "destination" | "form", string>> = {};

  if (!originAirport) {
    fieldErrors.origin = `Unknown airport code "${input.origin}".`;
  } else if (!originAirport.isActive) {
    fieldErrors.origin = `${input.origin} is not currently active.`;
  }

  if (!destAirport) {
    fieldErrors.destination = `Unknown airport code "${input.destination}".`;
  } else if (!destAirport.isActive) {
    fieldErrors.destination = `${input.destination} is not currently active.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  // Determine which vendors to query
  const vendorsToQuery: RateVendor[] =
    input.vendors.length > 0
      ? (input.vendors as RateVendor[])
      : (DOMESTIC_VENDORS.map((v) => v.id) as RateVendor[]);

  const cargoTypeEnum = input.cargoType as CargoType;

  const results = await Promise.all(
    vendorsToQuery.map((vendorId) =>
      buildQuoteForVendor(vendorId, input, cargoTypeEnum),
    ),
  );

  const quotes: DomesticRateQuote[] = [];
  const vendorErrors: DomesticVendorError[] = [];

  for (const r of results) {
    if (r.quote) quotes.push(r.quote);
    if (r.error) vendorErrors.push(r.error);
  }

  // Optionally log the query for analytics (best-effort, non-blocking)
  try {
    const cheapest = quotes.length
      ? quotes.reduce((a, b) => (a.totalWithTax < b.totalWithTax ? a : b))
      : null;

    await prisma.quoteLog.create({
      data: {
        origin: input.origin,
        destination: input.destination,
        cargoType: input.cargoType,
        actualWeightKg: new Prisma.Decimal(input.actualWeightKg),
        chargeableWeight: new Prisma.Decimal(
          cheapest?.meta.chargeableWeightKg ?? input.actualWeightKg,
        ),
        selectedVendor: cheapest?.vendorId ?? null,
        totalQuote: cheapest ? new Prisma.Decimal(cheapest.totalWithTax) : null,
      },
    });
  } catch {
    // logging failures should never block the quote response
  }

  return {
    ok: true,
    data: { quotes, vendorErrors },
  };
}
 

export async function submitRateLoadAction(opts: {
  fileUrl: string;
  fileName: string;
  vendor?: RateVendor;
  effectiveFrom?: string;
}): Promise<{ jobId: string; message: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  return submitRateJob({
    fileUrl: opts.fileUrl,
    fileName: opts.fileName,
    vendor: opts.vendor,
    effectiveFrom: opts.effectiveFrom,
    uploadedBy: userId,
  });
}

export async function activateRateVersionAction(versionId: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  await activateRateVersion({ versionId, activatedBy: userId });
}