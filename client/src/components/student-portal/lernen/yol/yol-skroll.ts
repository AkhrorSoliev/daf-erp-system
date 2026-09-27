"use client";

import * as React from "react";

/** O'lchovlar — hammasi OYNAGA nisbatan (oyna tepasidan), piksellarda. */
export interface YolSkrollOlchami {
  /** Unit sarlavha qatorining yuqori cheti. */
  unitTepa: number;
  /** O'quvchi turgan seans tugunining (bo'lim yorlig'i bilan) chetlari. */
  seansTepa: number;
  seansPast: number;
  /** Oynaning balandligi — `window.innerHeight`. */
  oyna: number;
  /** Yuqorida bo'sh qoldiriladigan joy (xavfsiz hudud + nafas). */
  tepaZaxira: number;
  /** Pastda ekranni qoplaydigan narsalar (navigatsiya, radio pleyer). */
  pastZaxira: number;
}

/**
 * Sahifani qancha pastga (manfiy — tepaga) surish kerakligi, yoki `null`
 * — surish kerak emas.
 *
 * Uch holat, shu tartibda:
 *
 *  1. Seans allaqachon ko'rinib turibdi — joyida qoladi. Yangi o'quvchida
 *     birinchi unit ekranning o'zida; uni tepaga tortib, sarlavha va
 *     ballarni ko'rinmas qilishdan foyda yo'q.
 *  2. Unit sarlavhasi bilan seans ekranga BIRGA sig'adi — sarlavha tepaga
 *     keladi: o'quvchi qaysi unitda ekanini va undagi yo'lini ko'radi.
 *  3. Sig'maydi (unit uzun, seans uning oxirida) — seansning o'zi
 *     ko'rinadigan qismning o'rtasiga. Sarlavhani tepaga qo'yish seansni
 *     ekrandan chiqarib yuborardi, bu esa butun harakatning maqsadini
 *     yo'qotadi.
 */
export function yolSkrollSiljishi(o: YolSkrollOlchami): number | null {
  const korinishTepa = o.tepaZaxira;
  const korinishPast = o.oyna - o.pastZaxira;

  if (o.seansTepa >= korinishTepa && o.seansPast <= korinishPast) return null;

  if (o.seansPast - o.unitTepa <= korinishPast - korinishTepa) {
    return o.unitTepa - korinishTepa;
  }

  const seansOrtasi = (o.seansTepa + o.seansPast) / 2;
  return seansOrtasi - (korinishTepa + korinishPast) / 2;
}

/** Sarlavha oyna chetiga yopishib qolmasin — `main`ning tepa bo'shlig'i ustiga. */
const TEPA_NAFAS = 8;

/**
 * Element sahifa boshidan qancha pastda — `transform`siz.
 *
 * `getBoundingClientRect` bu yerda YAROQSIZ: yo'l `FadeIn` ichida, va
 * skroll boshlanadigan paytda uning kirish animatsiyasi hamma narsani
 * hali 10 px pastga siljitib turadi. O'shanda o'lchansa, animatsiya
 * tugagach sarlavha mo'ljaldan 10 px yuqorida qolardi (brauzerda
 * o'lchangan). `offsetTop` zanjiri transformni hisobga olmaydi.
 */
function sahifadagiTepa(el: HTMLElement): number {
  let y = 0;
  for (let e: HTMLElement | null = el; e; e = e.offsetParent as HTMLElement | null) {
    y += e.offsetTop;
  }
  return y;
}

/**
 * `/portal/lernen` ochilganda sahifani o'quvchi yetgan unitga silliq
 * olib boradi.
 *
 * `kalit` — o'quvchi turgan seansning ID'si. Effekt faqat u O'ZGARGANDA
 * ishlaydi, har qayta so'rovda emas: fonda yangilangan ma'lumot
 * yo'lni aylanib ko'rayotgan o'quvchini tortib ketmasligi kerak. Seans
 * tugagach qaytilganda esa kesh avval ESKI ma'lumotni beradi, keyin yangi
 * `active` keladi — kalit o'zgaradi va sahifa yangi joyga ergashadi
 * (u allaqachon ko'rinib tursa, 1-holat: joyida qoladi).
 *
 * Pastki va yuqori zaxira `<main>`ning o'z bo'shliqlaridan o'qiladi: portal
 * qobig'i (`student-portal-layout.tsx`) pastki navigatsiya va radio pleyer
 * egallagan joyni aynan shu bo'shliq bilan qoplaydi, telefon/planshet
 * va pleyer ochiq/yopiq holatlari uchun alohida. Raqamni bu yerda qayta
 * yozish, qobiq o'zgarganda jimgina eskirardi.
 */
export function useYolSkroll(kalit: number | null) {
  const unitRef = React.useRef<HTMLButtonElement | null>(null);
  const seansRef = React.useRef<HTMLDivElement | null>(null);
  const oxirgiKalit = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (kalit == null || oxirgiKalit.current === kalit) return;

    // Bir kadr kutiladi: sahifa endigina chizilgan, Next'ning o'z
    // "yangi sahifa — tepaga" skrolli ham shu commit ichida bajariladi.
    // Kalit KADR ICHIDA belgilanadi — StrictMode effektni ikki marta
    // ishga tushirib birinchisini bekor qilganda, ikkinchisi o'tkazib
    // yuborilmasin.
    const kadr = requestAnimationFrame(() => {
      const unit = unitRef.current;
      const seans = seansRef.current;
      if (!unit || !seans) return;
      oxirgiKalit.current = kalit;

      const main = seans.closest("main");
      const uslub = main ? getComputedStyle(main) : null;
      const seansTepa = sahifadagiTepa(seans) - window.scrollY;

      const siljish = yolSkrollSiljishi({
        unitTepa: sahifadagiTepa(unit) - window.scrollY,
        seansTepa,
        seansPast: seansTepa + seans.offsetHeight,
        oyna: window.innerHeight,
        tepaZaxira: (parseFloat(uslub?.paddingTop ?? "") || 0) + TEPA_NAFAS,
        pastZaxira: parseFloat(uslub?.paddingBottom ?? "") || 0,
      });
      if (siljish == null) return;

      const kamHarakat = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.scrollBy({
        top: siljish,
        behavior: kamHarakat ? "auto" : "smooth",
      });
    });

    return () => cancelAnimationFrame(kadr);
  }, [kalit]);

  return { unitRef, seansRef };
}
