"use client";

import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
  FieldErrors,
} from "react-hook-form";

import { CardTitle } from "@/components/ui/card";
import type { BookingFormData } from "@/types/booking.types";
import { AddressFields } from "../AddressFields";
 

interface Props {
  register: UseFormRegister<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
}

export default function ConsigneeStep({ register, watch, setValue, errors }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <CardTitle>Receiver Details</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Who is receiving this shipment? Enter accurate details — errors here can delay
          customs clearance.
        </p>
      </div>

      <AddressFields
        prefix="consignee"
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        countryLabel="Destination Country"
        addressLabel="Delivery Address"
      />
    </div>
  );
}