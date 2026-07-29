// app/(arena)/arena-dashboard/business-associates/[id]/page.tsx
//
// This page moved to /arena-dashboard/accounts/[id].
//
// It never was a business associate page. It read any organisation and was the
// only way to inspect a standard signup, which is exactly the confusion the
// Accounts list was added to clear up. There is now one detail page, and both
// lists link to it.
//
// The route stays behind as a redirect because these URLs are bookmarked and
// pasted into chats. A temporary redirect rather than a permanent one, so a
// future move is not fighting a 308 cached in everyone's browser forever.

import { redirect } from "next/navigation";

export default async function BusinessAssociateDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/arena-dashboard/accounts/${id}`);
}
