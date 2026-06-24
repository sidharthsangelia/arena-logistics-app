import { PackagePlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import BookingMultiStepForm from "@/components/book/BookingMultiStepForm";
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
{/* 
      <Card className="shadow-sm">
        <CardHeader className="text-center py-16">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <PackagePlus className="h-8 w-8 text-emerald-600" />
          </div>
          <CardTitle className="text-xl">Booking Form Coming Soon</CardTitle>
          <CardDescription className="max-w-sm mx-auto mt-2">
            The order booking flow is under development. Start by getting a rate
            quote, then we&apos;ll walk you through confirming your shipment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-16">
          <Button asChild variant="outline">
            <Link href="/rates">Get a Rate Quote First</Link>
          </Button>
        </CardContent>
      </Card> */}
{/* 
      <BookingMultiStepForm/> */}

      <BookingWizard/>
    </div>
  );
}