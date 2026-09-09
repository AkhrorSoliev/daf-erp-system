"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { boshlangichFormat } from "./section-detail-utils";
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
 * Javob HAR DOIM shu yerda, o'z alohida qatorida — variantlar
 * ro'yxatidagi biror satr bilan MOS KELISHIGA HECH QACHON BOG'LIQ
 * EMAS.
 *
 * Ko'rik topilmasi (CRITICAL): oldingi variantda javob FAQAT
 * `options`dan `richtig`ga teng bo'lakni topib ko'rsatilardi. Bu ikki
 * formatda hech qachon ishlamaydi — `LUECKE`ning `options`i ATAYLAB
 * bo'sh (`server/src/daf/uebung/satz-fragen.ts`dagi `luecke()`:
 * o'quvchi yozadi, tanlamaydi), `SATZ_BAUEN`ning `richtig`si esa BUTUN
 * gap, `options` esa o'sha gapning ALOHIDA so'zlari (`satzBauen()`) —
 * gap hech qachon bitta so'zga teng bo'lmaydi. Ikkalasida ham sahifa
 * "to'liq" ko'rinib turardi-yu, aynan kelgan odam qidirgan narsani
 * bermas edi. Shuning uchun `richtig` endi bevosita, string
 * solishtirishsiz chiqariladi; variantlar (pastda) faqat QO'SHIMCHA
 * ko'rsatma.
 */
function ToGriJavobQatori({ richtig }: { richtig: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        To&apos;g&apos;ri javob:
      </span>
      <ToGriJavob>{richtig}</ToGriJavob>
    </div>
  );
}

/**
 * Variantlar ro'yxati — to'g'ri javob yashil, qolgani neytral. O'quvchi
 * ko'radigan variantlar bilan BIR XIL tartibda (server allaqachon
 * aralashtirgan) — CEO chalg'ituvchilarning qanchalik "yaqinligini" ham
 * baholay olishi kerak.
 *
 * Bu QO'SHIMCHA ko'rsatma — javobning yagona manbai EMAS (qarang
 * `ToGriJavobQatori`dagi izoh). Variant bo'lmasa (masalan `LUECKE`,
 * `WORT_TIPPEN`) shunchaki "—" ko'rsatiladi, javob esa yuqorida
 * allaqachon ko'rsatilgan bo'ladi.
 */
function VariantlarRoyxati({
  options,
  richtig,
}: {
  options: string[];
  richtig: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Variantlar:
      </span>
      {options.length === 0 ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
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
      )}
    </div>
  );
}

/**
 * Bitta savol — to'rt shaklga qarab boshqacha chiziladi
 * (`vorschauShakli`). Har bir savolda ikkita narsa doim, MUSTAQIL
 * ravishda ko'rinadi: savolning o'zi (prompt/audio/dialog/juftlar) va
 * to'g'ri javob (`ToGriJavobQatori` yoki `JUFT` uchun pastdagi
 * juftlar ro'yxati — ikkalasi ham `richtig`dan TO'G'RIDAN-TO'G'RI
 * o'qiladi, variantlar bilan solishtirib emas).
 */
function SavolQatori({ f }: { f: VorschauFrage }) {
  const shakl = vorschauShakli(f.format);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      {shakl === "OVOZ" && f.audioUrl && (
        // `autoPlay={false}` — bu ro'yxat, mashq ekrani emas: bir vaqtda
        // o'nlab so'z yangramasligi kerak (`OvozTugmasi` bilan bir xil
        // sabab, `media-inhalt-panel.tsx`dagi `OvozHujayrasi`).
        <OvozTugmasi url={f.audioUrl} autoPlay={false} compact />
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

      {shakl === "JUFT" ? (
        // Juftlar `richtig`dan TO'G'RIDAN-TO'G'RI o'qiladi
        // (`juftlarniAjrat`) — bu ham `VariantlarRoyxati`dagi kabi
        // "options bilan solishtirib topish" emas, o'zi to'liq javob.
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
      ) : (
        <ToGriJavobQatori richtig={f.richtig} />
      )}

      {/* `JUFT`da variantlar ro'yxati qo'shimcha hech narsa aytmaydi —
          yuqoridagi juftlar allaqachon TO'LIQ javob; qolgan uch shaklda
          esa chalg'ituvchilarni ko'rish uchun qoladi. */}
      {shakl !== "JUFT" && (
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
        {/* Indeks HAM kalitga kiradi: `LUECKE`da `itemId` gap emas, gapdan
            bo'shatilgan SO'Z (`satz-fragen.ts`dagi `luecke()`) — bir nechta
            gap bir xil so'zni bo'shatishi mumkin (masalan "wie", "ich",
            "wer" haqiqiy kontentda uch-ikki marta uchraydi), shuning uchun
            `format:itemType:itemId` yolg'iz TAKRORLANADI. Indeks bu holatda
            ham kalitni noyob qiladi — ro'yxat statik (bir marta yuklanadi,
            qayta tartiblanmaydi), shuning uchun indeksga tayanish xavfsiz. */}
        {fragen.map((f, i) => (
          <SavolQatori key={`${f.format}:${f.itemType}:${f.itemId}:${i}`} f={f} />
        ))}
      </div>
    </div>
  );
}

/**
 * Bitta format tugmasi — nomi va soni, tanlangani ajratilgan
 * (`aria-current` + to'q fon). Format o'zi navigatsiya birligi bo'lgani
 * uchun (brief: "340 ta savolni bitta ro'yxatda ko'rsatmaslik — format
 * NAVIGATSIYAGA aylanadi"), bu ro'yxat oddiy `<Badge>` emas — bosiladigan
 * `<button>`.
 */
function FormatTugmasi({
  format,
  soni,
  tanlangan,
  onSelect,
}: {
  format: FrageFormat;
  soni: number;
  tanlangan: boolean;
  onSelect: (format: FrageFormat) => void;
}) {
  return (
    <button
      type="button"
      aria-current={tanlangan}
      onClick={() => onSelect(format)}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
        tanlangan
          ? "bg-primary text-primary-foreground"
          : "text-foreground hover:bg-muted",
      )}
    >
      <span className="truncate">{FORMAT_NOMLARI[format]}</span>
      <Badge
        variant={tanlangan ? "secondary" : "outline"}
        className={cn(
          "shrink-0 font-mono text-[11px] font-normal",
          !tanlangan && "text-muted-foreground",
        )}
      >
        {soni}
      </Badge>
    </button>
  );
}

/**
 * Formatlar yon ro'yxati — sahifaning butun "navigatsiya" g'oyasi shu
 * yerda. Bitta bo'limdan 340 tagacha savol chiqishi mumkin; ularni ketma-
 * ket qo'yish o'sha uyumni kichikroq qutida qaytaradi. O'quvchi "hamma
 * savolni" o'qimaydi — "bu FORMAT yaxshimi?" deb keladi (brief).
 */
function FormatYonRoyxati({
  formatlar,
  tanlangan,
  onSelect,
}: {
  formatlar: { format: FrageFormat; soni: number }[];
  tanlangan: FrageFormat | null;
  onSelect: (format: FrageFormat) => void;
}) {
  return (
    <nav aria-label="Savol formatlari" className="flex flex-col gap-1">
      {formatlar.map(({ format, soni }) => (
        <FormatTugmasi
          key={format}
          format={format}
          soni={soni}
          tanlangan={format === tanlangan}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

/**
 * Bo'limdan qurilishi mumkin bo'lgan savollar — javobi bilan.
 *
 * `MediaInhaltPanel` "nima bor" deydi (so'z/gap/ibora/dialogning o'zi);
 * bu panel dvigatel o'sha materialdan NIMA SAVOL QURISHINI ko'rsatadi.
 * Ikkalasi ham bo'lim ochilganda, alohida so'rov bilan yuklanadi (brief:
 * "bo'lim ochilganda").
 *
 * Navigatsiya rejimi — bu vazifaning o'zagi: 340 ta savolni bitta ustunda
 * emas, formatlar yon ro'yxati + faqat BITTA tanlangan formatning savoli
 * qilib ko'rsatish (brief). `selectedFormat` `null` bo'lishi mumkin
 * ("manzilda hali format yo'q") — bo'lim navigatsiyasiz eski rejimi olib
 * tashlangan (`media-coverage-section.tsx`dagi oldindan ko'rish qatori
 * bilan birga), shuning uchun bu yerga har doim `/media/sections/[id]`dan
 * keladi.
 */
export function MediaFragenPanel({
  sectionId,
  selectedFormat,
  onSelectFormat,
  onFormatsLoaded,
}: {
  sectionId: number;
  /**
   * Manzildan kelgan, HALI TEKSHIRILMAGAN qiymat
   * (`searchParams.get("format")`ning o'zi); tekshiruv (bu bo'limda
   * bormi, yo'qmi) `boshlangichFormat` ichida bo'ladi — chaqiruvchi buni
   * oldindan bilishi shart emas.
   */
  selectedFormat: string | null;
  /** Foydalanuvchi yon ro'yxatdan boshqa formatni bossa chaqiriladi. */
  onSelectFormat: (format: FrageFormat) => void;
  /**
   * Savollar yuklanib formatlarga guruhlangach BIR MARTA chaqiriladi —
   * `section-detail-client.tsx` shundan "sukut format qaysi edi" (URL'ga
   * yozish/yozmaslikni hal qilish uchun) va sarlavhadagi umumiy sonni
   * biladi.
   */
  onFormatsLoaded: (formatlar: { format: FrageFormat; soni: number }[]) => void;
}) {
  // `useQuery` — oddiy `useState`+`useEffect` emas, xuddi `MediaInhaltPanel`
  // dagi bilan bir xil sababga ko'ra: bu panel "Savollar" YORLIG'I ichida,
  // Radix `<Tabs>` esa faol bo'lmagan `<TabsContent>`ni DOM'dan olib
  // tashlaydi — "Material"ga o'tib qaytganda bu 340 tagacha savolni QAYTA
  // so'raydi va qayta skeleton ko'rsatardi (ko'rik: Minor topilma). Global
  // `staleTime` (`QueryProvider`, 5 daqiqa) shu `sectionId` bilan qayta
  // mount bo'lganda keshdan darhol o'qiydi.
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["media-fragen", sectionId],
    queryFn: () =>
      api
        .get<VorschauFrage[]>(`/daf/media/sections/${sectionId}/fragen`)
        .then((r) => r.data),
  });

  // Yon ro'yxat + tanlangan formatning savoli shu guruhlashdan chiziladi.
  const guruhlar = useMemo(() => formatlarBoyichaGuruhla(data ?? []), [data]);

  // Ota komponent (`section-detail-client.tsx`) shu orqali "qaysi format
  // sukut" (URL'ga yozish/yozmaslikni hal qilish uchun `engKopSavolliFormat`
  // bilan bir xil hisobni ishlatadi) va formatlar sonini biladi — ikkinchi
  // marta `/fragen`ga so'rov yubormasdan.
  useEffect(() => {
    if (!data) return;
    onFormatsLoaded(
      Array.from(guruhlar, ([format, fragen]) => ({
        format,
        soni: fragen.length,
      })),
    );
  }, [data, guruhlar, onFormatsLoaded]);

  // Ko'rsatiladigan format — manzildagi qiymat shu bo'limda haqiqatan
  // bormi tekshiriladi, bo'lmasa eng ko'p savollisiga tushiladi
  // (`boshlangichFormat`, `section-detail-utils.ts`).
  const effectiveFormat = boshlangichFormat(data ?? [], selectedFormat);

  return (
    <div className="space-y-6 p-4">
      {/* Ko'lam yorlig'i — `MediaInhaltPanel`dagi bilan JUFT: bu panel
          `daf-media-fragen.service.ts`dagi qoida bo'yicha shu bo'lim VA shu
          unitdagi undan oldingi BARCHA bo'limlar materialidan pul yig'adi
          (chalg'ituvchilar ham shu yerdan), "Material" yorlig'i esa FAQAT
          shu bo'limni ko'rsatadi. Ikkalasi bo'lim sahifasida ikkita
          alohida YORLIQ — stacked emas, shuning uchun "yuqorida/pastda"
          emas, boshqa yorliqning nomi bilan aytiladi. Yorliqsiz ikkalasi
          bir xil to'plam deb o'qilardi — masalan `ZUORDNEN` olti ibora
          ko'rsatadi-yu, uchtasi "Material" yorlig'ida yo'q bo'lishi
          mumkin, chunki ular oldingi bo'limdan kelgan. */}
      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Ko&apos;lam:</span> shu
        bo&apos;lim + shu unitdagi undan oldingi BARCHA bo&apos;limlar
        materiali birlashtirilgan (dvigatel chalg&apos;ituvchilarni ham shu
        puldan oladi). Shuning uchun boshqa yorliqdagi &quot;Material&quot;
        ro&apos;yxatida (faqat shu bo&apos;lim) yo&apos;q so&apos;z, gap
        yoki ibora bu yerda ko&apos;rinishi mumkin — bu xato emas.
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && isError && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">
            <span>Savollar olinmadi</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Qayta urinib ko&apos;rish
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Bu bo&apos;limdan hali bironta savol qurib bo&apos;lmaydi — shu
            bo&apos;lim VA undan oldingi bo&apos;limlar materiali
            (so&apos;z, gap, ibora yoki dialog) birgalikda yetarli emas.
            Diqqat: boshqa yorliqdagi &quot;Material&quot; ro&apos;yxati
            FAQAT shu bo&apos;limni ko&apos;rsatadi (yuqoridagi &quot;Ko&apos;lam&quot;
            yorlig&apos;iga qarang) — kamchilik shu unitning OLDINGI
            bo&apos;limida bo&apos;lishi ham mumkin, uni ko&apos;rish uchun
            &quot;Media&quot; ro&apos;yxatidan o&apos;sha bo&apos;lim
            sahifasiga o&apos;ting.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        // Bu vazifaning o'zagi: 340 ta savolni bitta ustunda emas,
        // formatlar ro'yxati + BITTA formatning savoli qilib ko'rsatish
        // (brief).
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <FormatYonRoyxati
            formatlar={Array.from(guruhlar, ([format, fragen]) => ({
              format,
              soni: fragen.length,
            }))}
            tanlangan={effectiveFormat}
            onSelect={onSelectFormat}
          />
          <div className="min-w-0">
            {effectiveFormat && (
              <FormatGuruhi
                format={effectiveFormat}
                fragen={guruhlar.get(effectiveFormat) ?? []}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
