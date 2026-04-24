import { clerkMiddleware } from "@clerk/nextjs/server";

// clerkMiddleware runs on every request so `auth()` works inside server components
// and route handlers, but no routes are force-protected here — authorization is
// handled inside each route/page via `currentActor()`, which accepts either a
// Clerk signed-in user OR an anonymous reviewer cookie session.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
