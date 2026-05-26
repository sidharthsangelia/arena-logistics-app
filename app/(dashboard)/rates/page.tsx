import RatesClient from "./RatesClient";

export default function RatesPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Rate Calculator
        </h1>

        <p className="text-sm text-slate-500 mt-1">
          Get live shipping rates from all carriers instantly.
        </p>
      </div>

      <RatesClient />
    </div>
  );
}