// app/sign-up/[[...sign-up]]/page.tsx

import { SignUp } from "@clerk/nextjs";
import { PackageSearch, FileText, Truck } from "lucide-react";
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
                    Freight Management & Quotation Platform
                  </p>
                </div>
              </div>

              <div className="max-w-md space-y-6">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight">
                    Create your workspace account
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Start managing international shipments, generating branded
                    freight quotations, and accessing real time carrier pricing
                    through a centralized logistics workflow.
                  </p>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
                    <Truck className="mt-0.5 h-5 w-5 text-muted-foreground" />

                    <div>
                      <p className="text-sm font-medium">
                        Shipment rate management
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Instantly compare courier and freight pricing across
                        multiple international carriers.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
                    <FileText className="mt-0.5 h-5 w-5 text-muted-foreground" />

                    <div>
                      <p className="text-sm font-medium">
                        Professional quotations
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Generate clean client ready freight quotations with your
                        operational details and pricing structure.
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
                Create account
              </h2>

              <p className="text-sm text-muted-foreground">
                Register to access the freight operations dashboard.
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <SignUp
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