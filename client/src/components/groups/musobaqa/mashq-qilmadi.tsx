"use client";

import { useT } from "@/i18n/context";
import { haftaYorligi, oxirgiMashqMatni } from "./musobaqa-format";
import type { MusobaqaJavob } from "./types";

/** Neytral ro'yxat: ustoz o'zi bog'lanishi uchun. Tizim hech kimga xabar yubormaydi, qizil rang va tahdid yo'q. */
export function MashqQilmadi({ data }: { data: MusobaqaJavob }) {
  const t = useT();
  const hafta = data.joriy ? t("shu hafta") : haftaYorligi(data.haftaBoshi);
  const qilmaganlar = data.oquvchilar.filter((q) => q.jamiBall === 0);
  if (data.oquvchilar.length === 0) return null;
  if (qilmaganlar.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border px-4 py-3 text-sm">
        {t("Hamma mashq qildi, {hafta}", { hafta })}
      </p>
    );
  }
  return (
    <section className="rounded-md border px-4 py-3" aria-labelledby="mashq-qilmadi-sarlavha">
      <h4 id="mashq-qilmadi-sarlavha" className="text-sm font-semibold">
        {t("Mashq qilmaganlar, {hafta}", { hafta })} ({qilmaganlar.length})
      </h4>
      <ul className="mt-2 divide-y">
        {qilmaganlar.map((q) => (
          <li key={q.studentId} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5 text-sm">
            <span>
              {q.ism}
              {!q.akkaunt && <span className="text-muted-foreground ml-2 text-xs">{t("Akkaunt yo'q")}</span>}
            </span>
            <span className="text-muted-foreground text-xs">
              {t("Oxirgi mashq")}: {oxirgiMashqMatni(q.oxirgiMashq, data.bugun, t)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
