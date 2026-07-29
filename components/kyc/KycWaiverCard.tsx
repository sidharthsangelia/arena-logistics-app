"use client";

/**
 * KycWaiverCard
 *
 * Card chrome around KycWaiverControl, for pages with no settings card to put
 * the switch in — today that is a client's detail page. The account detail page
 * does have one, so it renders the control directly inside Business settings
 * next to Skip payment rather than using this.
 *
 * Everything that matters lives in KycWaiverControl. This is a frame.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";

import KycWaiverControl, {
  type KycWaiverSummary,
  type WaiverParty,
} from "./KycWaiverControl";

export type { KycWaiverSummary, WaiverParty };

type Props = {
  party: WaiverParty;
  partyName: string;
  waiver: KycWaiverSummary | null;
};

export default function KycWaiverCard({ party, partyName, waiver }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">KYC waiver</CardTitle>
          <CardDescription>
            For customers who have spoken to the operations team and cannot
            produce their full paperwork yet.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <KycWaiverControl
            party={party}
            partyName={partyName}
            waiver={waiver}
          />
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
