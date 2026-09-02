"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { resolveHomeSections } from "./dashboard-home-visibility";
import type { DashboardSummary } from "./dashboard-summary-types";
import { HomeAttentionList } from "./home-attention-list";
import { HomeErrorNote } from "./home-error-note";
import { HomeLoadError } from "./home-load-error";
import { HomeMoneyCards } from "./home-money-cards";
import { HomeNextLessons } from "./home-next-lessons";
import { HomePeopleStats } from "./home-people-stats";
import { HomeSkeleton } from "./home-skeleton";

/**
 * Bosh sahifadagi boshqaruv paneli — ma'lumotning YAGONA manbai.
 *
 * Quyidagi bloklar ma'lumotni faqat `props` orqali oladi, shuning uchun
 * manbani almashtirish (Faza 1 dagi fixture → shu so'rov) ularning birortasiga
 * ham tegmadi.
 *
 * Rol filtri ikki qatlamda: bu yerda blok CHIZILMAYDI, backendda esa
 * ma'lumotning o'zi `null` bo'lib qaytadi. Frontendda yashirish yolg'iz
 * yetarli emas — API'ni to'g'ridan-to'g'ri chaqirish mumkin.
 */
export function HomeOverview() {
  const user = useAuth((s) => s.user);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const sections = resolveHomeSections(roleIds);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["dashboard", "summary", selectedBranch?.id ?? "all"],
    queryFn: () =>
      api
        .get<DashboardSummary>("/dashboard/summary", {
          params: selectedBranch ? { branchId: selectedBranch.id } : undefined,
        })
        .then((r) => r.data),
    // Filial almashtirgichi hydrate bo'lgunicha kutamiz: usiz birinchi so'rov
    // «barcha filiallar» bo'lib ketadi va darhol ikkinchisi ortidan ketadi.
    enabled: branchLoaded,
    staleTime: 30_000,
  });

  // Xato holati skeletondan OLDIN tekshiriladi. `isPending` xatoda `false`
  // bo'ladi, `data` esa `undefined` bo'lib qolaveradi — shuning uchun faqat
  // `!data` ga tayanish abadiy skeleton beradi (backend deploy bo'lmay qolgan
  // paytda aynan shu bo'lgan: yangi frontend eski backenddan 404 olardi).
  if (isError) return <HomeLoadError onRetry={() => void refetch()} />;
  if (isPending || !data) return <HomeSkeleton />;

  const failed = (s: string) => data.failed.includes(s);

  return (
    <div className="space-y-4 sm:space-y-6">
      {sections.money &&
        (data.money ? (
          <HomeMoneyCards money={data.money} />
        ) : failed("money") ? (
          <HomeErrorNote label="Moliya" />
        ) : null)}

      {sections.people &&
        (data.people ? (
          <HomePeopleStats people={data.people} />
        ) : failed("people") ? (
          <HomeErrorNote label="O'quvchilar" />
        ) : null)}

      {/* Chapda bugun qilinadigan ish, o'ngda bugun bo'ladigan dars. Mobilda
          biri ikkinchisining ostiga tushadi — «e'tibor» birinchi bo'ladi,
          chunki u harakat talab qiladi. */}
      <div className="grid gap-3 lg:grid-cols-5 lg:gap-4">
        {sections.attention && (
          <div className="lg:col-span-3">
            {data.attention ? (
              <HomeAttentionList
                attention={data.attention}
                includeOutreach={sections.attentionOutreachRows}
              />
            ) : failed("attention") ? (
              <HomeErrorNote label="E'tibor ro'yxati" />
            ) : null}
          </div>
        )}
        {sections.nextLessons && (
          <div className="lg:col-span-2">
            {failed("nextLessons") ? (
              <HomeErrorNote label="Jadval" />
            ) : (
              <HomeNextLessons lessons={data.nextLessons} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
