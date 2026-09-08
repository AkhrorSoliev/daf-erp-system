"use client";

import * as React from "react";
import { SpeakerHigh, ArrowClockwise } from "@phosphor-icons/react";

// SSR paytida `useLayoutEffect` hech narsa qilmaydi va DEV rejimida
// ogohlantirish chiqaradi (bu komponent "use client" bo'lsa ham, Next.js
// dastlabki HTML'ni serverda chizadi). Brauzerda haqiqiy layout effektga,
// serverda esa oddiy effektga (baribir ishlamaydi, lekin ogohlantirmaydi)
// tushadi.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

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
   * ESKIRGAN YUKLASH NATIJASIGA QARSHI QO'RIQCHI (ko'rik topilmasi,
   * IKKI YO'L HAM QOPLANGAN: `play()` va'dasi VA `<audio>`ning `error`
   * hodisasi).
   *
   * `<audio>` elementi `key`siz — savol almashganda React `src`ni O'SHA
   * DOM tuguni ustida almashtiradi (yangi element yaratilmaydi). Bitta
   * DOM tuguniga ikkita mustaqil yo'l orqali "eskirgan natija" kirib
   * kelishi mumkin:
   *
   * 1) Media spetsifikatsiyasiga ko'ra, `play()` KUTILAYOTGAN paytda
   *    `src` o'zgarsa, o'sha eski va'da `AbortError` bilan RAD ETILADI —
   *    va bu rad etish ASINXRON: ba'zan YANGI savolning effekti
   *    allaqachon `setXato(false)` chaqirib, yangi faylni ishga
   *    tushirib bo'lgandan KEYIN yetib keladi.
   * 2) XUDDI SHU sabab bilan `error` hodisasi HAM eskirishi mumkin:
   *    `src` almashtirilganda eski manba uchun brauzer navbatga qo'ygan
   *    yuklash xatosi baribir keyinroq YETIB KELISHI mumkin —
   *    brauzerlar buni bir xilda bostirishga MAJBUR EMAS.
   *
   * Ikkalasida ham natija BIR XIL: qo'riqchisiz YANGI (aslida soz
   * ishlayotgan) savol "Ovoz yuklanmadi" holatiga o'tib qolardi —
   * garchi uning audiosi normal o'ynayotgan bo'lsa ham (masalan sekin
   * tarmoqda, o'quvchi tez-tez savol almashtirsa).
   *
   * Yechim — har bir yuklash/o'ynatish URINISHI o'zining "raqami"ni
   * oladi (`joriyUrinish.current`). Ikkala yo'l HAM (`.play().catch()`
   * VA `error` hodisasi) natija kelganda FAQAT hali ham ENG SO'NGGI
   * urinish bo'lsagina `setXato(true)` chaqiradi; undan keyin YANGI
   * urinish boshlangan bo'lsa (savol almashgani UCHUN ham, tugma qayta
   * bosilgani UCHUN ham), eski natija shunchaki e'tiborsiz
   * qoldiriladi. Ikkalasi BITTA hisoblagichni ishlatishi MUHIM — ikkita
   * mustaqil qo'riqchi bo'lsa, ular bir-biridan bexabar ikki xil
   * "joriy urinish" tushunchasiga kelib qolishi mumkin edi.
   *
   * `error` hodisasi JSX `onError` prop sifatida EMAS, balki
   * `a.onerror = ...` orqali, QUYIDAGI `useIsomorphicLayoutEffect`
   * ICHIDA ulanadi. Sabab: `preload="auto"` brauzerni `src` DOM'ga
   * commit qilinishi bilanoq yuklashni boshlashga majbur qiladi — bu
   * yuklash oddiy (passiv) `useEffect` (`qoy()`) hali ishga
   * tushmasdan turib ham muvaffaqiyatsiz bo'lishi mumkin. Oddiy
   * `useEffect` chizishdan KEYIN, browser bo'sh vaqt topganda ishga
   * tushadi — bu orada tarmoq xatosi allaqachon kelib ulgurishi mumkin.
   * Layout effekt esa DOM commit bilan BIR XIL sinxron bosqichda,
   * chizishdan (va shu sabab har qanday keyingi tarmoq hodisasidan)
   * OLDIN ishlaydi — shuning uchun hisoblagichning bump'i va
   * `a.onerror`ning QAYTA ULANISHI bu yerda, render paytida EMAS
   * (reflar renderda o'qilmaydi/yozilmaydi — loyihaning
   * `react-hooks/refs` qoidasi).
   *
   * Tugma bosilishi (`qaytaBos`) HAM hisoblagichni oshiradi VA
   * `a.onerror`ni qayta ulaydi — demak HAQIQIY xato (masalan tarmoq
   * chindan uzilgan) hamon ko'rsatiladi, chunki o'sha chaqiruv ENG
   * SO'NGGI urinish bo'lib qoladi va uni hech kim ORTDAN bosib
   * o'tmaydi. BU QO'RIQCHINI OLIB TASHLASH sekin tarmoqda faqat
   * ko'rinadigan, avtomatlashtirilgan test bilan ushlanmaydigan
   * regressiyani qaytaradi — shuning uchun bu izoh mavjud.
   */
  const joriyUrinish = React.useRef(0);

  // `a.onerror`ni berilgan urinish raqamiga ULAYDI (qayta ishlatiladi:
  // savol almashganda HAM, tugma bosilganda HAM chaqiriladi).
  const onerrorniUlash = React.useCallback((urinish: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.onerror = () => {
      if (joriyUrinish.current === urinish) setXato(true);
    };
  }, []);

  // Savol almashganda (`url` o'zgaradi) YANGI urinish ochiladi — DOM
  // commitidan DARHOL keyin, chizishdan oldin (izohga qarang).
  useIsomorphicLayoutEffect(() => {
    joriyUrinish.current += 1;
    onerrorniUlash(joriyUrinish.current);
  }, [url, onerrorniUlash]);

  const qoy = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const urinish = joriyUrinish.current;
    setXato(false);
    a.currentTime = 0;
    void a.play().catch(() => {
      if (joriyUrinish.current === urinish) setXato(true);
    });
  }, []);

  // Tugma bosilishi — qayta urinish. Bu ham YANGI urinish deb
  // hisoblanadi: eski (hali tugallanmagan) `play()` va'dasi yoki
  // eskirgan `onerror` ulanishi endi eskirgan deb belgilanadi.
  const qaytaBos = React.useCallback(() => {
    joriyUrinish.current += 1;
    onerrorniUlash(joriyUrinish.current);
    qoy();
  }, [qoy, onerrorniUlash]);

  // Savol almashganda (`url` o'zgaradi) o'zi yangraydi.
  React.useEffect(() => { qoy(); }, [url, qoy]);

  return (
    <div className="flex flex-col items-center gap-2">
      <audio ref={audioRef} src={url} preload="auto" />
      <button
        type="button"
        onClick={qaytaBos}
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
