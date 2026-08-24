"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { UseFormSetValue } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isCompanyParty } from "@/lib/booking/domesticDocs";
import { getActiveSteps, initialFormData } from "@/hooks/useBookingWizard";
import type { BookingFormData } from "@/types/booking.types";

import ProgressSteps from "./ProgessSteps";
import ModeStep from "./steps/ModeStep";

/**
 * What the booking wizard looks like while its org context and saved draft are
 * still in flight.
 *
 * There is not a single Skeleton block in here, and that is the point: nothing
 * on the wizard's first screen comes from the database. The step list, the
 * progress bar, the "What kind of shipment is this?" question, both mode tiles
 * and the navigation buttons are all fixed content the browser can draw before
 * the server has answered anything, so they are drawn — as the real components,
 * not as grey bars standing in for them.
 *
 * It is deliberately the SAME component tree the wizard mounts, seeded from the
 * SAME `initialFormData`, so the handover is pixel-identical for a fresh
 * booking and moves nothing. Two things it cannot know are settled by the
 * fetch it is waiting on:
 *
 *  • a saved draft resumes at a later step, replacing this body and adding the
 *    "Resumed your saved booking" banner;
 *  • that draft may be a domestic booking, moving the tile selection.
 *
 * Both are content the server has to supply. Guessing them with placeholder
 * boxes would not avoid the change — it would only make the common case (a
 * fresh booking, which this matches exactly) shift as well.
 */
export default function BookingWizardSkeleton() {
  // Derived, not hardcoded to "7 steps": the wizard computes its step list the
  // same way from the same seed, so an added or removed step reshapes both at
  // once and the progress bar can never disagree with the one that replaces it.
  const steps = getActiveSteps({
    mode: initialFormData.mode,
    pickupIncluded: initialFormData.pickupIncluded,
    senderIsCompany: isCompanyParty(initialFormData.consignor),
  });

  return (
    // `inert` (React 19) takes the whole shell out of the tab order and
    // swallows clicks without painting a single pixel differently, so the
    // buttons below can render in their real, enabled state instead of a
    // disabled one that would fade back to full opacity at the handover.
    <div className="mx-auto max-w-6xl py-8" aria-busy inert>
      <Card>
        <CardHeader>
          <ProgressSteps currentStep={0} steps={steps} />
        </CardHeader>

        <CardContent>
          <div className="space-y-8">
            <ModeStep data={initialFormData} onChange={noop} setValue={noopSetValue} />

            <div className="flex items-center justify-between border-t pt-6">
              <Button type="button" variant="outline" disabled>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>

              {/* Disabled on Previous mirrors the real wizard on step 0; Next
                  is left enabled for the same reason — that is how it renders
                  the moment the wizard mounts. */}
              <div className="flex flex-col items-end gap-1.5">
                <Button type="button">
                  Save &amp; Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const noop = () => {};

// ModeStep only reads `data.mode` while rendering; its setValue is called from
// the click handler, which cannot fire behind `pointer-events-none`.
const noopSetValue = (() => {}) as unknown as UseFormSetValue<BookingFormData>;
