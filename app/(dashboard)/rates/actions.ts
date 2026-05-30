"use server";

import { getRates } from "@/lib/services/rate-calculator.service";
import type { CanonicalRateRequest } from "@/lib/adapters/core/types";

export async function getRatesAction(
  request: CanonicalRateRequest,
  vendorIds?: string[]
) {
  try {
    const result = await getRates(request, {
      vendorIds,
    });

    return result;
  } catch (error) {
    console.error("Rate calculation failed", error);

    return {
      success: false,
      quotes: [],
      vendorErrors: [
        {
          vendorId: "system",
          vendorName: "System",
          message: "Failed to fetch rates",
        },
      ],
    };
  }
}