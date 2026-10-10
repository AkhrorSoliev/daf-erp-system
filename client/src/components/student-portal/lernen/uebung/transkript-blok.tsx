"use client";

import * as React from "react";
import { SuhbatRasmi } from "./rasm-tanlash";

/**
 * Javobdan KEYIN ochiladigan suhbat matni — o'quvchi nimani
 * eshitmaganini ko'radi. Bu mashqning asosiy o'rganish lahzasi; savol
 * paytida ko'rsatilsa, eshitish mashqi o'qish mashqiga aylanardi.
 *
 * PASTKI YOPISHQOQ PANEL OSTIDA YASHIRINIB QOLISHI MUMKIN (ko'rik
 * topilmasi): bu blok `<main>`ning oxirida, natija+"Keyingi" esa
 * `seans-ekrani.tsx`dagi `fixed bottom-0` panelda. Telefonda blok
 * variantlar ostida chiqadi va o'quvchi uni HECH KO'RMAY "Keyingi"ni
 * bosishi mumkin (haqiqiy brauzer o'lchovi: 844 px balandlikda faqat
 * sarlavha va birinchi qator panel USTIDA ko'rinardi, 667 px balandlikda
 * esa blok BUTUNLAY panel ostida boshlanardi). Shuning uchun bu blok
 * ekranga chiqishi bilan (mount effekti) o'zini panelning USTIGA
 * ko'rinadigan qilib skroll qiladi: `scroll-mb-48` panel balandligini
 * (~161 px) ozgina zaxira bilan qoplaydi, `block: "nearest"` esa
 * FAQAT yetmagan qismni emas, butun blokni ko'rinadigan qiladi.
 */
export function TranskriptBlok({
  zeilen,
  sahna,
  bild,
  titel,
}: {
  zeilen: Array<{ sprecher: string; de: string; uz: string; izohUz?: string | null }>;
  sahna?: string | null;
  /** The dialog's story picture — sent only with the answer, never the question. */
  bild?: string | null;
  /** The dialog's title: the picture's `alt`. */
  titel?: string;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kamHarakat = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      block: "nearest",
      behavior: kamHarakat ? "auto" : "smooth",
    });
  }, []);

  return (
    <div
      ref={ref}
      className="scroll-mb-48 space-y-2 rounded-2xl border border-line bg-surface p-4"
    >
      {bild ? <SuhbatRasmi url={bild} alt={titel || "Suhbat rasmi"} /> : null}
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
        Suhbat matni
      </p>
      {sahna ? <p className="text-sm italic text-ink-500">{sahna}</p> : null}
      {zeilen.map((z, i) => (
        <div key={i} className="text-base leading-relaxed">
          <span className="font-semibold text-ink-500">
            {z.sprecher}
            {z.izohUz ? <span className="font-normal italic text-ink-400"> ({z.izohUz})</span> : null}
            {": "}
          </span>
          <span className="text-ink-900">{z.de}</span>
          <span className="block text-sm text-ink-500">{z.uz}</span>
        </div>
      ))}
    </div>
  );
}
