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
   * `<audio key={url}>` PASTDA — bu ikkita ko'rik topilmasining ILDIZ
   * tuzatishi (avvalgi ikki urinish — hisoblagichni `onError`ga ulash —
   * ISHLAMAGAN, pastga qarang). `key` bilan React savol almashganda
   * ESKI DOM tugunini butunlay OLIB TASHLAYDI va YANGISINI yaratadi —
   * `src`ni bir xil tugunda ALMASHTIRISH o'rniga. Bu ikkita xato yo'lini
   * TUB SABABIDAN yopadi: endi ikkita savol BITTA DOM tuguni (va shu
   * bilan BITTA `onError` ulanish nuqtasi)ni BAHAM KO'RMAYDI.
   *
   * BIRINCHI (muvaffaqiyatsiz) urinish `a.onerror`ni `joriyUrinish`
   * bilan bir xil hisoblagichga ulagan edi — lekin bu QURUQ (vacuous)
   * chiqdi: `a.onerror` — BITTA o'zgaruvchan xususiyat, promise kabi
   * har chaqiruvga alohida EMAS. Uni HAR safar yangi urinish raqami
   * bilan qayta ulash (hatto layout effektda, DOM commitidan darhol
   * keyin bo'lsa ham) shuni anglatadi: qachon YETIB KELMASIN, `error`
   * hodisasi FAQAT ENG OXIRGI ulangan yopilishga tegadi — va uning
   * o'zi o'z hisoblagichini o'ziga solishtiradi, shuning uchun tekshiruv
   * doim TO'G'RI chiqadi (A ning kech kelgan xatosi B ulagandan keyin
   * yetib kelsa, B ning yopilishi ishlaydi va B ning raqami — albatta —
   * `joriyUrinish.current`ga teng). Natijada `onError={() => setXato(true)}`
   * bilan xatti-harakat FARQSIZ edi.
   *
   * `key={url}` bu muammoni BOSHQA yo'l bilan hal qiladi: hisoblagichni
   * QAYTA TIKLASH o'rniga, ikkita savolni FIZIK jihatdan ikkita alohida
   * elementga ajratadi. React eski tugunni olib tashlaganda, o'zi
   * o'rnatgan (bubble bo'lmaydigan `error` hodisasi uchun DOM'ga
   * to'g'ridan-to'g'ri ulangan) ushlagichni ham OLIB TASHLAYDI — shuning
   * uchun A uchun navbatga qo'yilgan `error` KEYINROQ yetib kelsa ham,
   * uni ESHITADIGAN HECH KIM QOLMAYDI (B — yangi, mustaqil tugun, o'z
   * mustaqil ushlagichi bilan). Shuning uchun `onError`ga ENDI hech
   * qanday hisoblagich SHART EMAS — pastdagi oddiy
   * `onError={() => setXato(true)}` xavfsiz.
   *
   * `joriyUrinish` PASTDA HALI HAM SAQLANADI — lekin ENDI FAQAT
   * `.play()` va'dasi uchun, va bu boshqa sabab bilan: `.play()`
   * qaytargan va'da — DOM tuguniga EMAS, shunchaki bir marotabalik JS
   * obyektiga bog'liq. `key` almashib eski tugun olib tashlansa ham,
   * eski va'da xotirada QOLAVERADI va OXIR-OQIBAT o'z holicha
   * (rad etilib) tugaydi — buni HECH NARSA to'xtata olmaydi, chunki
   * `setXato` xuddi shu, DAVOM ETAYOTGAN `OvozTugmasi` komponent
   * nusxasining holat funksiyasi (faqat `<audio>` bola elementi qayta
   * o'rnatiladi, TASHQI komponent EMAS). Bundan tashqari, BITTA savol
   * ICHIDA ham (`url` o'zgarmasa, `key` ham o'zgarmaydi, tugun BIR XIL
   * qoladi) — tugma qayta bosilganda (`qoy` pastda `onClick`ga
   * to'g'ridan-to'g'ri uzatiladi) eski `play()` chaqiruvi hali
   * tugallanmagan bo'lishi mumkin; hisoblagich buni ham to'g'ri
   * "eskirgan" deb belgilaydi.
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

  // Savol almashganda (`url` o'zgaradi) o'zi yangraydi. `key={url}`
  // tufayli bu HAR DOIM YANGI DOM tuguniga ishlaydi (pastga qarang) —
  // reflar effektlardan OLDIN ulanadi, shuning uchun `audioRef.current`
  // shu paytda ALLAQACHON yangi tugunga ishora qiladi.
  React.useEffect(() => { qoy(); }, [url, qoy]);

  return (
    <div className="flex flex-col items-center gap-2">
      <audio
        key={url}
        ref={audioRef}
        src={url}
        preload="auto"
        onError={() => setXato(true)}
      />
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
