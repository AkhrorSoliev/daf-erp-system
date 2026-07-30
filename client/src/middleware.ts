import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getPortalType, getPortalConfig, isPublicPortal } from "@/lib/portal";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const refreshToken = request.cookies.get("refreshToken")?.value;
  const { pathname } = request.nextUrl;

  // ── Public portal short-circuit ─────────────────────────────────────
  // Two subdomains live here with NO auth wall:
  //   invoice.dafzentrum.uz/<id>   → rewrites to /r/<id> (receipt verify)
  //   form.dafzentrum.uz/<slug>    → rewrites to /f/<slug> (public form)
  // The bare URL stays clean while Next.js still resolves the underlying
  // app route.
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "";
  const portal = getPortalType(host);
  if (isPublicPortal(portal)) {
    const publicPrefix = portal === "form" ? "/f" : "/r";
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api") ||
      pathname.startsWith(`${publicPrefix}/`) ||
      pathname === publicPrefix
    ) {
      return NextResponse.next();
    }
    // Root `/`: form portal has an info landing page at `/f`. The invoice
    // portal had no index page historically — let it pass through so we
    // don't regress old behaviour.
    if (pathname === "/") {
      if (portal === "form") {
        const url = request.nextUrl.clone();
        url.pathname = "/f";
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }
    // /<id-or-slug> → /<publicPrefix>/<id-or-slug>
    const url = request.nextUrl.clone();
    url.pathname = `${publicPrefix}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // Receipt verification pages on every other host stay public too —
  // existing receipts already in circulation may QR-link to admin.* /r/<id>.
  if (pathname.startsWith("/r/")) {
    return NextResponse.next();
  }

  // Public custom form pages — anyone with the slug can fill them out.
  if (pathname.startsWith("/f/")) {
    return NextResponse.next();
  }

  // Telegram OAuth callback — the browser lands here carrying a single-use
  // `handoff` code and, by definition, NO session cookie yet: this page is
  // what creates the session. Must stay public on every portal/host and be
  // excepted before the unauthenticated redirect below. Exact match only —
  // nothing else under /auth should become publicly reachable.
  if (pathname === "/auth/telegram/callback") {
    return NextResponse.next();
  }

  const isAuthenticated = token || refreshToken;

  // Login sahifasida token bor — tegishli portalga yo'naltirish
  if (pathname === "/login" && isAuthenticated) {
    // Student rolini tekshirish — /portal ga yo'naltirish
    const userStr = request.cookies.get("user")?.value;
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        const isStudent =
          user.roles?.some((r: any) => r.id === 6) &&
          !user.roles?.some((r: any) => [1, 2, 3, 4, 5].includes(r.id));
        if (isStudent) {
          return NextResponse.redirect(new URL("/portal", request.url));
        }
      } catch {}
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Login sahifasi emas va hech qanday token yo'q — login'ga yo'naltirish
  if (pathname !== "/login" && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user portal-role mismatch tekshiruvi (ikkinchi darajali himoya)
  if (pathname !== "/login" && isAuthenticated) {
    const isLocalhost =
      host.includes("localhost") || host.includes("127.0.0.1");

    // Localhost da student foydalanuvchini /portal ga yo'naltirish
    if (isLocalhost && !pathname.startsWith("/portal")) {
      const userStr = request.cookies.get("user")?.value;
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const isStudentOnly =
            user.roles?.some((r: any) => r.id === 6) &&
            !user.roles?.some((r: any) => [1, 2, 3, 4, 5].includes(r.id));
          if (isStudentOnly) {
            return NextResponse.redirect(new URL("/portal", request.url));
          }
        } catch {}
      }
    }

    // Student portal routing: student.dafzentrum.uz -> /portal
    if (!isLocalhost) {
      if (portal === "student") {
        // Student portal foydalanuvchilari /portal ga yo'naltiriladi
        if (
          pathname !== "/login" &&
          !pathname.startsWith("/portal") &&
          !pathname.startsWith("/_next") &&
          !pathname.startsWith("/api")
        ) {
          return NextResponse.redirect(new URL("/portal", request.url));
        }
      } else {
        // Admin/Teacher portallar /portal ga kirishi mumkin emas
        if (pathname.startsWith("/portal")) {
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
    }

    // Portal-role mismatch tekshiruvi
    if (!isLocalhost) {
      const userStr = request.cookies.get("user")?.value;
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
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
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.mp3$|sw\\.js$).*)",
  ],
};
