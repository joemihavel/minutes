import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(
  {
    contentSecurityPolicy: {
      strict: true,
      directives: {
        "base-uri": ["self"],
        "font-src": ["self", "data:"],
        "frame-ancestors": ["none"],
        "img-src": ["self", "data:", "blob:"],
        "media-src": ["self", "blob:"],
        "object-src": ["none"],
        "upgrade-insecure-requests": [],
      },
    },
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
