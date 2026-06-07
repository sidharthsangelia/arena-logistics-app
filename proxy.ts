// middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)", // webhooks must be public — no auth header
  "/api/uploadthing",
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId } = await auth();

  // Not logged in — let public routes through, protect everything else
  if (!userId) {
    if (!isPublicRoute(req)) await auth.protect();
    return;
  }

  // Logged in but no org yet → force onboarding
  // Skip if they're already on onboarding or a public route
  const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");
  if (!orgId && !isOnboarding && !isPublicRoute(req)) {
    const url = new URL("/onboarding", req.url);
    return NextResponse.redirect(url);
  }

  // Logged in with org → protect all non-public routes normally
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/(api|trpc)(.*)",
  ],
};