"use client";

import { BookOpen, Crown, Fire, Sword, Trophy, UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LoadingCards, Section } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useNishonlar } from "../queries";
import { nishonNomi, nishonQoldi } from "../nishon";
import type { NishonQatori } from "../types";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

const BELGI: Record<NishonQatori["tur"], typeof Fire> = {
  SERIE: Fire,
  WOERTER: BookOpen,
  LIGA: Trophy,
  XONA: Crown,
  GURUH: UsersThree,
  JANG: Sword,
};

/** Olingan nishonning to'ldirishi — to'q fon, oq matn (qorong'i rejimda ham o'qiladi). */
const TOLDIRISH: Record<NishonQatori["tur"], string> = {
  SERIE: "bg-coral-500 text-white",
  WOERTER: "bg-teal-500 text-white",
  LIGA: "bg-grape-500 text-white",
  XONA: "bg-grape-500 text-white",
  GURUH: "bg-grape-500 text-white",
  JANG: "bg-coral-500 text-white",
};

/**
 * «Darajam» tabi ichidagi nishonlar (spec S2 3.3, S3 §3). Alohida tab emas: 390px
 * da to'rt tab ham tor. So'rov faqat shu bo'lim chizilganda ketadi. Olingan
 * nishon to'la rangda, olinmagani chiziqli ramkada «yana N».
 */
export function Nishonlarim() {
  const t = useT();
  const query = useNishonlar();
  const { data } = query;

  return (
    <Section title={t("Nishonlarim")}>
      {loadState(query) === "loading" ? (
        <LoadingCards count={2} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.map((n) => {
            const olingan = n.olingan != null;
            const Icon = BELGI[n.tur] ?? BookOpen;
            return (
              <li
                key={n.key}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-card px-2 py-3 text-center",
                  olingan
                    ? (TOLDIRISH[n.tur] ?? TOLDIRISH.WOERTER)
                    : "border-2 border-dashed border-line text-ink-500",
                )}
              >
                <Icon size={24} weight={olingan ? "fill" : "bold"} aria-hidden />
                <span className="font-display text-sm font-extrabold">{nishonNomi(n.key, t)}</span>
                {olingan ? null : (
                  <span className="text-xs font-semibold">{nishonQoldi(n, t)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
