"use client";

import React from "react";
import {
  UseFormRegister,
  FieldErrors,
  UseFormWatch,
  UseFormSetValue,
} from "react-hook-form";
import { CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingFormData } from "@/types/booking.types";
import {
  getOrgProfile,
  saveOrgProfile,
  type OrgProfile,
} from "@/actions/book/orgProfile.action";
import { CheckCircle2, Info, Loader2, Save, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { AddressFields } from "../AddressFields";


// ---------------------------------------------------------------------------
// Profile status banner
// ---------------------------------------------------------------------------

type ProfileStatus = "loading" | "loaded" | "empty" | "saved" | "not-self";

function ProfileBanner({
  status,
  onSave,
  saving,
  canSave,
}: {
  status: ProfileStatus;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
}) {
  if (status === "not-self" || status === "loading") return null;

  if (status === "loaded") {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <div className="flex items-start gap-3">
          <UserCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Pre-filled from your saved profile. Edit below if needed.
          </p>
        </div>
        {canSave && (
          <Button type="button" variant="ghost" size="sm" onClick={onSave} disabled={saving} className="shrink-0 gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Update profile
          </Button>
        )}
      </div>
    );
  }

  if (status === "saved") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-foreground" />
        <p className="text-foreground font-medium">
          Profile saved — these details will pre-fill automatically next time.
        </p>
      </div>
    );
  }

  // status === "empty"
  return (
    <div className="rounded-lg border border-dashed px-4 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">No saved profile yet</p>
          <p className="text-xs text-muted-foreground">
            Fill in your details below, then save them as your default sender profile so
            this step auto-fills on future bookings.
          </p>
        </div>
      </div>

      {canSave && (
        <Button type="button" variant="outline" size="sm" onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save as my profile"}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  register: UseFormRegister<BookingFormData>;
  errors: FieldErrors<BookingFormData>;
  watch: UseFormWatch<BookingFormData>;
  setValue: UseFormSetValue<BookingFormData>;
  isSelfMode: boolean;
}

export function ConsignorStep({ register, errors, watch, setValue, isSelfMode }: Props) {
  const [profileStatus, setProfileStatus] = React.useState<ProfileStatus>(
    isSelfMode ? "loading" : "not-self",
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!isSelfMode) {
      setProfileStatus("not-self");
      return;
    }

    setProfileStatus("loading");

    getOrgProfile().then((result) => {
      if (result.exists) {
        const p = result.profile as OrgProfile;
        setValue("consignor.contactName", p.contactName ?? "");
        setValue("consignor.companyName", p.companyName ?? "");
        setValue("consignor.email", p.email ?? "");
        setValue("consignor.phone", p.phone ?? "");
        setValue("consignor.addressLine1", p.addressLine1 ?? "");
        setValue("consignor.city", p.city ?? "");
        setValue("consignor.state", p.state ?? "");
        setValue("consignor.country", p.country ?? "India");
        setValue("consignor.postalCode", p.postalCode ?? "");
        setProfileStatus("loaded");
      } else {
        setProfileStatus("empty");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelfMode]);

  const contactName = watch("consignor.contactName");
  const companyName = watch("consignor.companyName");
  const email = watch("consignor.email");
  const addressLine1 = watch("consignor.addressLine1");
  const city = watch("consignor.city");

  const isFormFilled = Boolean(contactName && companyName && email && addressLine1 && city);

  const handleSaveProfile = async () => {
    setSaving(true);
    const result = await saveOrgProfile({
      contactName: watch("consignor.contactName") ?? "",
      companyName: watch("consignor.companyName") ?? "",
      email: watch("consignor.email") ?? "",
      phone: watch("consignor.phone") ?? "",
      addressLine1: watch("consignor.addressLine1") ?? "",
      city: watch("consignor.city") ?? "",
      state: watch("consignor.state") ?? undefined,
      country: watch("consignor.country") ?? "",
      postalCode: watch("consignor.postalCode") ?? "",
    });
    setSaving(false);

    if (result.success) {
      setProfileStatus("saved");
      toast.success("Profile saved");
    } else {
      toast.error(result.message);
    }
  };

  if (profileStatus === "loading") {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="space-y-1">
          <div className="h-6 w-40 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="h-12 rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted" />
          ))}
        </div>
        <div className="h-10 rounded bg-muted" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <CardTitle>Sender details</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {isSelfMode
            ? "Your organisation's details as the sender."
            : "Review and confirm the sender's details. Edit before continuing if needed."}
        </p>
      </div>

      <ProfileBanner
        status={profileStatus}
        onSave={handleSaveProfile}
        saving={saving}
        canSave={isSelfMode && isFormFilled}
      />

      <AddressFields
        prefix="consignor"
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        countryLabel="Country"
        addressLabel="Pickup Address"
      />
    </div>
  );
}