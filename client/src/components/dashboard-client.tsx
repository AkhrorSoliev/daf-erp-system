"use client";

import { useAuth } from "@/hooks/use-auth";
import { isTeacherOnly } from "@/components/dashboard/dashboard-home-visibility";
import { HomeOverview } from "@/components/dashboard/home-overview";
import { HomeSkeleton } from "@/components/dashboard/home-skeleton";
import { ScheduleClient } from "@/components/dashboard/schedule-client";
import { BranchLaunchCard } from "@/components/dashboard/launch/branch-launch-card";

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
  // The card fetches on its own — it neither waits for the panel
  // (`/dashboard/summary`) to load nor fails along with it. Renders `null`
  // when hidden, leaving no empty space.
  return (
    <div className="space-y-4 sm:space-y-6">
      <BranchLaunchCard />
      <HomeOverview />
    </div>
  );
}
