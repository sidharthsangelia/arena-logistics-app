"use client";

import React from 'react'
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import type {
  BookingStep,
} from "@/types/booking.types";

interface Props {
  currentStep: number;
  steps: BookingStep[];
}

export default function ProgressSteps({
  currentStep,
  steps,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-center">
        {steps.map(
          (step, index) => {
            const Icon = step.icon;

            const completed =
              index < currentStep;

            const active =
              index === currentStep;

            return (
              <React.Fragment
                key={step.id}
              >
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border",
                      completed &&
                        "border-primary bg-primary text-primary-foreground",
                      active &&
                        "border-primary",
                    )}
                  >
                    {completed ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>

                  <span className="text-xs font-medium whitespace-nowrap">
                    {step.name}
                  </span>
                </div>

                {index <
                  steps.length - 1 && (
                  <div className="mx-4 h-px w-14 bg-border" />
                )}
              </React.Fragment>
            );
          },
        )}
      </div>
    </div>
  );
}