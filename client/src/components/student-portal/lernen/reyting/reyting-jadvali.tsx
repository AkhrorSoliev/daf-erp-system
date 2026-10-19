"use client";

import { ArrowUp, Trophy, UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, LoadingCards } from "../../lumio";
import { useReyting } from "../queries";
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
  return (
    <li
      className={cn(
        "flex min-h-[54px] items-center gap-3 rounded-card border px-3 py-2.5",
        qator.selbst ? "border-coral-500" : zona ? "border-success/40" : "border-line",
        zona ? "bg-success/10" : qator.selbst ? "bg-coral-500/8" : "bg-surface",
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-ink-500">
        {qator.platz}
      </span>
      <Avatar name={qator.name} size={32} />
      {/* Ism TO'LIQ va QISQARTIRILMAYDI — dizayn 6.1: markaz jadvali
          ataylab barcha filiallarni aralashtiradi, bu leak emas, CEO
          qarori. */}
      <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
        {qator.selbst ? <span className="sr-only">Siz: </span> : null}
        {qator.name}
      </span>
      {zona ? (
        <ArrowUp
          size={16}
          weight="bold"
          className="shrink-0 text-success"
          role="img"
          aria-label="Ko'tarilish zonasi"
        />
      ) : null}
      <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
        {qisqaRaqam(qator.punkte)} ball
      </span>
    </li>
  );
}

/**
 * Guruhim / Butun markaz jadvali — `scope` bilan farqlanadi. Guruhda `[]`
 * deyarli har doim «guruhi yo'q» (server rosterni nol ball bilan to'ldiradi),
 * markazda esa haqiqiy «hali hech kim mashq qilmagan» — ikki xil xabar.
 */
export function ReytingJadvali({ scope }: { scope: "gruppe" | "zentrum" }) {
  const query = useReyting(scope);
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={4} />;
  if (!data) return <LoadFailed query={query} />;

  if (data.length === 0) {
    return scope === "gruppe" ? (
      <EmptyState
        icon={<UsersThree size={28} weight="bold" />}
        title="Siz hali guruhga qo'shilmagansiz"
        description="Guruhga qo'shilgach, guruhdoshlaringiz bilan haftalik ballaringizni solishtira olasiz."
      />
    ) : (
      <EmptyState
        icon={<Trophy size={28} weight="bold" />}
        title="Bu hafta hali hech kim ball to'plamagan"
        description="Birinchi bo'lib mashq qiling — jadval boshida siz turasiz."
      />
    );
  }

  return (
    <ul
      className="space-y-2"
      aria-label={scope === "gruppe" ? "Guruhim jadvali" : "Butun markaz jadvali"}
    >
      {data.map((qator) => (
        <ReytingQatori key={qator.studentId} qator={qator} />
      ))}
    </ul>
  );
}
