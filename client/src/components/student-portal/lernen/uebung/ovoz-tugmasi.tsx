"use client";

import * as React from "react";
import { SpeakerHigh, ArrowClockwise } from "@phosphor-icons/react";

/**
 * Savolning ovozi — karnay tugmasi.
 *
 * TO'LIQ PLEYER EMAS (seyk bar, vaqt, pauza yo'q): so'z audiosi bir
 * soniyalik, ularning hammasi shovqin bo'lardi.
 *
 * AVTOMATIK QO'YISH ISHLAYDI: brauzer sahifa bilan muloqot bo'lmaguncha
 * ovozga ruxsat bermaydi, lekin o'quvchi seansni tugma bosib ochadi —
 * birinchi savol chiqqanda muloqot allaqachon bo'lgan. Shunga qaramay
 * `catch` bor: ruxsat berilmasa tugma qoladi va o'quvchi o'zi bosadi.
 *
 * CHEKSIZ QAYTA ESHITISH — A1 darajasida takror eshitish o'rganishning
 * bir qismi; chegaralash jazoga aylanardi.
 */
export function OvozTugmasi({ url }: { url: string }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [xato, setXato] = React.useState(false);
  /**
   * ESKIRGAN `play()` VA'DASIGA QARSHI QO'RIQCHI (ko'rik topilmasi).
   *
   * `<audio>` elementi `key`siz — savol almashganda React `src`ni O'SHA
   * DOM tuguni ustida almashtiradi (yangi element yaratilmaydi). Media
   * spetsifikatsiyasiga ko'ra, `play()` KUTILAYOTGAN paytda `src`
   * o'zgarsa, o'sha eski va'da `AbortError` bilan RAD ETILADI — va bu
   * rad etish ASINXRON: ba'zan YANGI savolning effekti allaqachon
   * `setXato(false)` chaqirib, yangi faylni ishga tushirib bo'lgandan
   * KEYIN yetib keladi. Qo'riqchisiz eski `.catch(() => setXato(true))`
   * o'shanda YANGI (aslida soz ishlayotgan) savolni "Ovoz yuklanmadi"
   * holatiga o'tkazib qo'yardi — garchi uning audiosi normal
   * o'ynayotgan bo'lsa ham (masalan sekin tarmoqda, o'quvchi tez-tez
   * savol almashtirsa).
   *
   * Yechim — har bir `play()` urinishi o'zining "raqami"ni oladi
   * (`joriyUrinish.current`ga yozilgan qiymat). Urinish tugagach
   * (`.catch`) FAQAT hali ham ENG SO'NGGI urinish bo'lsagina xato
   * ko'rsatiladi — undan keyin YANGI urinish boshlangan bo'lsa (savol
   * almashgani UCHUN ham, tugma qayta bosilgani UCHUN ham), eski
   * rad etish shunchaki e'tiborsiz qoldiriladi. Tugmaning o'zi bosilganda
   * ham xuddi shu `qoy()` chaqiriladi — demak HAQIQIY xato (masalan
   * tarmoq chindan uzilgan) hamon ko'rsatiladi, chunki o'sha chaqiruv
   * ENG SO'NGGI urinish bo'lib qoladi va uni hech kim ORTDAN
   * bosib o'tmaydi. BU QO'RIQCHINI OLIB TASHLASH sekin tarmoqda faqat
   * ko'rinadigan, avtomatlashtirilgan test bilan ushlanmaydigan
   * regressiyani qaytaradi — shuning uchun bu izoh mavjud.
   */
  const joriyUrinish = React.useRef(0);

  const qoy = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const urinish = ++joriyUrinish.current;
    setXato(false);
    a.currentTime = 0;
    void a.play().catch(() => {
      if (joriyUrinish.current === urinish) setXato(true);
    });
  }, []);

  // Savol almashganda (`url` o'zgaradi) o'zi yangraydi.
  React.useEffect(() => { qoy(); }, [url, qoy]);

  return (
    <div className="flex flex-col items-center gap-2">
      <audio ref={audioRef} src={url} preload="auto" onError={() => setXato(true)} />
      <button
        type="button"
        onClick={qoy}
        aria-label={xato ? "Ovozni qayta yuklash" : "Ovozni eshitish"}
        className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 motion-reduce:transition-none"
      >
        {xato ? <ArrowClockwise size={36} weight="bold" /> : <SpeakerHigh size={36} weight="fill" />}
      </button>
      {xato ? (
        // Savol O'TKAZILMAYDI va ball yo'qotilmaydi — tarmoq muammosi
        // o'quvchining bilimi emas.
        <p className="text-sm text-muted-foreground">Ovoz yuklanmadi — qayta urinib ko&apos;ring</p>
      ) : null}
    </div>
  );
}
