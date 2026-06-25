"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BookingStep } from "@/types/booking.types";

interface Props {
  currentStep: number;
  steps: BookingStep[];
}

export default function ProgressSteps({ currentStep, steps }: Props) {
  const progress = (currentStep / (steps.length - 1)) * 100;

  return (
    <div className="space-y-3 pb-2">
      {/* Step label row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {steps[currentStep]?.name}
        </p>
        <p className="text-xs text-muted-foreground">
          Step {currentStep + 1} of {steps.length}
        </p>
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step dots */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const completed = index < currentStep;
          const active = index === currentStep;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200",
                  completed && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-background text-primary shadow-sm ring-2 ring-primary/20",
                  !completed && !active && "border-muted-foreground/30 bg-muted text-muted-foreground",
                )}
              >
                {completed ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span
                className={cn(
                  "hidden text-[10px] font-medium sm:block whitespace-nowrap",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}