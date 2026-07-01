// Razorpay's API works exclusively in the smallest currency unit (paise for
// INR). Your DB stores rupees as Decimal. Keep every paise<->rupee
// conversion funneled through these two functions so there's exactly one
// place rounding behavior can go wrong.

export function rupeesToPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}