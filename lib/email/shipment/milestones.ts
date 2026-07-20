import { ShipmentStatus } from "@/generated/prisma";

/**
 * The shipment statuses that trigger a customer-facing email. Kept in its own
 * module (no `server-only`) so both the server send path and client UI can
 * agree on exactly which transitions notify the sender.
 */
export const EMAIL_MILESTONE_STATUSES = [
  ShipmentStatus.BOOKED,
  ShipmentStatus.PROCESSING,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
] as const;

export const EMAIL_MILESTONES: ReadonlySet<ShipmentStatus> = new Set(
  EMAIL_MILESTONE_STATUSES,
);

export function isEmailMilestone(status: ShipmentStatus): boolean {
  return EMAIL_MILESTONES.has(status);
}
