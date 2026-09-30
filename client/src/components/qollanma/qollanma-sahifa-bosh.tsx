import type { QollanmaBolim, QollanmaSahifa } from "@/qollanma/turlar";
import { ROL_NOMLARI } from "@/qollanma/rol-filtri";
import { sanaKorinishi } from "@/qollanma/sana";
import { QollanmaBreadcrumbNomi } from "./qollanma-breadcrumb-nomi";

/** Sarlavha, meta va qisqacha — MDX'da yozilmaydi, reyestrdan chiziladi. */
export function QollanmaSahifaBosh({ sahifa, bolim }: { sahifa: QollanmaSahifa; bolim: QollanmaBolim }) {
  return (
    <header className="mb-8 border-b pb-6">
      <QollanmaBreadcrumbNomi nomlar={{ [bolim.id]: bolim.nom, [sahifa.sahifa]: sahifa.sarlavha }} />
      <p className="text-sm text-muted-foreground">{bolim.nom}</p>
      <h1 className="mt-1 font-heading text-2xl font-semibold sm:text-3xl">{sahifa.sarlavha}</h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Yangilandi: {sanaKorinishi(sahifa.yangilangan)} · Kimlar uchun:{" "}
        {sahifa.rollar.map((r) => ROL_NOMLARI[r]).join(", ")}
      </p>
      <div className="mt-4 rounded-lg border bg-muted/40 p-4 leading-7">{sahifa.qisqacha}</div>
    </header>
  );
}
