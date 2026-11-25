import { RateCalculatorLoading } from "@/components/rate-calculator/RateCalculatorLoading";

/**
 * Arena international calculator. Staff get the carrier picker.
 * Static replica of the form: only the inputs are skeletons. See the component.
 */
export default function ArenaRatesLoading() {
  return (
    <RateCalculatorLoading
      title="Rate Calculator"
      subtitle="Get live freight rates from multiple carriers in seconds."
      scope="international"
      showCarriers
    />
  );
}
