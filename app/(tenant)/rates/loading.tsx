import { RateCalculatorLoading } from "@/components/rate-calculator/RateCalculatorLoading";

/**
 * Customer international calculator. Customers never see the carrier picker.
 * Static replica of the form: only the inputs are skeletons. See the component.
 */
export default function RatesLoading() {
  return (
    <RateCalculatorLoading
      title="Rate Calculator"
      subtitle="Get live freight rates from multiple carriers in seconds."
      scope="international"
    />
  );
}
