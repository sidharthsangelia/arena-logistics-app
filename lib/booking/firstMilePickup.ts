/**
 * lib/booking/firstMilePickup.ts
 *
 * Shared contract for the ops "book the door pickup with Shipmozo" flow. Types
 * live here (not in the "use server" action file, which may only export async
 * functions) so the action and the review dialog agree on one shape.
 */

export type BookFirstMileResult =
  | { success: true; awb: string | null; carrier: string | null }
  // `code: "COURIER_UNRESOLVED"` means we could not confirm the exact courier
  // the customer paid for, and auto-assign was not authorised — the UI offers an
  // explicit override rather than silently booking a different service.
  | { success: false; message: string; code?: "COURIER_UNRESOLVED" };
