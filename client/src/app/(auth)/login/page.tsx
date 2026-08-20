import Image from "next/image";
import { headers } from "next/headers";
import { LoginForm } from "./login-form";
import { StudentLoginForm } from "./student-login-form";
import { LoginFooter } from "./login-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { getPortalType } from "@/lib/portal";

export default async function LoginPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const portal = getPortalType(host);

  // Student portal — Lumio design system, scoped via `.lumio` so admin/teacher
  // logins are unaffected. The `.lumio` wrapper re-themes the shared
  // ThemeToggle + LoginFooter to Lumio automatically. Same full-bleed photo +
  // `.liquid-glass` pane as the admin login below, over the above-the-clouds
  // shot; the scrim is much heavier in dark mode because the photo is a bright
  // daylight sky and the dark pane is see-through.
  if (portal === "student") {
    return (
      <div className="lumio relative flex min-h-screen flex-col bg-background text-foreground">
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

  // Admin portal (admin.dafzentrum.uz) — full-bleed photo background. The form
  // moves onto a translucent panel and the footer onto a translucent strip so
  // both stay readable in light and dark themes over the photo.
  if (portal === "admin") {
    return (
      <div className="relative flex min-h-screen flex-col">
        <div className="absolute inset-0">
          <Image
            src="/login-admin-background.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/20 dark:bg-slate-950/55" />
        </div>

        <div className="relative flex justify-end p-4">
          <ThemeToggle />
        </div>
        <main className="relative flex flex-1 items-center justify-center px-4 py-8">
          {/* `.liquid-glass` (globals.css) carries the whole pane: tinted
              translucency, refracted rim, specular pools and the load sheen. */}
          <div className="liquid-glass w-full max-w-sm rounded-[28px] p-6 sm:p-8">
            <LoginForm portal={portal} />
          </div>
        </main>
        <div className="relative bg-background/85 backdrop-blur-sm">
          <LoginFooter />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center px-4">
        <LoginForm portal={portal} />
      </main>
      <LoginFooter />
    </div>
  );
}
