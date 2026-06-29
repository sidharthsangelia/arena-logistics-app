import BookingWizard from "@/components/booking/BookingWizard";

export default function BookPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Book Order
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Create and confirm a new shipment booking.
        </p>
      </div>
      <BookingWizard />
    </div>
  );
}
