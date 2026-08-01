import { TrackShipmentView } from "@/components/tracking/TrackShipmentView";

/**
 * Ops tracking. Same view as the tenant page; the difference is scope, decided
 * from the session inside the tracking action — Arena staff resolve a shipment
 * number belonging to any org, since answering "where is ARN…?" on the phone is
 * the whole point of this screen.
 */
export default function ArenaTrackPage() {
  return <TrackShipmentView />;
}
