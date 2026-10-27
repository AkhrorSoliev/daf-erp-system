"use client";

import { ArrowUp, Trophy, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, LoadingCards } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useReyting } from "../queries";
import { KOTARILISH_MIN_BALL } from "../liga";
import { qisqaRaqam } from "../yol/yol-tuzilishi";
import type { ReytingZeile } from "../types";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/**
 * Bitta reyting qatori (`<li>`, ota-onasi `<ul>`) — guruh, markaz va liga xonasi
 * bir xil chizadi. O'z qatori ekran o'qigichda «Siz» deb boshlanadi.
 * `zona` — liga xonasining ko'tarilish zonasi: shaffof yashil tus (yorug' va
 * qorong'ida ham o'qiladi) va strelka — rangning o'zi yolg'iz belgi emas.
 * `min-h-[54px]` — skelet (`LigaSkelet`) shu balandlikni egallaydi.
 */
export function ReytingQatori({ qator, zona = false }: { qator: ReytingZeile; zona?: boolean }) {
  const t = useT();
  return (
    <li>
    <Link
      href={`/portal/lernen/reyting/${qator.studentId}`}
      className={cn(
        "flex min-h-[54px] items-center gap-3 rounded-card border px-3 py-2.5",
        qator.selbst ? "border-coral-500" : zona ? "border-success/40" : "border-line",
        zona ? "bg-success/10" : qator.selbst ? "bg-coral-500/8" : "bg-surface",
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-ink-500">
        {qator.platz}
      </span>
      <Avatar src={qator.photo} name={qator.name} size={32} />
      {/* Ism TO'LIQ va QISQARTIRILMAYDI — dizayn 6.1: markaz jadvali
          ataylab barcha filiallarni aralashtiradi, bu leak emas, CEO
          qarori. */}
      <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
        {qator.selbst ? <span className="sr-only">{t("Siz:")} </span> : null}
        {qator.name}
      </span>
      {zona ? (
        <ArrowUp
          size={16}
          weight="bold"
          className="shrink-0 text-success"
          role="img"
          aria-label={t("Ko'tarilish zonasi (kamida {n} ball bilan)", { n: KOTARILISH_MIN_BALL })}
        />
      ) : null}
      <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
        {t("{n} ball", { n: qisqaRaqam(qator.punkte) })}
      </span>
    </Link>
    </li>
  );
}

/**
 * Guruhim / Butun markaz jadvali — `scope` bilan farqlanadi. Guruhda `[]`
 * deyarli har doim «guruhi yo'q» (server rosterni nol ball bilan to'ldiradi),
 * markazda esa haqiqiy «hali hech kim mashq qilmagan» — ikki xil xabar.
 */
export function ReytingJadvali({ scope }: { scope: "gruppe" | "zentrum" }) {
  const t = useT();
  const query = useReyting(scope);
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={4} />;
  if (!data) return <LoadFailed query={query} />;

  if (data.length === 0) {
    return scope === "gruppe" ? (
      <EmptyState
        icon={<UsersThree size={28} weight="bold" />}
        title={t("Siz hali guruhga qo'shilmagansiz")}
        description={t(
          "Guruhga qo'shilgach, guruhdoshlaringiz bilan haftalik ballaringizni solishtira olasiz.",
        )}
      />
    ) : (
      <EmptyState
        icon={<Trophy size={28} weight="bold" />}
        title={t("Bu hafta hali hech kim ball to'plamagan")}
        description={t("Birinchi bo'lib mashq qiling — jadval boshida siz turasiz.")}
      />
    );
  }

  return (
    <ul
      className="space-y-2"
      aria-label={scope === "gruppe" ? t("Guruhim jadvali") : t("Butun markaz jadvali")}
    >
      {data.map((qator) => (
        <ReytingQatori key={qator.studentId} qator={qator} />
      ))}
    </ul>
  );
}
