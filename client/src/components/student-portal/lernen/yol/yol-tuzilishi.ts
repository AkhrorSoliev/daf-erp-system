import type { LernenSectionGroup, LernenSeans } from "../types";

export type YolTugunTuri = "daraja" | "unit" | "seans" | "tez-orada";

/**
 * `yolTugunlari` talab qiladigan eng kichik shakl.
 *
 * Amalda bu yerga `getLevels` javobi (`LernenLevel[]`) keladi va u
 * bemalol mos keladi — real `daraja` maydoni `DafLevel` degan cheklangan
 * to'plam, u esa `string`ning KENGROQ turi. Bu yerda ataylab `string`
 * qilib olingan: sof mantiq testlari haqiqiy darajalarsiz ("A1", "A2"
 * kabi oddiy belgilar bilan) ishlashi kerak, va `LernenLevel` ni
 * to'g'ridan-to'g'ri ishlatish buni taqiqlardi.
 */
export interface YolDarajaKirish {
  level: string;
  label: string;
  units: YolUnitKirish[];
}

/** `getLevels` javobidagi unit — faqat yo'l uchun kerakli maydonlar. */
export interface YolUnitKirish {
  id: number;
  titleUz: string;
  sections: LernenSectionGroup[];
}

export interface YolTugun {
  tur: YolTugunTuri;
  /** `seans` va `unit` uchun — bosilganda kerak bo'ladigan ID. */
  id: number | null;
  matn: string;
  ostyozuv: string | null;
  daraja: string;
  holat: "done" | "active" | "locked";
}

/**
 * Har seansga o'z bo'lim/unit manzilini biriktirib qo'yadi — qulf holati
 * BUTUN yo'l bo'ylab hisoblanadi, shuning uchun tugunni yaratishdan oldin
 * qaysi seans qaysi darajaga tegishli ekanini bilish kerak.
 */
interface Manzilli {
  daraja: string;
  seans: LernenSeans;
}

/**
 * Darajalar bo'ylab yuradi va yassi ro'yxat quradi.
 *
 * Qulf hisobi butun yo'l bo'ylab yuritiladi: hamma unitning hamma seansi
 * bitta ketma-ketlikka birlashtiriladi, birinchi `completedAt == null`
 * bo'lgani `active`, undan keyingilarining hammasi `locked`. Bo'lim
 * ichida yoki unit ichida alohida sanalsa, ekranda bir vaqtda bir necha
 * "navbatdagi" tugun yonardi.
 */
export function yolTugunlari(levels: YolDarajaKirish[]): YolTugun[] {
  const hammaSeanslar: Manzilli[] = [];
  for (const daraja of levels) {
    for (const unit of daraja.units) {
      for (const bolim of unit.sections) {
        for (const seans of bolim.lessons) {
          hammaSeanslar.push({ daraja: daraja.level, seans });
        }
      }
    }
  }

  // Navbatdagi seans butun yo'l bo'ylab BITTA — birinchi tugallanmagan.
  const navbatdagiIndex = hammaSeanslar.findIndex(
    (m) => m.seans.completedAt == null,
  );

  const holatOl = (index: number): YolTugun["holat"] => {
    if (navbatdagiIndex === -1) return "done";
    if (index < navbatdagiIndex) return "done";
    if (index === navbatdagiIndex) return "active";
    return "locked";
  };

  const tugunlar: YolTugun[] = [];
  let sanoq = 0;

  for (const daraja of levels) {
    tugunlar.push({
      tur: "daraja",
      id: null,
      matn: daraja.label,
      ostyozuv: null,
      daraja: daraja.level,
      holat: "done",
    });

    if (daraja.units.length === 0) {
      // A2/B1 kabi kontentsiz daraja — bitta "tez orada" tuguni bilan
      // yakunlanadi, seanssiz yo'l bo'sh chizilmasin.
      tugunlar.push({
        tur: "tez-orada",
        id: null,
        matn: "Tez orada",
        ostyozuv: null,
        daraja: daraja.level,
        holat: "locked",
      });
      continue;
    }

    for (const unit of daraja.units) {
      tugunlar.push({
        tur: "unit",
        id: unit.id,
        matn: unit.titleUz,
        ostyozuv: null,
        daraja: daraja.level,
        holat: "done",
      });

      // Bo'limi yo'q unit (eski DiB) — sarlavhadan boshqa hech narsa
      // qo'shilmaydi, yo'l shu yerda yiqilmasligi kerak.
      for (const bolim of unit.sections) {
        for (const seans of bolim.lessons) {
          tugunlar.push({
            tur: "seans",
            id: seans.id,
            matn: seans.titleUz ?? seans.titleDe,
            ostyozuv: bolim.titleUz,
            daraja: daraja.level,
            holat: holatOl(sanoq),
          });
          sanoq += 1;
        }
      }
    }
  }

  return tugunlar;
}

export interface YolQatorMeta {
  /**
   * Zigzag bosqichi — faqat `seans`/`tez-orada` tugunlari uchun oshib
   * boradi (0, 1, 2, …), `daraja`/`unit` uchun har doim `0`. Renderlovchi
   * (`LernenYol`) bu sonni to'rtta tekislanishdan (markaz/o'ng/markaz/chap)
   * biriga aylantiradi — bu yerda faqat SANOQ beriladi, Tailwind sinfi
   * emas, chunki tekislanishning o'zi vizual tanlov, sof mantiq emas.
   */
  zigzagBosqichi: number;
  /** Shu tugun ustida bo'lim nomi (`ostyozuv`) ko'rsatilsinmi. */
  ostyozuvKorinsinmi: boolean;
}

/**
 * Har tugun uchun zigzag bosqichini va "bo'lim nomi ko'rsatilsinmi"
 * bayrog'ini OLDINDAN, bitta o'tishda hisoblaydi.
 *
 * Ikkovi HAR XIL chegara qoidasiga ega, ataylab:
 *
 *  - Zigzag bosqichi unit/daraja qatorlari ustidan TO'XTAMASDAN o'tadi —
 *    ular to'liq kenglikda bo'lsa ham, naqsh davom etishi kerak (aks
 *    holda har unit boshida markazdan qayta boshlanib, yo'l notekis
 *    ko'rinardi). Bu chegarani kesish/kesmaslik VIZUAL qaror, shuning
 *    uchun bu yerda ataylab o'zgartirilmaydi.
 *
 *  - Bo'lim yorlig'i xotirasi esa HAR unit/daraja chegarasida TOZALANADI:
 *    bir unitning oxirgi bo'limi bilan keyingi unitning birinchi bo'limi
 *    bir xil nomni olib qolishi mumkin (masalan ikkalasi ham "Kirish"),
 *    va bu holda ular BOSHQA-BOSHQA bo'lim — ikkinchisi ham o'z yorlig'ini
 *    ko'rsatishi kerak. Tozalanmasa, tasodifan mos kelgan nom joyida
 *    yorliq JIMgina yo'qolib ketardi — bu mantiqiy xato, vizual tanlov
 *    emas, shuning uchun mustaqil sinaladi.
 */
export function yolQatorMetasi(tugunlar: YolTugun[]): YolQatorMeta[] {
  const natija: YolQatorMeta[] = [];
  let zigzagBosqichi = 0;
  let oldingiOstyozuv: string | null = null;

  for (const tugun of tugunlar) {
    if (tugun.tur === "daraja" || tugun.tur === "unit") {
      oldingiOstyozuv = null;
      natija.push({ zigzagBosqichi: 0, ostyozuvKorinsinmi: false });
      continue;
    }
    const ostyozuvKorinsinmi = tugun.ostyozuv !== oldingiOstyozuv;
    oldingiOstyozuv = tugun.ostyozuv;
    natija.push({ zigzagBosqichi, ostyozuvKorinsinmi });
    zigzagBosqichi += 1;
  }

  return natija;
}

/**
 * 1000 dan boshlab `k` bilan qisqartiradi, bitta kasr xonasi bilan
 * (`1.2k`), butun bo'lsa kasrsiz (`16k`). Mingdan kichigi o'zgarmaydi.
 */
export function qisqaRaqam(n: number): string {
  if (n < 1000) return String(n);
  const ming = n / 1000;
  const bitta = Math.round(ming * 10) / 10;
  return Number.isInteger(bitta) ? `${bitta}k` : `${bitta.toFixed(1)}k`;
}

/**
 * Joriy daraja BANDI ichida qancha bosib o'tilgani, foizda (0–100).
 *
 * `gesamt / naechsteStufe.ab` bilan CHALKASHTIRMASLIK KERAK: o'sha hisob
 * nolldan boshlaydi va darajaga endi kirgan o'quvchini ham "band ichida
 * uchdan bir yo'l bosib o'tgan" qilib ko'rsatadi — chiziqning ishi aynan
 * "keyingisigacha qancha qoldi"ni aytish, "boshidan qancha yig'ilgan"ni
 * emas. To'g'ri formula bandning PASTKI chegarasini (`stufeAb`) ayirib
 * tashlaydi, shunda darajaga yangi kirilganda chiziq nolga yaqin, keyingi
 * chegaraga (`naechsteStufeAb`) yetganda esa aynan 100 bo'ladi.
 *
 * `naechsteStufeAb == null` — eng yuqori daraja, undan keyin band yo'q,
 * chiziq har doim to'liq.
 */
export function darajaFoizi(
  gesamt: number,
  stufeAb: number,
  naechsteStufeAb: number | null,
): number {
  if (naechsteStufeAb == null) return 100;
  const bandKengligi = naechsteStufeAb - stufeAb;
  if (bandKengligi <= 0) return 100;
  const foiz = ((gesamt - stufeAb) / bandKengligi) * 100;
  return Math.max(0, Math.min(100, foiz));
}
