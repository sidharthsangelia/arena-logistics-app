/**
 * The frame every signed-out screen shares: sign in, create account and
 * workspace setup.
 *
 *   • Desktop: a quiet story panel on the left (emblem, one headline, what the
 *     app does) and the form centred on the right.
 *   • Phone: the panel is dropped and the emblem sits above the form.
 *
 * Customer-facing, so the copy never names a carrier or vendor, and it speaks
 * to both direct shippers and business associates.
 */

import Image from "next/image";
import {
  Calculator,
  Check,
  MapPinned,
  Plane,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const LEGAL_NAME = "Arena Cargo and Logistics India Private Limited";

type Feature = { icon: LucideIcon; title: string; text: string };

const BOOK: Feature = {
  icon: Plane,
  title: "International and domestic",
  text: "Book exports abroad and parcels across India from the same form.",
};
const RATES: Feature = {
  icon: Calculator,
  title: "Live rates",
  text: "See prices and transit times side by side before you book.",
};
const TRACK: Feature = {
  icon: MapPinned,
  title: "Tracking on every leg",
  text: "Pickup, export and delivery on one timeline, until it reaches the door.",
};
const BILLING: Feature = {
  icon: Wallet,
  title: "Wallet and GST invoices",
  text: "Pay from a prepaid wallet and download your invoices any time.",
};
const PARTNERS: Feature = {
  icon: Users,
  title: "Shipping for your clients?",
  text: "Arena can turn on partner tools for your workspace: a client list, bookings on their behalf and branded quotes.",
};

const STORIES = {
  "sign-in": {
    headline: "Everything you ship, in one place.",
    body: "Compare prices, book international and domestic shipments, and follow each one to delivery.",
    features: [BOOK, RATES, TRACK, BILLING],
  },
  "sign-up": {
    headline: "Open your shipping account.",
    body: "Create your login and name your workspace. You can check prices straight away.",
    features: [BOOK, RATES, TRACK, PARTNERS],
  },
} satisfies Record<string, { headline: string; body: string; features: Feature[] }>;

/** The order the getting-started guide teaches, with this screen as step 1. */
const SETUP_STEPS = [
  { title: "Name your workspace", text: "Your bookings, wallet and documents live inside it." },
  { title: "Add your contact details", text: "Your address becomes the sender on every booking." },
  { title: "Upload your PAN and Aadhaar", text: "Once. They are attached to each shipment for you." },
  { title: "Top up and book", text: "Bookings are paid from your wallet as you confirm them." },
];

export type AuthStory = keyof typeof STORIES | "onboarding";

function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Image
        src="/arena_mark.png"
        alt=""
        width={40}
        height={40}
        priority
        className="size-10 shrink-0 object-contain"
      />
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-foreground">Arena Cargo</p>
        <p className="text-xs text-muted-foreground">and Logistics</p>
      </div>
    </div>
  );
}

function FeatureList({ features }: { features: Feature[] }) {
  return (
    <ul className="space-y-5">
      {features.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground shadow-xs">
            <Icon className="size-4" aria-hidden />
          </span>
          <div className="pt-0.5">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SetupSteps() {
  return (
    <ol className="space-y-5">
      {SETUP_STEPS.map((step, i) => {
        const current = i === 0;
        return (
          <li key={step.title} className="flex gap-3.5">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium tabular-nums",
                current
                  ? "border-foreground bg-foreground text-background"
                  : "bg-background text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <div className="pt-0.5">
              <p
                className={cn(
                  "text-sm font-medium",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.title}
                {current && <span className="sr-only"> (this step)</span>}
              </p>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{step.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function AuthShell({
  story,
  children,
}: {
  story: AuthStory;
  children: React.ReactNode;
}) {
  const isSetup = story === "onboarding";
  const copy = isSetup
    ? {
        headline: "Almost there.",
        body: "Name your workspace and you are in. The rest can wait until you are ready to book.",
      }
    : STORIES[story];

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <aside className="hidden flex-col justify-between border-r bg-muted/40 p-10 lg:flex xl:p-14">
        <BrandLockup />

        <div className="max-w-md py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-foreground">
            {copy.headline}
          </h1>
          <p className="mt-3 text-sm leading-6 text-pretty text-muted-foreground">{copy.body}</p>
          <div className="mt-10">
            {isSetup ? <SetupSteps /> : <FeatureList features={STORIES[story].features} />}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{LEGAL_NAME}</p>
      </aside>

      <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="flex w-full max-w-[25rem] flex-col items-center">
          <BrandLockup className="mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
