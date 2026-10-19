/**
 * Haftalik liga va guruhlar jadvali qoidalari — BITTA joyda (spec S3 §1.1,
 * §2.1, ADR-0116). Hammasi sof funksiya: baza, vaqt va tasodif yo'q, shuning
 * uchun hisob (`liga-hisob.ts`), o'qish (`liga-xona.ts`, `guruhlar-jadvali.ts`)
 * va yuklama skriptlari bir xil qoidani ishlatadi. Mijoz nomlar va chegaralarni
 * test bilan shu fayldan o'qib solishtiradi (`client/.../lernen/liga.test.ts`).
 */
export const LIGA_NOMLARI = [
  'Bronza',
  'Kumush',
  'Oltin',
  'Yoqut',
  'Olmos',
] as const;
export const ENG_YUQORI_DARAJA = LIGA_NOMLARI.length - 1;
export const XONA_SIGIMI = 30;
/** Dushanba taqsimotining maqsadi — sig'imdan past: yangi kelganlarga joy qoladi. */
export const XONA_MAQSAD = 25;
export const KOTARILISH_SONI = 5;
export const KOTARILISH_MIN_BALL = 50;
export const KOTARILISH_MIN_AZO = 15;
export const GOLIB_MIN_BALL = 50;
export const GOLIB_MIN_AZO = 5;
export const GURUH_MIN_AZO = 3;
export const GURUH_TOP = 10;

export function darajaNomi(tier: number): string {
  return LIGA_NOMLARI[Math.min(Math.max(tier, 0), ENG_YUQORI_DARAJA)];
}

export interface XonaAzosi {
  studentId: number;
  points: number;
}

/** Ball kamayishi, teng ballda `studentId` o'sishi (06.09 §6.2) — markaz jadvali bilan bir xil. */
export function saralaXona<T extends XonaAzosi>(azolar: readonly T[]): T[] {
  return [...azolar].sort(
    (a, b) => b.points - a.points || a.studentId - b.studentId,
  );
}

/**
 * Ko'tarilish zonasi: Olmosdan pastda birinchi 5 ta, faqat xona kamida 15
 * kishi bo'lganda faol — kam faolda 3 kishilik xonadan avtomatik ko'tarilish
 * bo'lmasin (CEO, 2026-10-18).
 */
export function kotarilishZonasi(
  hajm: number,
  tier: number,
): { soni: number; faol: boolean } {
  const soni = tier < ENG_YUQORI_DARAJA ? KOTARILISH_SONI : 0;
  return { soni, faol: soni > 0 && hajm >= KOTARILISH_MIN_AZO };
}

export interface XonaNatijaQatori extends XonaAzosi {
  place: number;
  promoted: boolean;
}

/** Hafta oxiri (spec S3 §1.4 2–3): hammaga o'rin, zonadagi ≥ 50 ballilar ko'tariladi. */
export function xonaNatijasi(
  azolar: readonly XonaAzosi[],
  tier: number,
): XonaNatijaQatori[] {
  const zona = kotarilishZonasi(azolar.length, tier);
  return saralaXona(azolar).map((a, i) => ({
    studentId: a.studentId,
    points: a.points,
    place: i + 1,
    promoted: zona.faol && i < zona.soni && a.points >= KOTARILISH_MIN_BALL,
  }));
}

export function xonalarSoni(n: number): number {
  return n <= 0 ? 0 : Math.ceil(n / XONA_MAQSAD);
}

/**
 * FNV-1a (32 bit) `studentId|weekStart` ustida: taqsimot tartibsiz (id
 * ketma-ketligi xonani hal qilmaydi), lekin takrorlanuvchi — qayta hisob
 * xuddi shu xonalarni beradi.
 */
export function xonaHash(studentId: number, haftaBoshi: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${studentId}|${haftaBoshi}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** `ceil(n / 25)` xonaga teng: hash tartibida navbat bilan, o'lchamlar farqi ≤ 1 (40 → 20 + 20). */
export function tengBol(
  studentIds: readonly number[],
  haftaBoshi: string,
): number[][] {
  const k = xonalarSoni(studentIds.length);
  const tartib = [...studentIds].sort(
    (a, b) => xonaHash(a, haftaBoshi) - xonaHash(b, haftaBoshi) || a - b,
  );
  const xonalar = Array.from({ length: k }, () => [] as number[]);
  tartib.forEach((id, i) => xonalar[i % k].push(id));
  return xonalar;
}

/** Hafta ichida: a'zosi eng kam (< 30) xona, tengda raqami kichigi; hammasi to'la — `null`. */
export function engKamXona(
  xonalar: readonly { id: number; number: number; hajm: number }[],
): number | null {
  let eng: { id: number; number: number; hajm: number } | null = null;
  for (const x of xonalar) {
    if (x.hajm >= XONA_SIGIMI) continue;
    if (
      !eng ||
      x.hajm < eng.hajm ||
      (x.hajm === eng.hajm && x.number < eng.number)
    )
      eng = x;
  }
  return eng?.id ?? null;
}

export interface GuruhYigindisi {
  groupId: string;
  name: string;
  /** Hozirgi faol a'zolar soni (mashq qilmaganlar ham). */
  azolar: number;
  /** Shu hafta shu guruh uchun topilgan ball. */
  ball: number;
}

export interface GuruhNatija extends GuruhYigindisi {
  baho: number;
  place: number;
}

/**
 * Guruhlar jadvali (spec S3 §2.1): kamida 3 faol a'zo, baho = ball ÷ a'zolar,
 * baho ↓, teng bo'lsa guruh id ↑ — oddiy satr taqqoslash, bazaning
 * kollatsiyasiga bog'liq emas. Saralash yaxlitlanmagan baho bo'yicha.
 */
export function guruhlarniSarala(
  rows: readonly GuruhYigindisi[],
): GuruhNatija[] {
  return rows
    .filter((r) => r.azolar >= GURUH_MIN_AZO)
    .map((r) => ({ ...r, baho: r.ball / r.azolar }))
    .sort(
      (a, b) =>
        b.baho - a.baho ||
        (a.groupId < b.groupId ? -1 : a.groupId > b.groupId ? 1 : 0),
    )
    .map((r, i) => ({ ...r, place: i + 1 }));
}

/** Ko'rsatish uchun: 1 o'nlik xonagacha. */
export function bahoKorinishi(baho: number): number {
  return Math.round(baho * 10) / 10;
}
