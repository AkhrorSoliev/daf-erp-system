"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/format-utils";
import { filtrniUrlgaYoz, STANDART_FILTR, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Davr, MarkazVoronka } from "./types";

interface Pogona {
  nomi: string;
  son: number;
  /** Oldingi pog'onaga nisbatan yo'qotish izohi va o'sha ro'yxatga havola. */
  yoqotish: { izoh: string; filtr: Partial<OquvchilarFiltri> } | null;
}

/** Yo'qotish havolalari — dizayn 5.2 jadvali. */
function pogonalar(v: MarkazVoronka): Pogona[] {
  return [
    { nomi: "Faol o'quvchi", son: v.faolOquvchi, yoqotish: null },
    { nomi: "Akkaunti bor", son: v.akkauntiBor, yoqotish: { izoh: "akkaunt yo'q", filtr: { status: ["AKKAUNT_YOQ"] } } },
    {
      nomi: "Bir marta bo'lsa ham kirgan",
      son: v.birMartaKirgan,
      yoqotish: { izoh: "hech qachon kirmagan", filtr: { status: ["HECH_KIRMAGAN"] } },
    },
    {
      nomi: "Davr ichida kirgan",
      son: v.davrdaKirgan,
      yoqotish: { izoh: "kirgan edi, bu davrda yo'q", filtr: { status: ["QIZIL", "SARIQ", "YASHIL"], kirgan: "yoq" } },
    },
    {
      nomi: "Normani bajargan",
      son: v.normaniBajargan,
      yoqotish: { izoh: "kirgan, lekin norma yo'q", filtr: { status: ["QIZIL", "SARIQ"], kirgan: "ha" } },
    },
  ];
}

export function DafVoronka({ voronka, davr }: { voronka: MarkazVoronka; davr: Davr }) {
  const qator = pogonalar(voronka);
  const max = Math.max(1, voronka.faolOquvchi);
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-base font-semibold">Qayerda yo&apos;qotyapmiz</h3>
      <p className="text-xs text-muted-foreground">
        Har pog&apos;onadagi yo&apos;qotish bosiladi — o&apos;sha o&apos;quvchilar ro&apos;yxati ochiladi
      </p>
      <ol className="mt-4 space-y-2">
        {qator.map((p, i) => {
          const oldingi = i > 0 ? qator[i - 1].son : null;
          const farq = oldingi === null ? 0 : oldingi - p.son;
          return (
            <li key={p.nomi} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{p.nomi}</span>
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
                    −{formatNumber(farq)} · {p.yoqotish.izoh}
                    <ChevronRight className="size-3" />
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{p.yoqotish ? "yo'qotish yo'q" : ""}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
