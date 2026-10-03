"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canOpenSettingsPath, getVisibleSettingsSections } from "@/lib/settings-nav";

export function SettingsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  // One rule with the /settings list (`visibleForRoles` in settings-nav.ts),
  // so a page hidden from a role is closed to it by URL too. A role with no
  // settings page at all (a teacher, a cashier) goes home; a page the role is
  // not shown goes back to the list. Each item's roles match the backend's
  // @Roles(), so this only spares the user a page of 403s.
  const redirectTo = !user
    ? null
    : getVisibleSettingsSections(roleIds).length === 0
      ? "/"
      : canOpenSettingsPath(pathname, roleIds)
        ? null
        : "/settings";

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (redirectTo) return null;

  return <div className="space-y-4">{children}</div>;
}
