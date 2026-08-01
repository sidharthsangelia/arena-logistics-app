import { TrackShipmentView } from "@/components/tracking/TrackShipmentView";

/**
 * Tenant tracking. The view is shared with the Arena dashboard; what differs is
 * only who is asking, which the tracking action reads from the session — a
 * tenant resolves Arena shipment numbers within their own org, and carrier AWBs
 * openly. See actions/tracking/tracking.actions.ts.
 */
export default function TrackPage() {
  return <TrackShipmentView />;
}
