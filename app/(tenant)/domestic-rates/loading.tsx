import { RateCalculatorLoading } from "@/components/rate-calculator/RateCalculatorLoading";

/**
 * Same shape as the international calculator's fallback — the two routes share
 * a client subtree and differ only in their heading.
 */
export default function DomesticRatesLoading() {
  return (
    <RateCalculatorLoading
      title="Domestic Rate Calculator"
      subtitle="Compare live domestic courier rates by pincode in seconds."
      destinationFieldLabel="Pincode"
    />
  );
}
