"use client";

import { useAuth } from "@/hooks/use-auth";
import { resolveHomeSections } from "./dashboard-home-visibility";
import { HOME_FIXTURE } from "./home-fixture";
import { HomeMoneyCards } from "./home-money-cards";
import { HomePeopleStats } from "./home-people-stats";

/**
 * Bosh sahifadagi boshqaruv paneli.
 *
 * BU FAYL — ma'lumotning YAGONA manbai. Faza 1 da u `HOME_FIXTURE` dan
 * keladi; Faza 2 da shu yerdagi bitta qator `useQuery("/dashboard/summary")`
 * ga almashadi va quyidagi bloklarning birortasi ham o'zgarmaydi.
 */
export function HomeOverview() {
  const user = useAuth((s) => s.user);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const sections = resolveHomeSections(roleIds);

  // FAZA 1: soxta ma'lumot. Faza 2 da almashadi.
  const data = HOME_FIXTURE;

  return (
    <div className="space-y-4 sm:space-y-6">
      {sections.money && data.money && <HomeMoneyCards money={data.money} />}
      {sections.people && data.people && (
        <HomePeopleStats people={data.people} />
      )}
    </div>
  );
}
