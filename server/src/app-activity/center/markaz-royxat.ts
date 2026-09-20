import { Holat, HOLAT_TARTIBI } from '../norma/norma';
import { Daraja, DARAJALAR } from '../stats/daraja';
import { Davr } from '../stats/davr';
import {
  GuruhAzoligi,
  MarkazFiltrVariantlari,
  OquvchiHisobi,
} from './center-app-activity.types';

/**
 * O'quvchilar ro'yxati ustidagi toza amallar (dizayn 6.1–6.2, 9.3). Hammasi
 * TypeScript da: holat normadan chiqadi, norma SQL ga kirmasin. Populyatsiya
 * ≤ bir necha ming qator — bu ish uchun bemalol yetadi.
 */

export const SARALASHLAR = [
  'holat',
  'faolKun',
  'vaqt',
  'foiz',
  'oxirgi',
  'ism',
  'guruh',
] as const;
export type Saralash = (typeof SARALASHLAR)[number];
export type Yonalish = 'asc' | 'desc';

export const SAHIFA_HAJMI = 50;

export interface RoyxatFiltri {
  status?: Holat[];
  /** `true` — davr ichida kirganlar; `false` — kirmaganlar; yo'q — hammasi. */
  kirgan?: boolean;
  groupId?: string;
  teacherId?: number;
  level?: Daraja;
  /** Ism yoki telefon bo'yicha. */
  q?: string;
}

export interface OquvchilarSorovi extends RoyxatFiltri {
  davr: Davr;
  sort: Saralash;
  dir: Yonalish;
  page: number;
  pageSize: number;
}

const raqamlar = (s: string) => s.replace(/\D/g, '');

/**
 * Telefon mosligi uchun kamida 3 raqam — «90» hamma raqamda bor, u qidiruv
 * emas.
 */
const TELEFON_QIDIRUV_MIN = 3;

export function filtrla(
  hisoblar: OquvchiHisobi[],
  f: RoyxatFiltri,
): OquvchiHisobi[] {
  const q = (f.q ?? '').trim().toLowerCase();
  const qRaqam = raqamlar(q);
  return hisoblar.filter((h) => {
    if (f.status && f.status.length > 0 && !f.status.includes(h.holat))
      return false;
    if (f.kirgan !== undefined && h.kirdi !== f.kirgan) return false;
    if (f.groupId && !h.guruhlar.some((g) => g.id === f.groupId)) return false;
    if (
      f.teacherId !== undefined &&
      !h.guruhlar.some((g) => g.oqituvchilar.some((o) => o.id === f.teacherId))
    )
      return false;
    if (f.level && !h.guruhlar.some((g) => g.daraja === f.level)) return false;
    if (q) {
      const ismMos = h.ism.toLowerCase().includes(q);
      const telMos =
        qRaqam.length >= TELEFON_QIDIRUV_MIN &&
        (raqamlar(h.telefon).includes(qRaqam) ||
          (h.otaOnaTelefoni !== null &&
            raqamlar(h.otaOnaTelefoni).includes(qRaqam)));
      if (!ismMos && !telMos) return false;
    }
    return true;
  });
}

/** Oxirgi kirish: hech qachon (null) eng oldin, keyin eng eskisi. */
function oxirgiTartib(a: OquvchiHisobi, b: OquvchiHisobi): number {
  const vaqt = (h: OquvchiHisobi) =>
    h.oxirgiFaollik ? Date.parse(h.oxirgiFaollik.vaqt) : -Infinity;
  const av = vaqt(a);
  const bv = vaqt(b);
  if (av === bv) return 0;
  return av < bv ? -1 : 1;
}

type Taqqos = (a: OquvchiHisobi, b: OquvchiHisobi) => number;

const ASOSIY: Record<Saralash, Taqqos> = {
  // Eng muammolisi yuqorida; teng holatda eng uzoq kirmagan oldin.
  holat: (a, b) =>
    HOLAT_TARTIBI[a.holat] - HOLAT_TARTIBI[b.holat] || oxirgiTartib(a, b),
  faolKun: (a, b) => a.faolKun - b.faolKun,
  // Jadval JAMIni emas, KUNIGA O'RTACHAni chizadi (`ortachaKunlikSoniya` —
  // daf-oquvchilar-table.tsx). `maxraj` o'quvchida har xil, shuning uchun jami
  // bo'yicha saralansa, kam kunlik-lekin-band o'quvchi ko'p kunlik-lekin-kam
  // ishlagan o'quvchidan pastda chiqib qolardi (I2).
  vaqt: (a, b) =>
    a.lernenSoniya / Math.max(1, a.maxraj) -
    b.lernenSoniya / Math.max(1, b.maxraj),
  // Foiz yo'q (savol yo'q) — 0 % dan ham past deb olinadi.
  foiz: (a, b) => (a.foiz ?? -1) - (b.foiz ?? -1),
  oxirgi: oxirgiTartib,
  ism: (a, b) => a.ism.localeCompare(b.ism),
  guruh: (a, b) =>
    (a.guruhlar[0]?.nomi ?? '').localeCompare(b.guruhlar[0]?.nomi ?? ''),
};

export function sarala(
  hisoblar: OquvchiHisobi[],
  sort: Saralash,
  dir: Yonalish,
): OquvchiHisobi[] {
  const yon = dir === 'desc' ? -1 : 1;
  const asosiy = ASOSIY[sort];
  return [...hisoblar].sort(
    (a, b) => yon * asosiy(a, b) || a.ism.localeCompare(b.ism),
  );
}

export function sahifala<T>(
  royxat: T[],
  sahifa: number,
  hajm: number,
): { jami: number; sahifa: number; qatorlar: T[] } {
  const jami = royxat.length;
  const oxirgi = Math.max(1, Math.ceil(jami / hajm));
  const s = Math.min(Math.max(1, sahifa), oxirgi);
  return { jami, sahifa: s, qatorlar: royxat.slice((s - 1) * hajm, s * hajm) };
}

/**
 * Filtr tanlagichlari populyatsiyadan — variantlar ma'lumot bilan doim mos.
 * Chaqiruvchi FILTRLANMAGAN to'liq populyatsiyani uzatishi SHART (servisda
 * `filtrla()`dan OLDINGI ro'yxat) — aks holda tanlangan filtr o'z
 * variantlarini yashirib qo'yadi (masalan bitta guruh tanlansa, tanlagichda
 * boshqa guruhlar yo'qolib qoladi).
 */
export function filtrVariantlari(
  hisoblar: OquvchiHisobi[],
): MarkazFiltrVariantlari {
  const guruhlar = new Map<string, string>();
  const oqituvchilar = new Map<number, string>();
  const darajalar = new Set<Daraja>();
  for (const h of hisoblar) {
    for (const g of h.guruhlar) {
      guruhlar.set(g.id, g.nomi);
      if (g.daraja) darajalar.add(g.daraja);
      for (const o of g.oqituvchilar) oqituvchilar.set(o.id, o.ism);
    }
  }
  return {
    guruhlar: [...guruhlar]
      .map(([id, nomi]) => ({ id, nomi }))
      .sort((a, b) => a.nomi.localeCompare(b.nomi)),
    oqituvchilar: [...oqituvchilar]
      .map(([id, ism]) => ({ id, ism }))
      .sort((a, b) => a.ism.localeCompare(b.ism)),
    darajalar: DARAJALAR.filter((d) => darajalar.has(d)),
  };
}

/**
 * Qatorda ko'rinadigan guruh (dizayn 3.6): filtr guruhi bo'lsa o'sha, bo'lmasa
 * eng erta boshlangan faol yozuv (servis `guruhlar` ni shu tartibda beradi).
 */
export function korsatiladiganGuruh(
  h: OquvchiHisobi,
  groupId?: string,
): GuruhAzoligi | null {
  if (groupId) {
    const mos = h.guruhlar.find((g) => g.id === groupId);
    if (mos) return mos;
  }
  return h.guruhlar[0] ?? null;
}
