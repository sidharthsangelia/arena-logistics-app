// components/accounts/SignupHealth.tsx
//
// How far an account got after signing up. Renders the flags computed in
// lib/accounts/health.ts, and a single positive badge when there are none.
//
// No colour beyond the badge variants the rest of the app uses. The flags are
// ordinary states, not alarms: an account that signed up this morning and has
// not booked yet is normal, and painting it red would train ops to ignore the
// colour by the second week.

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getSignupHealthFlags,
  SIGNUP_HEALTH_HINTS,
  SIGNUP_HEALTH_LABELS,
  type SignupHealthInput,
} from "@/lib/accounts/health";

export default function SignupHealth(props: SignupHealthInput) {
  const flags = getSignupHealthFlags(props);

  if (flags.length === 0) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="secondary">Active</Badge>
        </TooltipTrigger>
        <TooltipContent>
          Onboarding finished, paperwork verified, and they have booked at least
          once.
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {flags.map((flag) => (
        <Tooltip key={flag}>
          <TooltipTrigger>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {SIGNUP_HEALTH_LABELS[flag]}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {SIGNUP_HEALTH_HINTS[flag]}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
