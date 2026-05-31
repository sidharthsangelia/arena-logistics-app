/**
 * src/app/api/uploadthing/route.ts
 *
 * Thin Next.js App Router handler that mounts the UploadThing file router.
 * No business logic lives here — keep it exactly this shape.
 */

import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "./core";


export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
});