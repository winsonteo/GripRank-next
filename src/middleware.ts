import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/boulder/chief(.*)',
  '/boulder/setup(.*)',
  '/boulder/import(.*)',
  '/boulder/scorecards(.*)',
  '/lead/judge(.*)',
  '/speed/judge(.*)',
  '/speed/admin(.*)',
  '/admin(.*)',
  '/chief(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
