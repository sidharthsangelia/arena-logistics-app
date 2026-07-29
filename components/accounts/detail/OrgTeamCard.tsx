// components/accounts/detail/OrgTeamCard.tsx
//
// The actual people behind an account.
//
// Worth its own card because nothing else in the app answers it. Our database
// stores organisations; the humans who sign in live in Clerk. When ops needs to
// ring someone about a stuck shipment, "who is this account" and "who do I call"
// are different questions, and the contact card only answers the first.
//
// Rendered behind its own Suspense boundary by the page, because reaching Clerk
// is a network call and the rest of the page should not wait on it.

import { Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMemberRole, type OrgTeamMember } from "@/queries/accounts";
import { formatDate, getInitials } from "@/lib/utils";

type Props = {
  /** Null means Clerk could not be reached. Empty means nobody is a member. */
  members: OrgTeamMember[] | null;
};

export default function OrgTeamCard({ members }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" />
          People
        </CardTitle>
        <CardDescription>
          {members === null
            ? "Who can sign in to this account."
            : `${members.length} ${members.length === 1 ? "person" : "people"} can sign in to this account.`}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {members === null ? (
          // Stated plainly rather than shown as an error. The rest of the page
          // is fine, and a member list we could not fetch is not a page failure.
          <p className="text-sm text-muted-foreground">
            We could not load the member list just now. Refresh to try again.
          </p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has joined this organisation yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {members.map((member) => (
              <li key={member.id} className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  {member.imageUrl && (
                    <AvatarImage src={member.imageUrl} alt="" />
                  )}
                  <AvatarFallback className="text-xs font-medium">
                    {getInitials(member.name ?? member.email ?? "?")}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {member.name ?? member.email ?? "Unknown user"}
                    </p>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {formatMemberRole(member.role)}
                    </Badge>
                  </div>

                  {member.name && member.email && (
                    <p className="break-all text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Joined {formatDate(member.joinedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
