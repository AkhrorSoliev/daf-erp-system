"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OvozTugmasi } from "@/components/student-portal/lernen/uebung/ovoz-tugmasi";
import { cn } from "@/lib/utils";
import {
  formatlarBoyichaGuruhla,
  juftlarniAjrat,
  vorschauShakli,
} from "./media-fragen-utils";
import type { FrageFormat, VorschauFrage } from "./media-fragen-types";

/**
 * Format kodi → o'zbekcha nom. Ro'yxat elementlari CEOga tanish bo'lgan
 * ekran-nomlarga emas, formatning O'ZI nima qilishiga qarab yozilgan —
 * bu panel o'quvchi ko'radigan mashqni emas, dvigatelning qurish
 * qoidasini ko'rsatadi (server: `VORSCHAU_BAUER`).
 */
const FORMAT_NOMLARI: Record<FrageFormat, string> = {
  WORT_UZ: "So'zdan tarjimani topish",
  UZ_WORT: "Tarjimadan so'zni topish",
  PAAR: "Juftlash — so'z va tarjima",
  ARTIKEL: "Artikl tanlash",
  LUECKE: "Gapdagi bo'shliqni to'ldirish",
  SATZ_BAUEN: "So'zlardan gap qurish",
  SATZ_UEBERSETZEN: "Gap tarjimasini topish",
  REAKTION: "Vaziyatga mos iborani topish",
  ZUORDNEN: "Juftlash — vaziyat va ibora",
  DIALOG_LUECKE: "Dialogdagi bo'shliqni to'ldirish",
  AUDIO_WORT: "Eshitilgan so'zni topish",
  WORT_TIPPEN: "Eshitilgan so'zni yozish",
};

/** To'g'ri javobni ajratib ko'rsatadi — bu panelning butun maqsadi. */
function ToGriJavob({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">{children}</span>
    </span>
  );
}

/**
 * Variantlar ro'yxati — to'g'ri javob yashil, qolgani neytral. O'quvchi
 * ko'radigan variantlar bilan BIR XIL tartibda (server allaqachon
 * aralashtirgan) — CEO chalg'ituvchilarning qanchalik "yaqinligini" ham
 * baholay olishi kerak.
 */
function VariantlarRoyxati({
  options,
  richtig,
}: {
  options: string[];
  richtig: string;
}) {
  if (options.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o, i) => (
        <Badge
          key={`${o}-${i}`}
          variant={o === richtig ? "default" : "outline"}
          className={cn(
            "font-normal",
            o === richtig
              ? "bg-emerald-600 text-white hover:bg-emerald-600"
              : "text-muted-foreground",
          )}
        >
          {o}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Bitta savol — to'rt shaklga qarab boshqacha chiziladi
 * (`vorschauShakli`). Har shaklda ham "variantlar" va "to'g'ri javob"
 * alohida ko'rinadi (brief: javob string bilan ro'yxatni solishtirib
 * topish shart bo'lmasin).
 */
function SavolQatori({ f }: { f: VorschauFrage }) {
  const shakl = vorschauShakli(f.format);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {shakl === "OVOZ" && (
        <div className="flex flex-wrap items-center gap-3">
          {/* `autoPlay={false}` — bu ro'yxat, mashq ekrani emas: bir
              vaqtda o'nlab so'z yangramasligi kerak (`OvozTugmasi` bilan
              bir xil sabab, `media-inhalt-panel.tsx`dagi `OvozHujayrasi`). */}
          {f.audioUrl && (
            <OvozTugmasi url={f.audioUrl} autoPlay={false} compact />
          )}
          <ToGriJavob>{f.richtig}</ToGriJavob>
        </div>
      )}

      {shakl === "JUFT" && (
        <div className="flex flex-wrap gap-2">
          {juftlarniAjrat(f.richtig).map((j, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-sm dark:bg-emerald-950/30"
            >
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium">{j.chap}</span>
              <span className="text-muted-foreground">=</span>
              <span>{j.ong}</span>
            </span>
          ))}
        </div>
      )}

      {shakl === "DIALOG" && (
        <div className="space-y-1.5">
          {f.titel && (
            <div className="text-xs font-medium text-muted-foreground">
              {f.titel}
            </div>
          )}
          {/* Butun suhbat, qatorlar orasidagi bo'shliq saqlanib —
              `dialogLuecke` `\n` bilan qo'shib yuboradi (`dialog-fragen.ts`). */}
          <pre className="whitespace-pre-wrap rounded bg-muted/40 p-2 font-sans text-sm">
            {f.prompt}
          </pre>
        </div>
      )}

      {shakl === "MATN" && <div className="text-sm">{f.prompt}</div>}

      {(shakl === "MATN" || shakl === "DIALOG") && (
        <VariantlarRoyxati options={f.options} richtig={f.richtig} />
      )}
      {shakl === "OVOZ" && f.options.length > 0 && (
        <VariantlarRoyxati options={f.options} richtig={f.richtig} />
      )}

      {f.hilfe && (
        <div className="text-xs text-muted-foreground">Yordam: {f.hilfe}</div>
      )}
    </div>
  );
}

/** Bitta format — nomi + nechta savol qurilishi mumkinligi + ro'yxat. */
function FormatGuruhi({
  format,
  fragen,
}: {
  format: FrageFormat;
  fragen: VorschauFrage[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {FORMAT_NOMLARI[format]}
        <Badge variant="secondary" className="font-mono text-[11px] font-normal">
          {format}
        </Badge>
        <span className="text-xs font-normal text-muted-foreground">
          {fragen.length} ta savol
        </span>
      </h3>
      <div className="space-y-2">
        {fragen.map((f) => (
          <SavolQatori key={`${f.format}:${f.itemType}:${f.itemId}`} f={f} />
        ))}
      </div>
    </div>
  );
}

/**
 * Bo'limdan qurilishi mumkin bo'lgan BARCHA savol — javobi bilan.
 *
 * `MediaInhaltPanel` "nima bor" deydi (so'z/gap/ibora/dialogning o'zi);
 * bu panel dvigatel o'sha materialdan NIMA SAVOL QURISHINI ko'rsatadi.
 * Ikkalasi ham bo'lim ochilganda, alohida so'rov bilan yuklanadi (brief:
 * "bo'lim ochilganda").
 */
export function MediaFragenPanel({ sectionId }: { sectionId: number }) {
  const [data, setData] = useState<VorschauFrage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Qayta urinib ko'rish" effektni qayta yugurtiradi — boshqa media
  // panellari bilan bir xil naqsh (`MediaInhaltPanel`).
  const [retryKey, setRetryKey] = useState(0);
  const loading = !data && !error;

  // Faqat bo'lim ochilganda DOM'ga qo'shiladi (`media-coverage-section.tsx`
  // `open` bilan boshqaradi) — shuning uchun bu ham oddiy mount-based
  // fetch, alohida bayroqsiz.
  useEffect(() => {
    let cancelled = false;
    api
      .get<VorschauFrage[]>(`/daf/media/sections/${sectionId}/fragen`)
      .then(({ data }) => {
        if (!cancelled) setData(data);
      })
      .catch(() => {
        if (!cancelled) setError("Savollar olinmadi");
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, retryKey]);

  const handleRetry = useCallback(() => {
    setData(null);
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6 p-4">
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Qayta urinib ko&apos;rish
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && data.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Bu bo&apos;limdan hali bironta savol qurib bo&apos;lmaydi — material
            (so&apos;z, gap, ibora yoki dialog) yetarli emas. Qarang:
            yuqoridagi &quot;Bo&apos;lim materiali&quot; qismi nechtasi
            yozilganini ko&apos;rsatadi.
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && data.length > 0 && (
        <>
          {Array.from(formatlarBoyichaGuruhla(data)).map(([format, fragen]) => (
            <FormatGuruhi key={format} format={format} fragen={fragen} />
          ))}
        </>
      )}
    </div>
  );
}
