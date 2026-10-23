"use client";

import { UsersThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Card, EmptyState, Skeleton } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useGuruhlar } from "../queries";
import { bahoMatni } from "../liga";
import type { GuruhQatori } from "../types";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

/** Bitta guruh qatori; `min-h-[62px]` — skelet shu balandlikni egallaydi. */
function GuruhQatoriKorinishi({ qator }: { qator: GuruhQatori }) {
  const t = useT();
  return (
    <li
      className={cn(
        "flex min-h-[62px] items-center gap-3 rounded-card border px-3 py-2.5",
        qator.selbst ? "border-coral-500 bg-coral-500/8" : "border-line bg-surface",
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-ink-500">
        {qator.platz}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-900">
          {qator.selbst ? <span className="sr-only">{t("Sizning guruhingiz:")} </span> : null}
          {qator.name}
        </span>
        <span className="block text-xs font-semibold text-ink-500">{t("{n} kishi", { n: qator.azolar })}</span>
      </span>
      <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
        {bahoMatni(qator.baho, t)}
      </span>
    </li>
  );
}

export function GuruhlarSkelet() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[62px] w-full" />
      ))}
    </div>
  );
}

/**
 * «Guruhlar» tabi (spec S3 §2.2): markaz bo'yicha haftalik jadval — guruh
 * a'zolarining o'rtacha bali. TOP 10, o'z guruhi pastda bo'lsa ajratuvchidan
 * keyin haqiqiy o'rni bilan. Guruhsiz yoki kichik guruhda — izoh. Eng kam
 * a'zo soni serverdan (`minAzolar`) — matnga qo'lda yozilmaydi.
 */
export function GuruhlarTab() {
  const t = useT();
  const query = useGuruhlar();
  const { data } = query;

  if (loadState(query) === "loading") return <GuruhlarSkelet />;
  if (!data) return <LoadFailed query={query} />;

  const top = data.qatorlar.slice(0, 10);
  const pastda = data.qatorlar.slice(10);

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-semibold text-ink-500">
        {t(
          "Guruhning o'rtacha balli (hamma a'zolar bo'yicha). {n} kishidan kam guruh jadvalga kirmaydi.",
          { n: data.minAzolar },
        )}
      </p>
      {data.oz ? null : (
        <Card className="text-sm font-semibold text-ink-700">
          {t("Guruhingiz jadvalga hali kirmaydi (kamida {n} kishi kerak)", { n: data.minAzolar })}
        </Card>
      )}
      {data.qatorlar.length === 0 ? (
        <EmptyState
          icon={<UsersThree size={28} weight="bold" />}
          title={t("Bu hafta jadvalda guruh yo'q")}
          description={t(
            "Kamida {n} kishilik faol guruhlar shu yerda haftalik o'rtacha ball bilan ko'rinadi.",
            { n: data.minAzolar },
          )}
        />
      ) : (
        <ul className="space-y-2" aria-label={t("Guruhlar jadvali")}>
          {top.map((q) => (
            <GuruhQatoriKorinishi key={q.groupId} qator={q} />
          ))}
          {pastda.length > 0 ? (
            <>
              {pastda[0].platz > top.length + 1 ? (
              <li className="text-center text-xs font-semibold text-ink-500" aria-hidden>
                ···
              </li>
              ) : null}
              {pastda.map((q) => (
                <GuruhQatoriKorinishi key={q.groupId} qator={q} />
              ))}
            </>
          ) : null}
        </ul>
      )}
    </div>
  );
}
