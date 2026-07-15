"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SettingsMobileMenu } from "./settings-mobile-menu";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

export function SettingsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const user = useAuth((s) => s.user);
  const isTeacherOnly =
    (user?.roles.some((r) => r.id === 4) &&
      !user?.roles.some((r) => [1, 2, 3].includes(r.id))) ??
    false;
  const isAdminOnly =
    (user?.roles.some((r) => r.id === 3) &&
      !user?.roles.some((r) => [1, 2].includes(r.id))) ??
    false;
  const isAdminRestricted =
    pathname.startsWith("/settings/employees") ||
    pathname.startsWith("/settings/branches");
  // Arxiv sahifasi backend'da faqat CEO uchun (@Roles('CEO')) — CEO bo'lmaganlar
  // linkni ko'rmaydi va sahifaga kirsa 403 oladi, shuning uchun bu yerda ham to'sib qo'yamiz.
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const isCeoRestricted = pathname.startsWith("/settings/archive");
  const blockCeoRoute = !!user && isCeoRestricted && !isCeo;

  useEffect(() => {
    if (isTeacherOnly) {
      router.replace("/");
    } else if ((isAdminOnly && isAdminRestricted) || blockCeoRoute) {
      router.replace("/settings");
    }
  }, [isTeacherOnly, isAdminOnly, isAdminRestricted, blockCeoRoute, router]);

  if (isTeacherOnly || (isAdminOnly && isAdminRestricted) || blockCeoRoute) {
    return null;
  }

  const isSettingsRoot = pathname === "/settings" || pathname === "/settings/";

  if (isMobile && isSettingsRoot) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight">
            Sozlamalar
          </h1>
          <p className="text-sm text-muted-foreground">
            Tizim sozlamalari va boshqaruv
          </p>
        </div>
        <SettingsMobileMenu />
      </div>
    );
  }

  return <div className="space-y-4">{children}</div>;
}
