/**
 * The page heading, shared by the route and its loading file so the two can
 * never drift. It is static text the router already has, so it is rendered
 * outright in both — never as placeholder bars.
 *
 * (A non-reserved filename inside an App Router folder does not create a
 * route; this is just a colocated component.)
 */
export function BookPageHeading() {
  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
        Book Order
      </h1>
      <p className="text-sm text-slate-500 mt-1">
        Create and confirm a new shipment booking.
      </p>
    </>
  );
}
