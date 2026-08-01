/**
 * app/api/inngest/route.ts
 *
 * Where Inngest reaches our background functions.
 *
 * The path matters: /api/inngest is what the dev server auto-discovers and what
 * the cloud platform expects. Moving it means configuring discovery by hand for
 * no benefit.
 *
 * Node runtime, explicitly. It is the default, but this route renders PDFs
 * through @react-pdf/renderer, which needs Node streams and cannot run on the
 * edge. Stating it here means a future global change of default does not turn
 * invoice generation into a runtime error that only shows up in production.
 *
 * maxDuration covers the whole chain: render, upload, and the confirmation
 * email. Each step is short, but Inngest invokes the endpoint once per step and
 * the render is the slowest of them.
 */

import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { bookDomesticCourier } from "@/lib/inngest/functions/bookDomesticCourier";
import { generateShipmentInvoice } from "@/lib/inngest/functions/generateShipmentInvoice";

export const runtime = "nodejs";
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateShipmentInvoice, bookDomesticCourier],
});
