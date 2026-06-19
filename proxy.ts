import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/api/webhooks(.*)",
  "/activate-org",
  "/api/uploadthing",
  "/api/cron(.*)",
]);

const isArenaRoute = createRouteMatcher(["/arena-dashboard(.*)"]);
const isTenantRoute = createRouteMatcher(["/(.*)"]);

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId } = await auth();

  // ── 1. Not logged in ──────────────────────────────────────────
  if (!userId) {
    if (!isPublicRoute(req)) await auth.protect();
    return;
  }

  // ── 2. Arena internal team guard ──────────────────────────────
  if (isArenaRoute(req)) {
    // orgId is null = no active org in session
    // Could still be Arena staff — check via memberships in the redirect handler
    if (!orgId) {
      // Send to the redirect handler which will activate the org
      return NextResponse.redirect(new URL("/api/auth/redirect", req.url));
    }

    if (orgId !== ARENA_ORG_ID) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return; // ✅ Arena staff with active org — let through
  }

  // ── 3. Prevent Arena staff from accessing tenant routes ───────
  if (isTenantRoute(req) && orgId === ARENA_ORG_ID) {
    return NextResponse.redirect(new URL("/arena-dashboard", req.url));
  }

  // ── 4. Tenant user — no org yet → onboarding ─────────────────
  const isOnboarding = req.nextUrl.pathname.startsWith("/onboarding");
  if (!orgId && !isOnboarding && !isPublicRoute(req)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // ── 5. Everything else — normal Clerk protection ──────────────
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