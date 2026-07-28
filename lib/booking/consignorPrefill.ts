import type { BookingOrgContext, ConsignorForm } from "@/types/booking.types";

export const EMPTY_CONSIGNOR: ConsignorForm = {
  contactName: "",
  companyName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

export function selfToConsignor(
  self: BookingOrgContext["self"],
): ConsignorForm {
  return {
    contactName: self.contactName ?? "",
    companyName: self.companyName ?? "",
    email: self.email ?? "",
    phone: self.phone ?? "",
    addressLine1: self.addressLine1 ?? "",
    addressLine2: "",
    city: self.city ?? "",
    state: self.state ?? "",
    postalCode: self.postalCode ?? "",
    country: self.country ?? "India",
  };
}

export function hasSavedProfile(self: BookingOrgContext["self"]): boolean {
  return !!(
    self.contactName ||
    self.addressLine1 ||
    self.companyName ||
    self.email ||
    self.phone
  );
}
