import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPortalType, getPortalConfig } from "@/lib/portal";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const refreshToken = request.cookies.get("refreshToken")?.value;
  const { pathname } = request.nextUrl;

  const isAuthenticated = token || refreshToken;

  // Login sahifasida token bor — portal-role mosligini tekshirish
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Login sahifasi emas va hech qanday token yo'q — login'ga yo'naltirish
  if (pathname !== "/login" && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user portal-role mismatch tekshiruvi (ikkinchi darajali himoya)
  if (pathname !== "/login" && isAuthenticated) {
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "";

    // Localhost da cheklov yo'q
    if (!host.includes("localhost") && !host.includes("127.0.0.1")) {
      const userStr = request.cookies.get("user")?.value;
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const portal = getPortalType(host);
          const { allowedRoleIds } = getPortalConfig(portal);
          const userRoleIds: number[] =
            user.roles?.map((r: any) => r.id) || [];
          const hasAccess = userRoleIds.some((id: number) =>
            allowedRoleIds.includes(id)
          );

          if (!hasAccess) {
            const response = NextResponse.redirect(
              new URL("/login", request.url)
            );
            response.cookies.delete("token");
            response.cookies.delete("refreshToken");
            response.cookies.delete("user");
            return response;
          }
        } catch {
          // JSON parse xatosi — davom etish
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
