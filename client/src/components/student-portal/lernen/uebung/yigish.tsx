"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

/**
 * Nechta juft to'liq javob hisoblanadi.
 *
 * Server ham shu sonni talab qiladi: juft soni noto'g'ri bo'lsa javob
 * shakli buzilgan hisoblanadi va BUTUNLAY xato bo'ladi (server tomoni:
 * `satz-fragen.ts`dagi `ZUORDNEN_JUFT`). Shuning uchun bu son ikki
 * tomonda bir xil bo'lishi shart — son shu BITTA joydan olinadi, boshqa
 * yerda qayta yozilmaydi.
 */
export function juftSoni(format: "PAAR" | "ZUORDNEN"): number {
  return format === "ZUORDNEN" ? 6 : 4;
}

export interface YigishProps {
  format: "SATZ_BAUEN" | "PAAR" | "ZUORDNEN";
  options: string[];
  /**
   * `SATZ_BAUEN` — tanlangan so'zlar tartibi.
   * `PAAR`/`ZUORDNEN` — juftlar, `chap=o'ng` satrlari.
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
  if (format === "PAAR" || format === "ZUORDNEN") {
    return (
      <Juftlash
        format={format}
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

interface JuftlashProps extends IchkiProps {
  format: "PAAR" | "ZUORDNEN";
}

/** Bitta tuzilgan juft — chap va o'ng ustundagi POZITSIYA (indeks). */
export interface IndexJuft {
  chapIdx: number;
  ongIdx: number;
}

interface BosishNatijasi {
  juftlar: IndexJuft[];
  kutilayotganIdx: number | null;
}

/**
 * Chap ustundagi `chapIdx` bosilganda: band bo'lsa o'sha juftni (ong bilan
 * birga) bekor qiladi; band bo'lmasa uni "kutilayotgan" qiladi (yana
 * bosilsa — bekor).
 *
 * SOF FUNKSIYA, faqat INDEKSLAR bilan ishlaydi — matnni umuman bilmaydi.
 */
export function chapBosildi(
  juftlar: IndexJuft[],
  kutilayotganIdx: number | null,
  chapIdx: number,
): BosishNatijasi {
  const mavjud = juftlar.find((j) => j.chapIdx === chapIdx);
  if (mavjud) {
    return { juftlar: juftlar.filter((j) => j !== mavjud), kutilayotganIdx };
  }
  return {
    juftlar,
    kutilayotganIdx: kutilayotganIdx === chapIdx ? null : chapIdx,
  };
}

/**
 * O'ng ustundagi `ongIdx` bosilganda: band bo'lsa o'sha juftni bekor
 * qiladi; kutilayotgan chap bo'lsa u bilan yangi juft tuzadi.
 *
 * SOF FUNKSIYA, faqat INDEKSLAR bilan ishlaydi — MUHIM: bu funksiya
 * ikkita tugmani ularning MATNI emas, pozitsiyasi bo'yicha farqlaydi.
 * Sabab: server `zuordnen()`da ibora matnini (`de`) noyob qiladi, lekin
 * `DafPhrase.de`da unique constraint yo'q — ikki BOSHQA vaziyat
 * nazariy jihatdan bir xil ibora matniga ega bo'lishi mumkin edi. Eski
 * mexanizm juftni MATN bo'yicha qidirardi (`tanlangan.find(p =>
 * p.endsWith(\`=${ong}\`))`) — shu holatda ikkinchi bir xil matnli
 * tugma "allaqachon band" deb topilib, uni HECH QACHON tanlab bo'lmay
 * qolardi (Task 4 ko'rigi). Bu — server tomonidagi dedupe'dan MUSTAQIL
 * ikkinchi himoya qatlami: shu funksiya matnni umuman ko'rmagani uchun
 * bunday chalkashish endi TUZILISHIY jihatdan mumkin emas.
 */
export function ongBosildi(
  juftlar: IndexJuft[],
  kutilayotganIdx: number | null,
  ongIdx: number,
): BosishNatijasi {
  const mavjud = juftlar.find((j) => j.ongIdx === ongIdx);
  if (mavjud) {
    return { juftlar: juftlar.filter((j) => j !== mavjud), kutilayotganIdx };
  }
  if (kutilayotganIdx == null) return { juftlar, kutilayotganIdx };
  return {
    juftlar: [...juftlar, { chapIdx: kutilayotganIdx, ongIdx }],
    kutilayotganIdx: null,
  };
}

/**
 * `juftlar` (indeks juftlari)dan serverga yuboriladigan "chap=o'ng"
 * qatorlarini quradi. SOF FUNKSIYA — faqat `options`dan chap/o'ng
 * ustunlarni ajratib, indekslarni matnga aylantiradi.
 *
 * ALOHIDA EKSPORT QILINGAN (ko'rik topilmasi): bu qatorning shakli —
 * ustun tartibi va `=` ajratkichi — serverning `pruefePaar`/
 * `pruefeZuordnen` parserlari kutgan formatga ANIQ mos kelishi shart,
 * lekin ilgari `Juftlash` komponenti ICHIDA yashiringan edi va hech
 * qanday test uni bosmagan edi — zanjirdagi boshqa har bir bo'g'in
 * (juft soni, indeks juftlash, serverning parseri, uchidan-uchigacha
 * baholash) sinalgan, faqat shu bitta qator emas.
 */
export function juftlarniMatngaAylantir(
  juftlar: IndexJuft[],
  options: string[],
  soni: number,
): string[] {
  const chapUstun = options.slice(0, soni);
  const ongUstun = options.slice(soni, soni * 2);
  return juftlar.map(({ chapIdx, ongIdx }) => `${chapUstun[chapIdx]}=${ongUstun[ongIdx]}`);
}

/**
 * Ikki ustunni juftlash: `PAAR` (nemischa/o'zbekcha) VA `ZUORDNEN`
 * (vaziyat/ibora) BITTA mexanizmdan foydalanadi — faqat ustunlar mazmuni
 * farq qiladi, bosish-bekor qilish mantig'i bir xil. Shu sabab ustunlar
 * "de"/"uz" emas, umumiy "chap"/"o'ng" deb nomlangan.
 *
 * TANLASH HOLATI (`juftlar`) INDEKS bo'yicha saqlanadi (`chapBosildi`/
 * `ongBosildi`, yuqorida) — faqat serverga YUBORILADIGAN `tanlangan`
 * (parent'dagi `yigilgan`) matn juftlari (`chap=o'ng`) bo'lib qoladi,
 * chunki server aynan shu shaklni kutadi (`given`, `seans-ekrani.tsx`).
 */
function Juftlash({ format, options, tanlangan, onOzgar, natija, kutilmoqda }: JuftlashProps) {
  // `options` soni har doim `juftSoni(format) * 2`: birinchi yarmi chap
  // ustun (tartibi o'zgarmaydi), qolgani o'ng ustun (aralashtirilgan).
  const soni = juftSoni(format);
  const chapUstun = options.slice(0, soni);
  const ongUstun = options.slice(soni, soni * 2);

  const [juftlar, setJuftlar] = React.useState<IndexJuft[]>([]);
  const [kutilayotganIdx, setKutilayotganIdx] = React.useState<number | null>(null);
  const qulflangan = natija != null || kutilmoqda;

  // Tashqi tozalash: `seans-ekrani.tsx` keyingi savolga o'tishda yoki
  // qayta boshlashda `yigilgan`ni `[]`ga qaytaradi — bu yerdagi mahalliy
  // holat ham shu bilan sinxron bo'lishi kerak, aks holda eski
  // (indekslar bo'yicha saqlangan) juftlar keyingi savolga "yopishib
  // qolardi", ular endi boshqa `options` ustiga ishora qilsa ham.
  React.useEffect(() => {
    if (tanlangan.length === 0 && juftlar.length > 0) {
      setJuftlar([]);
      setKutilayotganIdx(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tanlangan.length]);

  // Natija kelganda server `richtig` ni "chap=o'ng|chap=o'ng|…" ko'rinishida
  // qaytaradi — har bir juftni alohida to'g'ri/xato deb ko'rsatish uchun uni
  // `chap -> o'ng` xaritasiga aylantiramiz.
  const togriXarita = React.useMemo(() => {
    if (!natija) return null;
    const xarita = new Map<string, string>();
    for (const juft of natija.richtig.split("|")) {
      const [chap, ong] = juft.split("=");
      if (chap != null && ong != null) xarita.set(chap, ong);
    }
    return xarita;
  }, [natija]);

  // `juftlar`dagi indekslarni serverga yuborish uchun matn juftlariga
  // aylantirib, ikkalasini (mahalliy va parent) BIRGA yangilaydi.
  const yangila = (keyingi: IndexJuft[]) => {
    setJuftlar(keyingi);
    onOzgar(juftlarniMatngaAylantir(keyingi, options, soni));
  };

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
        {chapUstun.map((chap, chapIdx) => {
          const juft = juftlar.find((j) => j.chapIdx === chapIdx) ?? null;
          const paired = juft != null;
          const tanlab = kutilayotganIdx === chapIdx;
          const togri = togriXarita && juft ? togriXarita.get(chap) === ongUstun[juft.ongIdx] : null;

          return (
            <button
              key={chapIdx}
              type="button"
              disabled={qulflangan}
              onClick={() => {
                const natijasi = chapBosildi(juftlar, kutilayotganIdx, chapIdx);
                if (natijasi.juftlar !== juftlar) yangila(natijasi.juftlar);
                setKutilayotganIdx(natijasi.kutilayotganIdx);
              }}
              className={cn(
                // Ko'rik topilmasi (IMPORTANT): `truncate` bitta qatorga
                // kesib, ellipsis qo'yardi — `ZUORDNEN`ning olti juftida
                // haqiqiy vaziyat nomlari ("qayerdanligini so'rash" /
                // "qayerdanligini aytish" kabi) tor telefon ekranida bir
                // xil kesilgan ko'rinishga kelib qolardi, ikkita
                // FARQLANMAYDIGAN tugma bilan juftlash mashqi tanga
                // aylanardi. Endi matn IKKI QATORGACHA o'raladi
                // (`line-clamp-2`) — kichikroq shrift va tor qator
                // oralig'i bilan ko'pchilik ibora nomi to'liq sig'adi.
                // Ustunlar POZITSIYA bo'yicha tekislanadi, balandlik
                // bo'yicha emas, shuning uchun notekis qatorlar zararsiz.
                "line-clamp-2 w-full break-words rounded-2xl border-2 px-3.5 py-3 text-left text-sm font-semibold leading-tight transition-colors",
                holatKlass(paired, tanlab, natija != null && paired ? togri : null),
                qulflangan && "cursor-default",
              )}
            >
              {chap}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {ongUstun.map((ong, ongIdx) => {
          const juft = juftlar.find((j) => j.ongIdx === ongIdx) ?? null;
          const paired = juft != null;
          const togri = togriXarita && juft ? togriXarita.get(chapUstun[juft.chapIdx]) === ong : null;

          return (
            <button
              key={ongIdx}
              type="button"
              disabled={qulflangan}
              onClick={() => {
                const natijasi = ongBosildi(juftlar, kutilayotganIdx, ongIdx);
                if (natijasi.juftlar !== juftlar) yangila(natijasi.juftlar);
                setKutilayotganIdx(natijasi.kutilayotganIdx);
              }}
              className={cn(
                // Chap ustundagi tugma bilan bir xil tuzatish — yuqorida
                // shu izoh bor.
                "line-clamp-2 w-full break-words rounded-2xl border-2 px-3.5 py-3 text-left text-sm font-semibold leading-tight transition-colors",
                holatKlass(paired, false, natija != null && paired ? togri : null),
                qulflangan && "cursor-default",
              )}
            >
              {ong}
            </button>
          );
        })}
      </div>
    </div>
  );
}
