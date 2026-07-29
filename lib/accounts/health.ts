// lib/accounts/health.ts
//
// Signup health: the difference between an account that exists and an account
// that is actually trading. Someone opening the Accounts list is usually asking
// which of these signups are real, and this answers it from fields we already
// store, with no schema change and no extra query.
//
// Pure module, no server imports, so both the table cell and any future export
// or digest can share one definition of "incomplete".
//
// The flag values match the health filter keys in ./filters.ts on purpose: what
// the badge says and what the dropdown filters by are the same three words.

export const SIGNUP_HEALTH_FLAGS = [
  "profile-incomplete",
  "kyc-pending",
  "never-booked",
] as const;

export type SignupHealthFlag = (typeof SIGNUP_HEALTH_FLAGS)[number];

export const SIGNUP_HEALTH_LABELS: Record<SignupHealthFlag, string> = {
  "profile-incomplete": "Profile incomplete",
  "kyc-pending": "KYC not verified",
  "never-booked": "Never booked",
};

/** Why the flag is set, shown on hover so ops does not have to guess. */
export const SIGNUP_HEALTH_HINTS: Record<SignupHealthFlag, string> = {
  "profile-incomplete": "They signed up but never finished onboarding.",
  "kyc-pending":
    "No document on this account has been verified yet. Uploads may still be waiting on a check.",
  "never-booked": "This account has not booked a single shipment.",
};

export type SignupHealthInput = {
  profileCompletedAt: Date | null;
  verifiedKycCount: number;
  shipmentCount: number;
};

/**
 * Returns the flags that apply, in the order they should be read: onboarding
 * first, then paperwork, then activity. An empty array means the account is in
 * good standing, which callers render as a single positive badge rather than as
 * the absence of anything.
 */
export function getSignupHealthFlags({
  profileCompletedAt,
  verifiedKycCount,
  shipmentCount,
}: SignupHealthInput): SignupHealthFlag[] {
  const flags: SignupHealthFlag[] = [];

  if (!profileCompletedAt) flags.push("profile-incomplete");
  if (verifiedKycCount === 0) flags.push("kyc-pending");
  if (shipmentCount === 0) flags.push("never-booked");

  return flags;
}
