"use client";

import React from "react";
import {
  UseFormRegister,
  FieldErrors,
  UseFormWatch,
  UseFormSetValue,
} from "react-hook-form";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookingFormData } from "@/types/booking.types";
import {
  getOrgProfile,
  saveOrgProfile,
  type OrgProfile,
} from "@/actions/book/orgProfile.action";
import { CheckCircle2, Info, Loader2, Save, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Field primitive
// ---------------------------------------------------------------------------

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile status banner
// ---------------------------------------------------------------------------

type ProfileStatus =
  | "loading" // fetching from server
  | "loaded" // profile found, fields pre-filled
  | "empty" // no profile yet, show save option
  | "saved" // user just saved — show confirmation
  | "not-self"; // mode isn't SELF — no banner needed

function ProfileBanner({
  status,
  onSave,
  saving,
  isFilled,
}: {
  status: ProfileStatus;
  onSave: () => void;
  saving: boolean;
  isFilled: boolean;
}) {
  if (status === "not-self" || status === "loading") return null;

  if (status === "loaded") {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <UserCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Pre-filled from your saved profile. Edit below if needed.
        </p>
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
          <p className="text-sm font-medium text-foreground">
            No saved profile yet
          </p>
          <p className="text-xs text-muted-foreground">
            Fill in your details below. Once done, you can save them as your
            default sender profile so this step auto-fills on future bookings.
          </p>
        </div>
      </div>

      {isFilled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="gap-2"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
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
  /** Whether the wizard is currently in "SELF" mode */
  isSelfMode: boolean;
}

// ---------------------------------------------------------------------------
// ConsignorStep
// ---------------------------------------------------------------------------

export function ConsignorStep({
  register,
  errors,
  watch,
  setValue,
  isSelfMode,
}: Props) {
  const e = errors.consignor as any;

  const [profileStatus, setProfileStatus] = React.useState<ProfileStatus>(
    isSelfMode ? "loading" : "not-self",
  );
  const [saving, setSaving] = React.useState(false);

  // Track whether the user originally had no profile (to show save button).
  const hadNoProfile = React.useRef(false);

  // ── On mount / mode change: fetch org profile if SELF ───────────────────
  React.useEffect(() => {
    if (!isSelfMode) {
      setProfileStatus("not-self");
      return;
    }

    setProfileStatus("loading");

    getOrgProfile().then((result) => {
      if (result.exists) {
        // Pre-fill RHF fields from the stored profile
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
        hadNoProfile.current = false;
        setProfileStatus("loaded");
      } else {
        hadNoProfile.current = true;
        setProfileStatus("empty");
      }
    });
    // only re-run if mode flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSelfMode]);

  // ── Check if the form has enough content to offer "Save profile" ─────────
  const contactName = watch("consignor.contactName");
  const companyName = watch("consignor.companyName");
  const email = watch("consignor.email");
  const addressLine1 = watch("consignor.addressLine1");
  const city = watch("consignor.city");

  const isFormFilled = Boolean(
    contactName && companyName && email && addressLine1 && city,
  );

  // ── Save profile handler ─────────────────────────────────────────────────
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
      hadNoProfile.current = false;
      setProfileStatus("saved");

      toast.success("Profile saved");
    } else {
      toast.error(result.message);
    }
    // On error: stay in "empty" — user can try again. We could surface the
    // error in a toast here, but keep it simple for now.


  };

  // Only show the "save" option when:
  //   - SELF mode
  //   - They originally had no profile (hadn't saved before this session)
  //   - Not already saved this session
  const showSaveOption =
    isSelfMode && hadNoProfile.current && profileStatus !== "saved";

  // ── Loading skeleton ─────────────────────────────────────────────────────
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

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <CardTitle>Sender details</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {isSelfMode
            ? "Your organisation's details as the sender."
            : "Review and confirm the sender's details. Edit before continuing if needed."}
        </p>
      </div>

      {/* Profile status banner */}
      <ProfileBanner
        status={
          showSaveOption
            ? profileStatus
            : profileStatus === "saved"
              ? "saved"
              : profileStatus
        }
        onSave={handleSaveProfile}
        saving={saving}
        isFilled={isFormFilled}
      />

      {/* Form fields */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact name" error={e?.contactName?.message}>
          <Input
            {...register("consignor.contactName")}
            placeholder="Jane Smith"
            className={cn(e?.contactName && "border-destructive")}
          />
        </Field>
        <Field label="Company name" error={e?.companyName?.message}>
          <Input
            {...register("consignor.companyName")}
            placeholder="Acme Exports Pvt Ltd"
            className={cn(e?.companyName && "border-destructive")}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" error={e?.email?.message}>
          <Input
            type="email"
            {...register("consignor.email")}
            placeholder="jane@acme.com"
            className={cn(e?.email && "border-destructive")}
          />
        </Field>
        <Field label="Phone" error={e?.phone?.message}>
          <Input
            {...register("consignor.phone")}
            placeholder="+91 98765 43210"
            className={cn(e?.phone && "border-destructive")}
          />
        </Field>
      </div>

      <Field label="Address line 1" error={e?.addressLine1?.message}>
        <Input
          {...register("consignor.addressLine1")}
          placeholder="123 Export House, MG Road"
          className={cn(e?.addressLine1 && "border-destructive")}
        />
      </Field>

      <Field label="Address line 2 (optional)" error={e?.addressLine2?.message}>
        <Input
          {...register("consignor.addressLine2")}
          placeholder="Near Customs Office"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="City" error={e?.city?.message}>
          <Input
            {...register("consignor.city")}
            placeholder="Mumbai"
            className={cn(e?.city && "border-destructive")}
          />
        </Field>
        <Field label="State" error={e?.state?.message}>
          <Input {...register("consignor.state")} placeholder="Maharashtra" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Postal code" error={e?.postalCode?.message}>
          <Input
            {...register("consignor.postalCode")}
            placeholder="400001"
            className={cn(e?.postalCode && "border-destructive")}
          />
        </Field>
        <Field label="Country" error={e?.country?.message}>
          <Input
            {...register("consignor.country")}
            placeholder="India"
            className={cn(e?.country && "border-destructive")}
          />
        </Field>
      </div>
    </div>
  );
}
