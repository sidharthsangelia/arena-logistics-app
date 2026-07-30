import { RateCalculatorLoading } from "@/components/rate-calculator/RateCalculatorLoading";

/**
 * The rate calculator fetches nothing on load — the heading is static and the
 * form is a client subtree — so this only covers the route chunk arriving. The
 * heading is rendered for real rather than skeletoned, since it is already known.
 */
export default function RatesLoading() {
  return (
    <RateCalculatorLoading
      title="Rate Calculator"
      subtitle="Get live freight rates from multiple carriers in seconds."
      destinationFieldLabel="Postal code"
    />
  );
}
