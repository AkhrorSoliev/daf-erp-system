"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";
import { tugmaBosildi, type JonliJuft, type Tanlov, type Tomon } from "./juft-holati";

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

/**
 * `options`ni chap va o'ng ustunlarga bo'ladi: birinchi yarmi chap ustun
 * (tartibi o'zgarmaydi), qolgani o'ng ustun (aralashtirilgan) — server
 * shu tartibda yuboradi (`wort-fragen.ts`/`satz-fragen.ts`).
 *
 * ALOHIDA EKSPORT (bir joyda): bu bo'linish ENDI IKKI joyda kerak —
 * `Juftlash` tugmalarni chizish uchun, `seans-ekrani.tsx` esa `onJuft`
 * orqali kelgan INDEKSlarni `useJuftTekshir`ga yuboriladigan MATNGA
 * aylantirish uchun (server `chap`/`ong`ni matn sifatida kutadi, indeks
 * emas). Bo'linish qoidasi ikkinchi joyda qayta yozilsa, ular kelajakda
 * bir-biridan uzilib qolishi mumkin edi — xuddi `juftlarniMatngaAylantir`
 * uchun bo'lgan ko'rik topilmasidagi kabi.
 */
export function juftUstunlar(
  options: string[],
  format: "PAAR" | "ZUORDNEN",
): { chapUstun: string[]; ongUstun: string[] } {
  const soni = juftSoni(format);
  return { chapUstun: options.slice(0, soni), ongUstun: options.slice(soni, soni * 2) };
}

/**
 * `SATZ_BAUEN` — bo'laklardan gap tuzish (eski ikki bosqichli tekshiruv:
 * tanlash, keyin "Tekshirish").
 */
interface SatzBauenProps {
  format: "SATZ_BAUEN";
  options: string[];
  /** Tanlangan so'zlar tartibi. */
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
 * `PAAR`/`ZUORDNEN` — jonli juftlash: har juft bosilgan zahoti serverda
 * tekshiriladi, ikki bosqichli "Tekshirish" yo'q.
 *
 * `Juftlash` HOLAT SAQLAMAYDI (juftlarning o'zi uchun) — bu komponent
 * faqat CHIZADI. Qaysi juft qanday holatda ekani (`juftlar`) va
 * endigina xato bo'lgan juft qaysi (`xatoIdxlar`) tashqaridan
 * (`seans-ekrani.tsx`) keladi; so'rovni yuborish va javobni kutish ham
 * o'sha yerda. Sabab: bu loyihaning o'zgarmas qoidasi — komponentlar
 * yupqa qolishi kerak, va `juft-holati.ts`dagi sof modul aynan shu
 * uchun ajratilgan.
 */
interface JuftlashDaJonliProps {
  format: "PAAR" | "ZUORDNEN";
  options: string[];
  juftlar: JonliJuft[];
  /**
   * Endigina xato bo'lgan (shu sabab `juftlar`dan olib tashlangan)
   * juftlarning indekslari — qisqa vaqt (≈500ms) qizil ko'rsatish uchun.
   * `prefers-reduced-motion` yoqilgan bo'lsa chaqiruvchi bu ro'yxatga
   * umuman qo'shmaydi (`seans-ekrani.tsx`) — rang darhol "bo'sh"ga qaytadi.
   */
  xatoIdxlar: { chapIdx: number; ongIdx: number }[];
  /** Ikkala tomon ham bosilib, yangi juft hosil bo'lganda chaqiriladi. */
  onJuft: (chapIdx: number, ongIdx: number) => void;
}

export type YigishProps = SatzBauenProps | JuftlashDaJonliProps;

/**
 * Bo'laklardan yig'ib javob tuzish: `SATZ_BAUEN` (gap tuzish, eski
 * ikki bosqichli tekshiruv) va `PAAR`/`ZUORDNEN` (jonli juftlash, har
 * juft alohida tekshiriladi).
 *
 * Ikkalasining prop shakli TUBDAN farq qiladi (diskriminatsiya qilingan
 * union, yuqorida) — `SATZ_BAUEN` hamon `tanlangan`/`natija`/`kutilmoqda`
 * bilan ishlaydi, jonli juftlash esa `juftlar`/`onJuft` bilan. Ularni
 * bitta umumiy prop to'plamiga siqish ikkalasida ham kerak bo'lmagan
 * maydonlarni ixtiyoriy qilib qo'yardi.
 *
 * TO'G'RI JAVOB PROPS'DA YO'Q — `mc-exercise.tsx` dagi qoida shu yerda
 * ham amal qiladi.
 */
export function Yigish(props: YigishProps) {
  // MUHIM (TypeScript cheklovi): tekshiruv ATAYLAB `format === "SATZ_BAUEN"`
  // (BITTA literal) — `props.format === "PAAR" || props.format === "ZUORDNEN"`
  // ko'rinishida yozilsa, TypeScript qolgan (`else`) tarmoqda `props`ni
  // `SatzBauenProps`ga TORAYTIRA OLMAYDI, chunki diskriminant ikkinchi
  // a'zoda ikkita literalning BIRLASHMASI (`"PAAR" | "ZUORDNEN"`) — kompilyator
  // buni bitta `||` tekshiruvi bilan "qolgan yagona a'zo" deb bog'lay olmaydi
  // (repro bilan tasdiqlangan). Diskriminantni BITTA literalli tarmoqdan
  // boshlash — ikkalasi ham to'g'ri toraytiriladi.
  if (props.format === "SATZ_BAUEN") {
    const { options, tanlangan, onOzgar, natija, kutilmoqda = false } = props;
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
  const { format, options, juftlar, xatoIdxlar, onJuft } = props;
  return (
    <Juftlash
      format={format}
      options={options}
      juftlar={juftlar}
      xatoIdxlar={xatoIdxlar}
      onJuft={onJuft}
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

interface JuftlashProps {
  format: "PAAR" | "ZUORDNEN";
  options: string[];
  juftlar: JonliJuft[];
  xatoIdxlar: { chapIdx: number; ongIdx: number }[];
  onJuft: (chapIdx: number, ongIdx: number) => void;
}

/** Bitta tugmaning besh ko'rinishidan biri (dizayn jadvali, task brief §1). */
type TugmaHolati = "bosh" | "tanlab" | "kutilmoqda" | "togri" | "xato";

function tugmaSinfi(holat: TugmaHolati): string {
  switch (holat) {
    case "togri":
      return "border-success bg-success/10 text-success";
    case "xato":
      return "border-danger bg-danger/10 text-danger";
    case "tanlab":
      return "border-coral-500 bg-coral-500/10";
    case "kutilmoqda":
      return "border-coral-500 bg-coral-500/10 opacity-50";
    case "bosh":
      return "border-transparent bg-tint text-ink-800";
  }
}

/**
 * Ikki ustunni juftlash: `PAAR` (nemischa/o'zbekcha) VA `ZUORDNEN`
 * (vaziyat/ibora) BITTA mexanizmdan foydalanadi — faqat ustunlar mazmuni
 * farq qiladi, bosish mantig'i bir xil. Shu sabab ustunlar "de"/"uz"
 * emas, umumiy "chap"/"o'ng" deb nomlangan.
 *
 * MAHALLIY HOLAT FAQAT BITTA: `kutilayotgan` — bosilib, qarama-qarshi
 * tomondan juftini kutayotgan tugma. U IKKALA ustunda ham bo'lishi
 * mumkin (`{tomon, idx}`), chunki juftlashni chapdan ham, o'ngdan ham
 * boshlash bir xil tabiiy. Bu HAQIQIY javob emas (hali onJuft
 * chaqirilmagan), shuning uchun tashqariga chiqarilmaydi — xuddi fokus
 * yoki hover kabi, sof ko'rinish holati. Juftlarning o'zi (`juftlar`) va
 * endigina xato bo'lganlar (`xatoIdxlar`) TO'LIQ tashqarida
 * (`seans-ekrani.tsx`) yashaydi.
 *
 * O'TISH QOIDASI KOMPONENTDA EMAS: bosishning holat o'tishi
 * `juft-holati.ts` dagi sof `tugmaBosildi` da va u yerda testlangan —
 * bu repoda komponent render qilib test yozilmaydi, shuning uchun
 * mantiqni shu yerda qoldirish uni testsiz qoldirish degani bo'lardi.
 *
 * YANGI SAVOLDA QAYTA TIKLASH: chaqiruvchi bu komponentga `key={...}`
 * beradi (itemId+format bo'yicha) — savol almashganda butunlay qayta
 * o'rnatiladi, shuning uchun `kutilayotgan` alohida effekt bilan
 * tozalanishi shart emas.
 */
function Juftlash({ format, options, juftlar, xatoIdxlar, onJuft }: JuftlashProps) {
  const { chapUstun, ongUstun } = juftUstunlar(options, format);
  const [kutilayotgan, setKutilayotgan] = React.useState<Tanlov | null>(null);

  // IKKALA ustun uchun BITTA ishlov beruvchi — ilgari `chapBosildi` va
  // `ongBosildi` alohida edi va aynan shu ayrilik nosimmetriyani
  // tug'dirgan: o'ngdagi faqat chapda kutayotgan tanlov bo'lsagina
  // ishlardi, aks holda jimgina qaytib ketardi.
  const bosildi = (tomon: Tomon, idx: number) => {
    // Himoya qatlami: tugma allaqachon `disabled` bo'lishi kerak, lekin
    // funksiya mustaqil ravishda ham shu qoidani ta'minlaydi.
    const band =
      tomon === "chap"
        ? juftlar.some((j) => j.chapIdx === idx) ||
          xatoIdxlar.some((x) => x.chapIdx === idx)
        : juftlar.some((j) => j.ongIdx === idx) ||
          xatoIdxlar.some((x) => x.ongIdx === idx);
    if (band) return;

    const natija = tugmaBosildi(kutilayotgan, tomon, idx);
    setKutilayotgan(natija.kutilayotgan);
    if (natija.juft) onJuft(natija.juft.chapIdx, natija.juft.ongIdx);
  };

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className="space-y-2">
        {chapUstun.map((chap, chapIdx) => {
          const juft = juftlar.find((j) => j.chapIdx === chapIdx) ?? null;
          const xatoBu = xatoIdxlar.some((x) => x.chapIdx === chapIdx);
          const holat: TugmaHolati = xatoBu
            ? "xato"
            : juft?.holat === "togri"
              ? "togri"
              : juft?.holat === "kutilmoqda"
                ? "kutilmoqda"
                : kutilayotgan?.tomon === "chap" && kutilayotgan.idx === chapIdx
                  ? "tanlab"
                  : "bosh";
          const bosilmaydi = juft != null || xatoBu;

          return (
            <button
              key={chapIdx}
              type="button"
              disabled={bosilmaydi}
              onClick={() => bosildi("chap", chapIdx)}
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
                //
                // `motion-reduce:transition-none`: rang o'zgarishi
                // (masalan "kutilmoqda" → "togri") harakatni kamaytirishni
                // so'ragan o'quvchi uchun darhol, o'tishsiz sodir bo'ladi.
                // Xato chaqnashi uchun ASOSIY himoya boshqa joyda —
                // `seans-ekrani.tsx` reduced-motion'da `xatoIdxlar`ga
                // umuman qo'shmaydi — bu shunchaki qo'shimcha qatlam.
                "line-clamp-2 w-full break-words rounded-2xl border-2 px-3.5 py-3 text-left text-sm font-semibold leading-tight transition-colors motion-reduce:transition-none",
                tugmaSinfi(holat),
                bosilmaydi && "cursor-default",
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
          const xatoBu = xatoIdxlar.some((x) => x.ongIdx === ongIdx);
          const holat: TugmaHolati = xatoBu
            ? "xato"
            : juft?.holat === "togri"
              ? "togri"
              : juft?.holat === "kutilmoqda"
                ? "kutilmoqda"
                : kutilayotgan?.tomon === "ong" && kutilayotgan.idx === ongIdx
                  ? "tanlab"
                  : "bosh";
          const bosilmaydi = juft != null || xatoBu;

          return (
            <button
              key={ongIdx}
              type="button"
              disabled={bosilmaydi}
              onClick={() => bosildi("ong", ongIdx)}
              className={cn(
                // Chap ustundagi tugma bilan bir xil tuzatish — yuqorida
                // shu izoh bor.
                "line-clamp-2 w-full break-words rounded-2xl border-2 px-3.5 py-3 text-left text-sm font-semibold leading-tight transition-colors motion-reduce:transition-none",
                tugmaSinfi(holat),
                bosilmaydi && "cursor-default",
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
