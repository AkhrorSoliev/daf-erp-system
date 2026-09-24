"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export function SettingsLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
  // Arxiv va DaF normasi backend'da faqat CEO uchun — CEO bo'lmaganlar linkni
  // ko'rmaydi va sahifaga kirsa 403 oladi, shuning uchun bu yerda ham to'siladi.
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const isCeoRestricted =
    pathname.startsWith("/settings/archive") || pathname.startsWith("/settings/daf");
  const blockCeoRoute = !!user && isCeoRestricted && !isCeo;
  // To'lov sozlamalari backend'da @Roles('CEO', 'Branch Director') — boshqa
  // rol (Admin, Kassir, O'qituvchi) sahifaga to'g'ridan-to'g'ri havola bilan
  // kelsa ham 403 oladi, shuning uchun aynan shu ikki rolga qulflaymiz.
  const isPaymentRestricted = pathname.startsWith("/settings/payment");
  const canSeePayment = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const blockPaymentRoute = !!user && isPaymentRestricted && !canSeePayment;

  useEffect(() => {
    if (isTeacherOnly) {
      router.replace("/");
    } else if ((isAdminOnly && isAdminRestricted) || blockCeoRoute || blockPaymentRoute) {
      router.replace("/settings");
    }
  }, [isTeacherOnly, isAdminOnly, isAdminRestricted, blockCeoRoute, blockPaymentRoute, router]);

  if (isTeacherOnly || (isAdminOnly && isAdminRestricted) || blockCeoRoute || blockPaymentRoute) {
    return null;
  }

  return <div className="space-y-4">{children}</div>;
}
