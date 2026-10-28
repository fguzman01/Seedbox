import { NextResponse, type NextRequest } from "next/server";
import { hasValidCredentials } from "./lib/auth";

/**
 * Optional HTTP Basic Auth for the whole site (ADR-0007). Without SEEDBOX_BASIC_AUTH the site is
 * open; server actions still check write access on their own.
 */
export function proxy(request: NextRequest) {
  const expected = process.env.SEEDBOX_BASIC_AUTH;
  if (!expected || hasValidCredentials(request.headers.get("authorization"), expected)) {
    return NextResponse.next();
  }
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Seedbox", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next.js static assets, the favicon and the platform health check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health$).*)"],
};
