"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

export interface YigishProps {
  format: "SATZ_BAUEN" | "PAAR";
  options: string[];
  /**
   * `SATZ_BAUEN` — tanlangan so'zlar tartibi.
   * `PAAR` — juftlar, `de=uz` satrlari.
   */
  tanlangan: string[];
  onOzgar: (next: string[]) => void;
  natija: PruefErgebnis | null;
  /**
   * `pruefen` javob kutmoqda: natija hali yo'q, lekin o'quvchi
   * yuborilgan javobni endi o'zgartirmasligi kerak.
   */
  kutilmoqda?: boolean;
}

/**
 * Bo'laklardan yig'ib javob tuzish: `SATZ_BAUEN` (gap tuzish) va `PAAR`
 * (so'z-tarjima juftlash).
 *
 * TO'G'RI JAVOB PROPS'DA YO'Q — `mc-exercise.tsx` dagi qoida shu yerda
 * ham amal qiladi. Javobning shakli (bo'shliq bilan qo'shilgan gap yoki
 * `de=uz|de=uz|de=uz|de=uz`) yuqoridagi chaqiruvchi (5-vazifa) tomonidan
 * tuziladi — bu komponent faqat `tanlangan` ni yig'adi.
 */
export function Yigish({
  format,
  options,
  tanlangan,
  onOzgar,
  natija,
  kutilmoqda = false,
}: YigishProps) {
  if (format === "PAAR") {
    return (
      <Juftlash
        options={options}
        tanlangan={tanlangan}
        onOzgar={onOzgar}
        natija={natija}
        kutilmoqda={kutilmoqda}
      />
    );
  }
  return (
    <GapTuzish
      options={options}
      tanlangan={tanlangan}
      onOzgar={onOzgar}
      natija={natija}
      kutilmoqda={kutilmoqda}
    />
  );
}

interface IchkiProps {
  options: string[];
  tanlangan: string[];
  onOzgar: (next: string[]) => void;
  natija: PruefErgebnis | null;
  kutilmoqda: boolean;
}

function GapTuzish({ options, tanlangan, onOzgar, natija, kutilmoqda }: IchkiProps) {
  // Bir xil so'z gapda ikki marta uchrashi mumkin ("ich bin ... ich"), shuning
  // uchun pastdagi bo'laklar qaysi INDEKSI ishlatilganini hisoblaymiz — so'zning
  // o'ziga qarab hisoblasak, ikkinchi nusxa tanlanganda birinchisi yashiringan
  // deb noto'g'ri xulosa chiqarilardi.
  const qolganSoni = new Map<string, number>();
  for (const soz of tanlangan) {
    qolganSoni.set(soz, (qolganSoni.get(soz) ?? 0) + 1);
  }
  const mavjud = options.map((soz) => {
    const qoldi = qolganSoni.get(soz) ?? 0;
    if (qoldi > 0) {
      qolganSoni.set(soz, qoldi - 1);
      return false;
    }
    return true;
  });

  const qulflangan = natija != null || kutilmoqda;

  return (
    <div className="space-y-3">
      {/* Yig'ilgan gap — bosilgan so'z shu yerdan qaytadi. To'g'ri/xato
          rangi butun qatorga qo'llanadi (so'z-so'z emas) — mc-exercise.tsx
          dagi to'liq ranglar to'plami: border, fon rangi va matn rangi. */}
      <div
        className={cn(
          "flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-2xl border-2 p-3",
          "border-transparent bg-tint",
          natija?.isCorrect && "border-success bg-success/10 text-success",
          natija != null && !natija.isCorrect && "border-danger bg-danger/10 text-danger",
        )}
      >
        {tanlangan.length === 0 ? (
          <span className="text-sm text-ink-400">So'zlarni pastdan tanlang</span>
        ) : (
          tanlangan.map((soz, j) => (
            <button
              key={j}
              type="button"
              disabled={qulflangan}
              onClick={() => onOzgar(tanlangan.filter((_, idx) => idx !== j))}
              className={cn(
                "rounded-xl px-3 py-1.5 font-semibold shadow-sm",
                // Rang FAQAT `natija` kelganda yonadi — `qulflangan`
                // `kutilmoqda` orqali ham `true` bo'lishi mumkin
                // (tekshiruv hali javob bermagan), va `natija?.isCorrect`
                // o'sha paytda `undefined` bo'lib, sukut bo'yicha
                // "xato" rangiga tushib qolardi. Interaktsiyani
                // to'xtatish (`qulflangan`) va rangni yoqish (`natija`)
                // ikkita ALOHIDA shart.
                natija != null
                  ? cn(
                      "cursor-default",
                      natija.isCorrect ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                    )
                  : qulflangan
                    ? "cursor-default bg-white text-ink-800 opacity-70"
                    : "bg-white text-ink-800",
              )}
            >
              {soz}
            </button>
          ))
        )}
      </div>

      {/* Qolgan bo'laklar */}
      <div className="flex flex-wrap gap-2">
        {options.map((soz, i) =>
          mavjud[i] ? (
            <button
              key={i}
              type="button"
              disabled={qulflangan}
              onClick={() => onOzgar([...tanlangan, soz])}
              className={cn(
                "rounded-xl border-2 border-transparent bg-tint px-3 py-1.5 font-semibold text-ink-800",
                qulflangan && "cursor-default opacity-50",
              )}
            >
              {soz}
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Juftlash({ options, tanlangan, onOzgar, natija, kutilmoqda }: IchkiProps) {
  // `options` aynan sakkizta: birinchi to'rttasi nemischa (chap ustun,
  // tartibi o'zgarmaydi), oxirgi to'rttasi o'zbekcha (aralashtirilgan).
  const nemischa = options.slice(0, 4);
  const ozbekcha = options.slice(4, 8);

  const [kutilayotgan, setKutilayotgan] = React.useState<string | null>(null);
  const qulflangan = natija != null || kutilmoqda;

  // Natija kelganda server `richtig` ni "de=uz|de=uz|de=uz|de=uz" ko'rinishida
  // qaytaradi — har bir juftni alohida to'g'ri/xato deb ko'rsatish uchun uni
  // `de -> uz` xaritasiga aylantiramiz.
  const togriXarita = React.useMemo(() => {
    if (!natija) return null;
    const xarita = new Map<string, string>();
    for (const juft of natija.richtig.split("|")) {
      const [de, uz] = juft.split("=");
      if (de != null && uz != null) xarita.set(de, uz);
    }
    return xarita;
  }, [natija]);

  const juftTop = (de: string) => tanlangan.find((p) => p.startsWith(`${de}=`)) ?? null;
  const juftUzTop = (uz: string) => tanlangan.find((p) => p.endsWith(`=${uz}`)) ?? null;

  const bekorQil = (juft: string) => onOzgar(tanlangan.filter((p) => p !== juft));

  const holatKlass = (paired: boolean, tanlab: boolean, togri: boolean | null) => {
    if (togri === true) return "border-success bg-success/10 text-success";
    if (togri === false) return "border-danger bg-danger/10 text-danger";
    if (tanlab) return "border-coral-500 bg-coral-500/10";
    if (paired) return "border-coral-500 bg-coral-500/10 opacity-50";
    return "border-transparent bg-tint text-ink-800";
  };

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="space-y-2">
        {nemischa.map((de) => {
          const juft = juftTop(de);
          const paired = juft != null;
          const tanlab = kutilayotgan === de;
          const togri = togriXarita ? togriXarita.get(de) === juft?.split("=")[1] : null;

          return (
            <button
              key={de}
              type="button"
              disabled={qulflangan}
              onClick={() => {
                if (paired && juft) {
                  bekorQil(juft);
                  return;
                }
                setKutilayotgan(tanlab ? null : de);
              }}
              className={cn(
                "w-full rounded-2xl border-2 px-3.5 py-3 text-left font-semibold transition-colors",
                holatKlass(paired, tanlab, natija != null && paired ? togri : null),
                qulflangan && "cursor-default",
              )}
            >
              {de}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {ozbekcha.map((uz) => {
          const juft = juftUzTop(uz);
          const paired = juft != null;
          const de = paired ? juft.split("=")[0] : null;
          const togri = togriXarita && de ? togriXarita.get(de) === uz : null;

          return (
            <button
              key={uz}
              type="button"
              disabled={qulflangan}
              onClick={() => {
                if (paired && juft) {
                  bekorQil(juft);
                  return;
                }
                if (kutilayotgan != null) {
                  onOzgar([...tanlangan, `${kutilayotgan}=${uz}`]);
                  setKutilayotgan(null);
                }
              }}
              className={cn(
                "w-full rounded-2xl border-2 px-3.5 py-3 text-left font-semibold transition-colors",
                holatKlass(paired, false, natija != null && paired ? togri : null),
                qulflangan && "cursor-default",
              )}
            >
              {uz}
            </button>
          );
        })}
      </div>
    </div>
  );
}
