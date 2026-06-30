"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "light" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors={false}
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-emerald-600" />
        ),
        info: (
          <InfoIcon className="size-4 text-sky-600" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-amber-600" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-rose-600" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-slate-500" />
        ),
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#334155",
          "--normal-border": "#e2e8f0",
          "--border-radius": "14px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-slate-200 shadow-lg shadow-slate-100/50 backdrop-blur-sm",

          title:
            "text-sm font-medium text-slate-800",

          description:
            "text-sm text-slate-500",

          actionButton:
            "bg-slate-900 text-white hover:bg-slate-800",

          cancelButton:
            "bg-slate-100 text-slate-700 hover:bg-slate-200",

          success:
            "bg-emerald-50 border-emerald-100",

          info:
            "bg-sky-50 border-sky-100",

          warning:
            "bg-amber-50 border-amber-100",

          error:
            "bg-rose-50 border-rose-100",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };