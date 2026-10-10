"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, usePermissionsReady } from "@/hooks/use-permissions";
import { canOpenSettingsPath, getVisibleSettingsSections } from "@/lib/settings-nav";

export function SettingsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  // One rule with the /settings list (`permission` in settings-nav.ts), so a
  // page hidden from a user is closed to them by URL too. Wait for the list:
  // redirecting on "not known yet" would bounce everyone on a fresh sign-in.
  const redirectTo =
    !user || !ready
      ? null
      : getVisibleSettingsSections(can).length === 0
        ? "/"
        : canOpenSettingsPath(pathname, can)
          ? null
          : "/settings";

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (redirectTo || (user && !ready)) return null;

  return <div className="space-y-4">{children}</div>;
}
