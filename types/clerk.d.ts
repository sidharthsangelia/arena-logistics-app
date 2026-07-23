// types/clerk.d.ts
//
// Augment Clerk's global metadata interfaces so `organization.publicMetadata`
// and `organization.privateMetadata` are typed with our org classification.
// Clerk declares these as empty global interfaces (see @clerk/shared); this
// file merges the `orgType` field into them everywhere they are read.

import type { OrgType } from "@/lib/org-type";

declare global {
  interface OrganizationPublicMetadata {
    /** Business Associate vs standard org. Mirrors DB `Org.isBusinessAssociate`. */
    orgType?: OrgType;
  }

  interface OrganizationPrivateMetadata {
    /** Business Associate vs standard org. Mirrors DB `Org.isBusinessAssociate`. */
    orgType?: OrgType;
  }
}

export {};
