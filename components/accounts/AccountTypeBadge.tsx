// components/accounts/AccountTypeBadge.tsx
//
// The one place that decides how an account's standing looks, so the list, the
// associates table and the detail header cannot drift into three vocabularies
// for the same two states.

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  isBusinessAssociate: boolean;
  /** Renders the payment bypass alongside, where that is worth knowing. */
  skipPayment?: boolean;
};

export default function AccountTypeBadge({
  isBusinessAssociate,
  skipPayment = false,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isBusinessAssociate ? (
        <Badge variant="secondary">Business associate</Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Standard
        </Badge>
      )}

      {skipPayment && (
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline">Skip payment</Badge>
          </TooltipTrigger>
          <TooltipContent>
            Shipments for this account bypass wallet and payment checks.
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
