import { OrgDocumentsSectionSkeleton } from "@/components/documents/OrgDocumentsSection";

import {
  MyDocumentsCard,
  VaultHeading,
  VaultPageFrame,
  VaultSubtitleSkeleton,
} from "./parts";

/**
 * Same frame as the page (parts.tsx): the heading, the "My documents" card and
 * every document's name, hint and upload box render for real. Only the subtitle
 * (worded by org type) and what the org has on file are skeletons.
 *
 * The Business Associate "Client documents" table is left out: whether it
 * exists depends on the org, and it sits last, so it appearing moves nothing.
 */
export default function Loading() {
  return (
    <VaultPageFrame>
      <VaultHeading subtitle={<VaultSubtitleSkeleton />} />
      <MyDocumentsCard>
        <OrgDocumentsSectionSkeleton />
      </MyDocumentsCard>
    </VaultPageFrame>
  );
}
