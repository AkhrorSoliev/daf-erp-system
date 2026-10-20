"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { formatNumber } from "@/lib/format-utils";
import { filtrniUrlgaYoz, STANDART_FILTR, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Davr, MarkazVoronka } from "./types";

interface Pogona {
  nomi: string;
  son: number;
  /** Oldingi pog'onaga nisbatan yo'qotish izohi va o'sha ro'yxatga havola. */
  yoqotish: { izoh: string; filtr: Partial<OquvchilarFiltri> } | null;
}

/** Yo'qotish havolalari — dizayn 5.2 jadvali. `nomi` and `izoh` are `msg()` texts, drawn with `t()`. */
function pogonalar(v: MarkazVoronka): Pogona[] {
  return [
    { nomi: msg("Faol o'quvchi"), son: v.faolOquvchi, yoqotish: null },
    { nomi: msg("Akkaunti bor"), son: v.akkauntiBor, yoqotish: { izoh: msg("akkaunt yo'q"), filtr: { status: ["AKKAUNT_YOQ"] } } },
    {
      nomi: msg("Bir marta bo'lsa ham kirgan (butun tarix)"),
      son: v.birMartaKirgan,
      yoqotish: { izoh: msg("hech qachon kirmagan"), filtr: { status: ["HECH_KIRMAGAN"] } },
    },
    {
      nomi: msg("Davr ichida kirgan (tanlangan davr)"),
      son: v.davrdaKirgan,
      yoqotish: { izoh: msg("kirgan edi, bu davrda yo'q"), filtr: { status: ["QIZIL", "SARIQ", "YASHIL"], kirgan: "yoq" } },
    },
    {
      nomi: msg("Normani bajargan"),
      son: v.normaniBajargan,
      yoqotish: { izoh: msg("kirgan, lekin norma yo'q"), filtr: { status: ["QIZIL", "SARIQ"], kirgan: "ha" } },
    },
  ];
}

export function DafVoronka({ voronka, davr }: { voronka: MarkazVoronka; davr: Davr }) {
  const t = useT();
  const qator = pogonalar(voronka);
  const max = Math.max(1, voronka.faolOquvchi);
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-base font-semibold">{t("Qayerda yo'qotyapmiz")}</h3>
      <p className="text-xs text-muted-foreground">
        {t("Har pog'onadagi yo'qotish bosiladi — o'sha o'quvchilar ro'yxati ochiladi")}
      </p>
      <ol className="mt-4 space-y-2">
        {qator.map((p, i) => {
          const oldingi = i > 0 ? qator[i - 1].son : null;
          const farq = oldingi === null ? 0 : oldingi - p.son;
          const nomi = p.nomi;
          const izoh = p.yoqotish?.izoh ?? "";
          return (
            <li key={p.nomi} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{t(nomi)}</span>
                  <span className="font-semibold tabular-nums">{formatNumber(p.son)}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.son / max) * 100}%` }} />
                </div>
              </div>
              <div className="w-36 text-right text-xs">
                {p.yoqotish && farq > 0 ? (
                  <Link
                    href={`/daf/oquvchilar${filtrniUrlgaYoz({ ...STANDART_FILTR, davr, ...p.yoqotish.filtr })}`}
                    className="inline-flex items-center gap-1 text-red-600 hover:underline dark:text-red-400"
                  >
                    −{formatNumber(farq)} · {t(izoh)}
                    <ChevronRight className="size-3" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{p.yoqotish ? t("yo'qotish yo'q") : ""}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
