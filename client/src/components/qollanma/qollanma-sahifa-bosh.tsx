"use client";

import { roleTitle } from "@/components/profile/profile-roles";
import { useT } from "@/i18n/context";
import type { QollanmaBolim, QollanmaSahifa } from "@/qollanma/turlar";
import { sanaKorinishi } from "@/qollanma/sana";
import { QollanmaBreadcrumbNomi } from "./qollanma-breadcrumb-nomi";

/**
 * Sarlavha, meta va qisqacha — MDX'da yozilmaydi, reyestrdan chiziladi.
 * The registry's title and summary are guide content (Uzbek); only the meta line's words follow the language.
 */
export function QollanmaSahifaBosh({
  sahifa,
  bolim,
}: {
  sahifa: QollanmaSahifa;
  bolim: Pick<QollanmaBolim, "id" | "nom">;
}) {
  const t = useT();
  return (
    <header className="mb-8 border-b pb-6">
      <QollanmaBreadcrumbNomi nomlar={{ [bolim.id]: bolim.nom, [sahifa.sahifa]: sahifa.sarlavha }} />
      <p className="text-sm text-muted-foreground">{bolim.nom}</p>
      <h1 className="mt-1 font-heading text-2xl font-semibold sm:text-3xl">{sahifa.sarlavha}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Yangilandi: {date} · Kimlar uchun: {roles}", {
          date: sanaKorinishi(sahifa.yangilangan),
          roles: sahifa.rollar.map((r) => roleTitle({ id: r }, t)).join(", "),
        })}
      </p>
      <div className="mt-4 rounded-lg border bg-muted/40 p-4 leading-7">{sahifa.qisqacha}</div>
    </header>
  );
}
