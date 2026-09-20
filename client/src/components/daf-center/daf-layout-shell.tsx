"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canOpenDafPath } from "@/lib/daf-nav";

/**
 * Bo'lim sahifalari uchun rol qorovuli (`reports-layout-shell.tsx` naqshi).
 * Backend ham rad etadi (`@Roles`), bu faqat sahifa ochilib keyin 403
 * ko'rmaslik uchun. Mobil menyu yo'q — `/daf` ildizi o'zi sahifa.
 */
export function DafLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const ruxsat = canOpenDafPath(user?.roles.map((r) => r.id) ?? [], pathname);

  useEffect(() => {
    if (user && !ruxsat) router.replace("/");
  }, [user, ruxsat, router]);

  if (user && !ruxsat) return null;
  return <div className="space-y-4">{children}</div>;
}
