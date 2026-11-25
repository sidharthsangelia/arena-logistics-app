import { RateCalculatorLoading } from "@/components/rate-calculator/RateCalculatorLoading";

/**
 * Customer domestic calculator. Customers never see the carrier picker.
 * Static replica of the form: only the inputs are skeletons. See the component.
 */
export default function DomesticRatesLoading() {
  return (
    <RateCalculatorLoading
      title="Domestic Rate Calculator"
      subtitle="Compare live domestic courier rates by pincode in seconds."
      scope="domestic"
    />
  );
}
