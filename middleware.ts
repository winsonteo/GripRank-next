import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const hostname = req.nextUrl.hostname;
  const response = NextResponse.next();

  if (hostname === "beta.griprank.com") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: "/:path*",
};
