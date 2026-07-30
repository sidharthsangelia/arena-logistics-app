import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback shared by both rate calculators (international and
 * domestic), which render the same client subtree under different headings.
 *
 * Neither route reads anything from the database, so this only ever covers the
 * route chunk arriving — which should be brief. Everything static is therefore
 * rendered for real, not greyed out: the page heading and subtitle, the section
 * labels, and the field labels. They are identical on every load, so replacing
 * them with grey bars would only make the page say less than it could.
 *
 * The skeletons are limited to the inputs themselves, which is where the user's
 * own data goes and where the interactive form will mount.
 */
export function RateCalculatorLoading({
  title,
  subtitle,
  destinationFieldLabel,
}: {
  title: string;
  subtitle: string;
  /** "Pincode" for domestic, "Postal code" for international. */
  destinationFieldLabel: string;
}) {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="space-y-6">
          {/* Route card */}
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Sending from
                </p>
                <div className="grid grid-cols-[0.5fr_1fr] gap-3">
                  <Field label="Pincode" />
                  <Field label="City" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Sending to</p>
                <div className="grid grid-cols-[0.5fr_1fr] gap-3">
                  <Field label={destinationFieldLabel} />
                  <Field label="City" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Boxes card */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="text-xs font-medium text-foreground">Your boxes</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {["Boxes", "Weight", "Length", "Width", "Height"].map((label) => (
                  <Field key={label} label={label} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action rail: carriers, charged weight, Get Rates */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:gap-6">
              <div className="space-y-2">
                <span className="text-xs font-medium text-foreground">
                  Carriers
                </span>
                <Skeleton className="h-9 w-44" />
              </div>
              <div className="space-y-2 lg:ml-auto">
                <span className="text-xs font-medium text-muted-foreground">
                  Chargeable weight
                </span>
                <Skeleton className="h-7 w-24" />
              </div>
              <Skeleton className="h-11 w-full rounded-md lg:w-52" />
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Field({ label }: { label: string }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
