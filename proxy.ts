/**
 * Next.js 16 request boundary. Proxies /api/auth/* to Convex auth server,
 * forwards token cookies, and gates /dashboard(.*) behind auth.
 *
 * NOT the security boundary — Convex queries/mutations enforce authz via
 * getAuthUserId(ctx). proxy.ts is just optimistic redirect + cookie shaping.
 */

import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtected = createRouteMatcher(["/dashboard(.*)"]);
const isAuthRoute = createRouteMatcher(["/auth"]);
const isLanding = createRouteMatcher(["/"]);

/**
 * Important:
 *
 * Browser:
 *   NEXT_PUBLIC_CONVEX_URL=http://10.8.0.1:3210
 *
 * Next.js server inside Docker:
 *   http://backend:3210
 *
 * Authentication requests are handled server-side by Next.js, so they must
 * use Docker's internal service DNS instead of the WireGuard host address.
 */
const convexServerUrl = "http://backend:3210";

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const isSignedIn = await convexAuth.isAuthenticated();

    // Logged-in users skip the marketing/auth pages and land in the workspace.
    if (isSignedIn && (isLanding(request) || isAuthRoute(request))) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }

    // Anonymous users hitting protected routes go to sign-in.
    if (!isSignedIn && isProtected(request)) {
      return nextjsMiddlewareRedirect(request, "/auth");
    }
  },
  {
    convexUrl: convexServerUrl,
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest|map)).*)",
    "/(api|trpc)(.*)",
  ],
};
