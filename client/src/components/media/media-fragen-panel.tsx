"use client";

import { CheckCircle2 } from "lucide-react";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import { Uhr } from "@/components/student-portal/lernen/uebung/uhr";
import { cn } from "@/lib/utils";
import { juftlarniAjrat, vorschauShakli } from "./media-fragen-utils";
import { MediaOvozTugmasi } from "./media-ovoz-tugmasi";
import { useJoriyMi } from "./media-pleyer";
import type { KalitliFrage } from "./media-fragen-types";

/**
 * Picture options as thumbnails, the right one framed green — a URL list
 * would tell the CEO nothing about whether the distractors are fair.
 */
function RasmVariantlar({ options, richtig }: { options: string[]; richtig: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element -- R2 URL, fixed small size
        <img
          key={url}
          src={url}
          alt=""
          className={cn(
            "size-16 rounded-md border-2 object-cover",
            url === richtig ? "border-emerald-500" : "border-transparent opacity-80",
          )}
        />
      ))}
    </div>
  );
}

/** `UHR_HOEREN`: the four clocks, the right one framed green. */
function UhrVariantlar({ options, richtig }: { options: string[]; richtig: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((zeit) => (
        <div
          key={zeit}
          className={cn(
            "rounded-md border-2 p-1 text-foreground",
            zeit === richtig ? "border-emerald-500" : "border-transparent opacity-80",
          )}
        >
          <Uhr zeit={zeit} className="size-16" />
        </div>
      ))}
    </div>
  );
}

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
  const t = useT();
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {t("To'g'ri javob:")}
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
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {t("Variantlar:")}
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
export function SavolQatori({ f }: { f: KalitliFrage }) {
  const t = useT();
  const shakl = vorschauShakli(f.format);
  const joriy = useJoriyMi(f.kalit);

  return (
    <div className={cn("space-y-2 rounded-lg border p-3", joriy && "border-primary bg-primary/5")}>
      {shakl === "OVOZ" && f.audioUrl && (
        <MediaOvozTugmasi id={f.kalit} />
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

      {shakl === "HOEREN" && f.audioUrl && (
        <div className="space-y-1.5">
          {f.titel && (
            <div className="text-xs font-medium text-muted-foreground">
              {f.titel}
            </div>
          )}
          <MediaOvozTugmasi id={f.kalit} />
          <div className="text-sm">{f.prompt}</div>
        </div>
      )}

      {shakl === "MATN" && <div className="text-sm">{f.prompt}</div>}

      {shakl === "RASM" && (
        <div className="space-y-1.5">
          {f.audioUrl && <MediaOvozTugmasi id={f.kalit} />}
          {f.prompt && <div className="text-sm">{f.prompt}</div>}
          {f.bildUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- R2 URL, fixed small size
            <img src={f.bildUrl} alt="" className="size-20 rounded-md border object-cover" />
          )}
        </div>
      )}

      {shakl === "UHR" && (
        <div className="space-y-1.5">
          {f.audioUrl && <MediaOvozTugmasi id={f.kalit} />}
          {f.uhrzeit && <Uhr zeit={f.uhrzeit} className="size-24 text-foreground" />}
        </div>
      )}

      {shakl === "RASM" && f.options.length > 0 ? (
        <RasmVariantlar options={f.options} richtig={f.richtig} />
      ) : f.format === "UHR_HOEREN" ? (
        <UhrVariantlar options={f.options} richtig={f.richtig} />
      ) : shakl === "JUFT" ? (
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
      {shakl !== "JUFT" && shakl !== "RASM" && f.format !== "UHR_HOEREN" && (
        <VariantlarRoyxati options={f.options} richtig={f.richtig} />
      )}

      {f.hilfe && (
        <div className="text-xs text-muted-foreground">{t("Yordam: {text}", { text: f.hilfe })}</div>
      )}
    </div>
  );
}
