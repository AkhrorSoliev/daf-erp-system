"use client";

import { useAuth } from "@/hooks/use-auth";
import { isTeacherOnly } from "@/components/dashboard/dashboard-home-visibility";
import { HomeOverview } from "@/components/dashboard/home-overview";
import { HomeSkeleton } from "@/components/dashboard/home-skeleton";
import { ScheduleClient } from "@/components/dashboard/schedule-client";

/**
 * `/` sahifasining yo'naltirgichi — o'zi hech narsa chizmaydi.
 *
 * «Faqat o'qituvchi» rolidagi odam bu yerda jadvalni ko'radi, chunki unga
 * aynan shu kerak; qolgan xodimlar boshqaruv panelini ko'radi. Redirect
 * ATAYLAB ishlatilmagan: `/` manzili o'zgarmasa, xatcho'p ham, orqaga qaytish
 * ham buzilmaydi.
 */
export function DashboardClient() {
  const user = useAuth((s) => s.user);

  // Foydalanuvchi hali hydrate bo'lmagan: rol ro'yxati bo'sh bo'lgani uchun
  // noto'g'ri blok chizilib, keyin sakrab almashmasin.
  if (!user) return <HomeSkeleton />;

  const roleIds = user.roles.map((r) => r.id);
  if (isTeacherOnly(roleIds)) return <ScheduleClient />;
  return <HomeOverview />;
}
