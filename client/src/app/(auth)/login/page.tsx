import Image from "next/image";
import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { StudentLoginForm } from "./student-login-form";
import { LoginFooter } from "./login-footer";
import { DaftarSheet } from "../daftar-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { MiniAppLoginGuard } from "@/components/telegram-mini-app/mini-app-login-guard";
import { getPortalType } from "@/lib/portal";

export default async function LoginPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const portal = getPortalType(host);

  // Student portal — Lumio design system, scoped via `.lumio` so admin/teacher
  // logins are unaffected. The `.lumio` wrapper re-themes the shared
  // ThemeToggle + LoginFooter to Lumio automatically. A full-bleed photo (the
  // above-the-clouds shot) under a `.liquid-glass` pane; the scrim is much
  // heavier in dark mode because the photo is a bright daylight sky and the
  // dark pane is see-through.
  if (portal === "student") {
    return (
      <div className="lumio relative flex min-h-screen flex-col bg-background text-foreground">
        <MiniAppLoginGuard />
        <div className="absolute inset-0">
          <Image
            src="/login-student-background.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/15 dark:bg-slate-950/70" />
        </div>

        <div className="relative flex justify-end p-4">
          <ThemeToggle />
        </div>
        <main className="relative flex flex-1 items-center justify-center px-4 py-8">
          <div className="liquid-glass w-full max-w-sm rounded-[28px] p-6 sm:p-8">
            <StudentLoginForm />
          </div>
        </main>
        <div className="relative bg-background/85 backdrop-blur-sm">
          <LoginFooter showAppLinks />
        </div>
      </div>
    );
  }

  // Staff portals (admin., lehrer.) — the Daftar sheet; the portal picks the
  // paper and the ink.
  return (
    <>
      <MiniAppLoginGuard />
      <DaftarSheet portal={portal}>
        <LoginForm portal={portal} />
      </DaftarSheet>
    </>
  );
}
