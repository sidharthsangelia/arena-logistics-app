// app/sign-in/[[...sign-in]]/page.tsx

import { SignIn } from "@clerk/nextjs";
import { PackageSearch, ShieldCheck, Globe2 } from "lucide-react";
import Image from "next/image";

export default function Page() {
  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left section */}
        <div className="hidden border-r bg-muted/30 lg:flex">
          <div className="flex w-full flex-col justify-between p-12">
            <div>
              <div className="mb-8 flex items-center gap-3">
               
                <Image src="/arena_logo.png" alt="Arena Cargo Logistics" width={84} height={62} />

                <div>
                  <h1 className="text-lg font-semibold tracking-tight">
                    Arena Cargo Logistics
                  </h1>

                  <p className="text-sm text-muted-foreground">
                    International Freight Operations Platform
                  </p>
                </div>
              </div>

              <div className="max-w-md space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Access your freight workspace
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Manage international shipments, generate client quotations,
                    compare carrier rates, and streamline logistics operations
                    from a single dashboard.
                  </p>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
                    <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />

                    <div>
                      <p className="text-sm font-medium">
                        Secure company access
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Protected access for internal operations, quotations,
                        and shipment workflows.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
                    <Globe2 className="mt-0.5 h-5 w-5 text-muted-foreground" />

                    <div>
                      <p className="text-sm font-medium">
                        Multi carrier rate engine
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Compare DHL, Aramex, UPS, Skynet, and additional
                        logistics partners in real time.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Arena Cargo And Logistics India Private Limited
            </p>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2 text-center lg:text-left">
              <h2 className="text-2xl font-semibold tracking-tight">
                Sign in
              </h2>

              <p className="text-sm text-muted-foreground">
                Enter your account credentials to continue.
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <SignIn
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border-0 bg-transparent p-0",
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}