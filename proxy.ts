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
const isTenantRoute = createRouteMatcher(["/((?!api).*)"]); // excludes all /api/* paths

// Money lives behind the Arena admin role, not just Arena membership. This
// redirect is a courtesy so a member never lands on a page that would only tell
// them off — the real check runs in the page and in every action, because a
// direct server-action POST never passes through here. See utils/arena-auth.ts.
const isArenaMoneyRoute = createRouteMatcher(["/arena-dashboard/wallets(.*)"]);

const ARENA_ORG_ID = process.env.ARENA_ORG_ID!;

export default clerkMiddleware(async (auth, req) => {
  const { userId, orgId, has } = await auth();

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

    // Arena staff, but money pages need the admin role on top.
    if (isArenaMoneyRoute(req) && !has({ role: "org:admin" })) {
      return NextResponse.redirect(new URL("/arena-dashboard", req.url));
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