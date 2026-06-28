"use server";

import { z } from "zod";
import { prisma } from "@/utils/db";
import { resolveOrgContext } from "@/actions/book/resolveOrg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgProfile {
  contactName:  string | null;
  companyName:  string | null;
  email:        string | null;
  phone:        string | null;
  addressLine1: string | null;
  city:         string | null;
  state:        string | null;
  country:      string | null;
  postalCode:   string | null;
}

export type OrgProfileResult =
  | { exists: true;  profile: OrgProfile }
  | { exists: false; profile: null };

function hasProfile(org: OrgProfile): boolean {
  return !!(
    org.contactName  ||
    org.companyName  ||
    org.email        ||
    org.phone        ||
    org.addressLine1
  );
}

// ---------------------------------------------------------------------------
// getOrgProfile
// ---------------------------------------------------------------------------

export async function getOrgProfile(): Promise<OrgProfileResult> {
  try {
    const { org } = await resolveOrgContext();

    const profile: OrgProfile = {
      contactName:  org.contactName,
      companyName:  org.companyName,
      email:        org.email,
      phone:        org.phone,
      addressLine1: org.addressLine1,
      city:         org.city,
      state:        org.state,
      country:      org.country,
      postalCode:   org.postalCode,
    };

    if (hasProfile(profile)) {
      return { exists: true, profile };
    }

    return { exists: false, profile: null };
  } catch (err) {
    console.error("[getOrgProfile]", err);
    return { exists: false, profile: null };
  }
}

// ---------------------------------------------------------------------------
// saveOrgProfile
// ---------------------------------------------------------------------------

const saveOrgProfileSchema = z.object({
  contactName:  z.string().min(1, "Required"),
  companyName:  z.string().min(1, "Required"),
  email:        z.string().email("Invalid email"),
  phone:        z.string().min(1, "Required"),
  addressLine1: z.string().min(1, "Required"),
  city:         z.string().min(1, "Required"),
  state:        z.string().optional(),
  country:      z.string().min(1, "Required"),
  postalCode:   z.string().min(1, "Required"),
});

export type SaveOrgProfileInput = z.infer<typeof saveOrgProfileSchema>;

export type SaveOrgProfileResult =
  | { success: true }
  | { success: false; message: string };

export async function saveOrgProfile(
  input: SaveOrgProfileInput,
): Promise<SaveOrgProfileResult> {
  const parsed = saveOrgProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Validation failed.",
    };
  }

  try {
    const { org } = await resolveOrgContext();

    await prisma.org.update({
      where: { id: org.id },
      data: {
        contactName:  parsed.data.contactName,
        companyName:  parsed.data.companyName,
        email:        parsed.data.email,
        phone:        parsed.data.phone,
        addressLine1: parsed.data.addressLine1,
        city:         parsed.data.city,
        state:        parsed.data.state ?? null,
        country:      parsed.data.country,
        postalCode:   parsed.data.postalCode,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("[saveOrgProfile]", err);
    return { success: false, message: "Could not save profile. Try again." };
  }
}