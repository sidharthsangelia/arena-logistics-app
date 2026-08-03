/**
 * lib/booking/firstMilePickup.ts
 *
 * Shared contract for the ops "book the door pickup" flow. Types live here (not
 * in the "use server" action file, which may only export async functions) so the
 * action and the review dialog agree on one shape.
 */

/**
 * The result of QUEUEING a pickup, not of placing one.
 *
 * `success` means the job was accepted, not that a courier has been assigned:
 * the booking runs as a durable Inngest function and issues its AWB
 * asynchronously. `awb` and `carrier` are therefore null on a fresh queue and
 * are read off the shipment row once the job has written them.
 *
 * The old `code: "COURIER_UNRESOLVED"` case is gone with the synchronous flow
 * that produced it. Ops now authorise an auto-assigned courier UP FRONT, in the
 * confirmation dialog, because the action returns long before the courier has
 * been resolved. A pickup that fails for that reason surfaces as a notification
 * and a timeline entry rather than as a return value.
 */
export type BookFirstMileResult =
  | { success: true; awb: string | null; carrier: string | null }
  | { success: false; message: string };
