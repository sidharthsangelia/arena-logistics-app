"use server";

/**
 * actions/book/bookingContext.action.ts
 *
 * Builds the BookingOrgContext the wizard needs from the active org: BA flag
 * (gates BA-only features), skipPayment (deferred vs up-front payment),
 * markup, and the org's own profile for the "Use my saved profile" sender
 * option. Decimal markup is converted to a plain number so it survives the
 * server → client serialisation into the client-side wizard.
 */

import { getCurrentOrgContext } from "@/actions/book/getOrgs";
import { isOrgAddressComplete } from "@/lib/booking/profile";
import type { BookingOrgContext } from "@/types/booking.types";

export async function getBookingOrgContext(): Promise<BookingOrgContext> {
  const { org } = await getCurrentOrgContext();

  return {
    orgId: org.id,
    isBusinessAssociate: org.isBusinessAssociate,
    skipPayment: org.skipPayment,
    markupPercent: Number(org.markupPercent),
    profileAddressComplete: isOrgAddressComplete(org), // NEW
    self: {
      companyName: org.companyName,
      contactName: org.contactName,
      email: org.email,
      phone: org.phone,
      addressLine1: org.addressLine1,
      city: org.city,
      state: org.state,
      country: org.country,
      postalCode: org.postalCode,
    },
  };
}