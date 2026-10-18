"use client";

import { BookOpen, Fire } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { LoadingCards, Section } from "../../lumio";
import { useNishonlar } from "../queries";
import { nishonNomi, nishonQoldi } from "../nishon";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/**
 * «Darajam» tabi ichidagi nishonlar (spec S2 3.3). Alohida tab emas: 390px
 * da uch tab ham tor. So'rov faqat shu bo'lim chizilganda ketadi. Olingan
 * nishon to'la rangda, olinmagani chiziqli ramkada «yana N».
 */
export function Nishonlarim() {
  const query = useNishonlar();
  const { data } = query;

  return (
    <Section title="Nishonlarim">
      {loadState(query) === "loading" ? (
        <LoadingCards count={2} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.map((n) => {
            const olingan = n.olingan != null;
            const Icon = n.tur === "SERIE" ? Fire : BookOpen;
            return (
              <li
                key={n.key}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-card px-2 py-3 text-center",
                  olingan
                    ? n.tur === "SERIE"
                      ? "bg-coral-500 text-white"
                      : "bg-teal-500 text-white"
                    : "border-2 border-dashed border-line text-ink-500",
                )}
              >
                <Icon size={24} weight={olingan ? "fill" : "bold"} aria-hidden />
                <span className="font-display text-sm font-extrabold">{nishonNomi(n.key)}</span>
                {olingan ? null : (
                  <span className="text-xs font-semibold">{nishonQoldi(n)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
