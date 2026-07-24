/**
 * app/(arena)/arena-dashboard/notices/page.tsx
 *
 * Where ops writes the info banner every tenant sees. Freight moves on events
 * outside this app — carrier strikes, port congestion, rate revisions, holiday
 * closures — and this is the switchboard for saying so without a deploy.
 *
 * Reads the DB directly rather than the tenant-side cache, so a save is
 * reflected here the moment it lands.
 */

import { listSystemNoticesForAdmin } from "@/lib/notices/queries";
import { SystemNoticesManager } from "@/components/notices/admin/SystemNoticesManager";

export default async function ArenaNoticesPage() {
  const notices = await listSystemNoticesForAdmin();

  return (
    <div className="p-6">
      <SystemNoticesManager notices={notices} />
    </div>
  );
}
