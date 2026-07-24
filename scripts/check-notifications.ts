/**
 * Behavioural checks for the client-email decision and the attention sweep.
 *
 * Pure-logic assertions plus a few live reads. Run with:
 *   npx tsx scripts/check-notifications.ts
 *
 * Not a test runner, deliberately: the repo has no test setup, and a script that
 * prints PASS/FAIL lines and exits non-zero is enough to prove the matrices hold and
 * the new columns are queryable against the real database.
 */

import {
  resolveClientEmailDecision,
  type ClientEmailPreferenceKey,
} from "../lib/email/clientEmails";
import {
  collectionBucketFor,
  stuckBucketFor,
} from "../lib/notifications/attentionSweep";
import { ShipmentStatus } from "../generated/prisma";
import { prisma } from "../utils/db";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Client-email decision matrix
// ---------------------------------------------------------------------------

console.log("\nClient-email decision");

const base = {
  isBusinessAssociate: true,
  hasClient: true,
  clientEmail: "client@example.com",
  orgEnabled: true,
  orgMilestones: [ShipmentStatus.BOOKED, ShipmentStatus.DELIVERED],
  clientPreference: "INHERIT" as ClientEmailPreferenceKey,
  status: ShipmentStatus.BOOKED,
};

// Standard org: always direct, whatever else is set.
check(
  "standard org ships direct",
  resolveClientEmailDecision({ ...base, isBusinessAssociate: false }).route === "direct",
);
// BA shipping for itself (no client) is direct too.
check(
  "BA without a client ships direct",
  resolveClientEmailDecision({ ...base, hasClient: false }).route === "direct",
);
// The happy path: on, milestone selected, address present.
check("BA + on + selected milestone emails client", resolveClientEmailDecision(base).route === "client");
// Org off diverts to the associate, reason org-off.
{
  const d = resolveClientEmailDecision({ ...base, orgEnabled: false });
  check("org off diverts to associate", d.route === "associate" && d.reason === "org-off");
}
// Client pinned NEVER beats org on.
{
  const d = resolveClientEmailDecision({ ...base, clientPreference: "NEVER" });
  check("client NEVER overrides org on", d.route === "associate" && d.reason === "client-off");
}
// Client pinned ALWAYS beats org off.
check(
  "client ALWAYS overrides org off",
  resolveClientEmailDecision({ ...base, orgEnabled: false, clientPreference: "ALWAYS" }).route === "client",
);
// ALWAYS still respects the milestone selection: a status not chosen is not sent,
// even to a client the BA insisted on.
{
  const d = resolveClientEmailDecision({
    ...base,
    orgEnabled: false,
    clientPreference: "ALWAYS",
    status: ShipmentStatus.IN_TRANSIT,
  });
  check("ALWAYS still honours milestone selection", d.route === "associate" && d.reason === "milestone-off");
}
// Milestone not in the selected set diverts, reason milestone-off.
{
  const d = resolveClientEmailDecision({ ...base, status: ShipmentStatus.IN_TRANSIT });
  check("unselected milestone diverts to associate", d.route === "associate" && d.reason === "milestone-off");
}
// Willing but no address: distinct reason so the BA is told to add one.
{
  const d = resolveClientEmailDecision({ ...base, clientEmail: null });
  check("no client email diverts with its own reason", d.route === "associate" && d.reason === "no-client-email");
}

// ---------------------------------------------------------------------------
// Sweep bucketing
// ---------------------------------------------------------------------------

console.log("\nAttention sweep buckets");

check("collection under a week: no bucket", collectionBucketFor(6) === null);
check("collection at a week: bucket 7", collectionBucketFor(7) === 7);
check("collection at 13 days stays in bucket 7", collectionBucketFor(13) === 7);
check("collection at 40 days returns only the highest passed (30)", collectionBucketFor(40) === 30);
check("collection at 90 days caps at 60", collectionBucketFor(90) === 60);

check("stuck under tolerance: no bucket", stuckBucketFor(1, 2) === null);
check("stuck at tolerance: bucket 1", stuckBucketFor(2, 2) === 1);
check("stuck at 3x tolerance: bucket 3", stuckBucketFor(6, 2) === 3);
check("stuck escalation caps at 3", stuckBucketFor(100, 2) === 3);
check("zero tolerance never fires", stuckBucketFor(10, 0) === null);

// ---------------------------------------------------------------------------
// Live reads: the new columns and tables exist and are queryable
// ---------------------------------------------------------------------------

async function live() {
  console.log("\nLive database");

  const orgCols = await prisma.org.findFirst({
    select: {
      clientEmailsEnabled: true,
      clientEmailMilestones: true,
      clientEmailReplyTo: true,
    },
  });
  check("Org client-email columns are queryable", orgCols !== undefined);

  const clientPref = await prisma.client.findFirst({ select: { emailPreference: true } });
  check("Client.emailPreference is queryable", clientPref !== undefined || clientPref === null);

  const notifCount = await prisma.notification.count();
  check("Notification table is queryable", Number.isFinite(notifCount));
  console.log(`        notifications in table: ${notifCount}`);

  const receiptCount = await prisma.notificationReceipt.count();
  check("NotificationReceipt table is queryable", Number.isFinite(receiptCount));

  // The dedupe constraint is what makes the sweep idempotent, so prove it is a real
  // unique index rather than a comment. Two inserts with the same key: the second
  // must be rejected, and both rows are cleaned up whatever happens.
  const key = `selftest:${Date.now()}`;
  let dedupeHeld = false;
  try {
    await prisma.notification.create({
      data: { scope: "ARENA", kind: "BOOKING_PLACED", title: "dedupe self-test", dedupeKey: key },
    });
    try {
      await prisma.notification.create({
        data: { scope: "ARENA", kind: "BOOKING_PLACED", title: "dedupe self-test 2", dedupeKey: key },
      });
    } catch {
      dedupeHeld = true;
    }
  } finally {
    await prisma.notification.deleteMany({ where: { dedupeKey: key } });
  }
  check("dedupeKey unique constraint rejects a duplicate", dedupeHeld);

  const deferred = await prisma.shipment.count({
    where: { paymentDeferred: true, paymentCollectionStatus: { in: ["PENDING", "PART_PAID"] } },
  });
  console.log(`        deferred shipments the sweep would consider: ${deferred}`);
}

live()
  .catch((err) => {
    console.error("Live checks threw:", err);
    failed += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  });
