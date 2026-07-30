import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getCurrentOrg } from "@/actions/book/getOrgs";
import { AddressBookManager } from "@/components/address/AddressBookManager";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Address book",
};

// The heading is static copy, so it is rendered directly and reaches the browser
// on the first flush. Only the manager needs the org resolved, so only it waits.
export default function AddressBookPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Address book</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save the places you ship from and to. Then fill any booking in one tap
          instead of typing the same details again.
        </p>
      </div>

      <Suspense fallback={<AddressBookSkeleton />}>
        <AddressBookPanel />
      </Suspense>
    </div>
  );
}

async function AddressBookPanel() {
  const org = await getCurrentOrg();

  // Business Associates manage addresses per client, from the client's page.
  // They have no org-wide address book, so this route isn't for them.
  if (org.isBusinessAssociate) notFound();

  return <AddressBookManager party={{ partyType: "ORG", orgId: org.id }} />;
}

/** Mirrors the manager: a search + add row, then a grid of saved address cards. */
function AddressBookSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
