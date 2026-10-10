"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, usePermissionsReady } from "@/hooks/use-permissions";
import { canOpenDafPath } from "@/lib/daf-nav";

/**
 * Page guard for the section (the pattern of `reports-layout-shell.tsx`). The
 * server refuses too (`daf.activity`); this only spares the user a page that
 * opens and then answers 403. No mobile menu — the `/daf` root is a page itself.
 */
export function DafLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  const ruxsat = canOpenDafPath(can, pathname, user?.roles.map((r) => r.id) ?? []);

  useEffect(() => {
    if (user && ready && !ruxsat) router.replace("/");
  }, [user, ready, ruxsat, router]);

  if (user && (!ready || !ruxsat)) return null;
  return <div className="space-y-4">{children}</div>;
}
