import {
  SEANS_TANAFFUSI_MS,
  payloadFor,
  tashkentKuni,
  type FaollikPayload,
  type FaollikSeansi,
} from "./activity-tracker";

/**
 * Faollik hisobining `localStorage` qatlami (dizayn 4.5). Joriy seans har
 * 15 s saqlanadi — sahifa yangilansa yoki brauzer yopilsa, keyingi ochilishda
 * davom etadi yoki yopilgan sifatida serverga yuboriladi. Yuborilmagan yopiq
 * seanslar alohida ro'yxatda. Saqlagich xato bersa (xususiy rejim, kvota) jim
 * o'tiladi — faollik hisobi portalni hech qachon buzmasligi kerak.
 */
export interface Saqlagich {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const JORIY_KALIT = "daf.faollik.joriy";
export const KUTILMOQDA_KALIT = "daf.faollik.kutilmoqda";
export const KUTILMOQDA_MAX = 20;

function oqi(s: Saqlagich, kalit: string): unknown {
  try {
    const raw = s.getItem(kalit);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function yoz(s: Saqlagich, kalit: string, qiymat: unknown): void {
  try {
    s.setItem(kalit, JSON.stringify(qiymat));
  } catch {
    // Kvota yoki xususiy rejim — faollik hisobi portalni buzmasin.
  }
}

const son = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

function seansmi(v: unknown): v is FaollikSeansi {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const sections = o.sections as Record<string, unknown> | undefined;
  return (
    typeof o.sessionId === "string" &&
    son(o.userId) &&
    typeof o.kun === "string" &&
    son(o.activeMs) &&
    son(o.radioMs) &&
    son(o.lastActiveAt) &&
    !!sections &&
    son(sections.LERNEN) &&
    son(sections.OTHER)
  );
}

/**
 * `v`ni shartnoma maydonlariga qarab tekshiradi va FAQAT o'sha 5 maydondan
 * qaytadan quradi — ortiqcha maydon bo'lsa ham tashlab ketiladi. Shu tufayli
 * serverga hech qachon `forbidNonWhitelisted` bilan rad etiladigan tana
 * yuborilmaydi, saqlagichda qanday shakl yotgan bo'lishidan qat'iy nazar.
 */
function payloadQur(v: unknown): FaollikPayload | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const sections = o.sections as Record<string, unknown> | undefined;
  if (
    typeof o.sessionId !== "string" ||
    o.platform !== "WEB" ||
    !son(o.activeSeconds) ||
    !son(o.radioSeconds) ||
    !sections ||
    !son(sections.LERNEN) ||
    !son(sections.OTHER)
  ) {
    return null;
  }
  return {
    sessionId: o.sessionId,
    platform: "WEB",
    activeSeconds: o.activeSeconds,
    radioSeconds: o.radioSeconds,
    sections: { LERNEN: sections.LERNEN, OTHER: sections.OTHER },
  };
}

interface KutilmoqdaYozuv {
  userId: number;
  /**
   * The session's Tashkent day. The server files a session it has never seen
   * under the day the request ARRIVES, so only today's entries may be sent.
   */
  kun: string;
  payload: FaollikPayload;
}

/**
 * Xom ro'yxatni o'qiydi: `userId`si, kuni va tanasi to'g'ri kelmagan yozuvlar
 * tushib qoladi. Entries without `kun` are the pre-fix format — the tracker
 * could not send anything then, so what piled up spans unknown past days.
 */
function kutilmoqdaXomniOqi(s: Saqlagich): KutilmoqdaYozuv[] {
  const v = oqi(s, KUTILMOQDA_KALIT);
  if (!Array.isArray(v)) return [];
  const natija: KutilmoqdaYozuv[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (!son(o.userId) || typeof o.kun !== "string") continue;
    const p = payloadQur(o.payload);
    if (p) natija.push({ userId: o.userId, kun: o.kun, payload: p });
  }
  return natija;
}

export function joriyniSaqla(s: Saqlagich, seans: FaollikSeansi): void {
  yoz(s, JORIY_KALIT, seans);
}

/**
 * `davom` — shu foydalanuvchining bugungi, 30 daqiqa ichidagi seansi.
 * `yopilgan` — shu foydalanuvchining eskirgan seansi (yuborish kerak).
 * Boshqa foydalanuvchining seansi e'tiborga olinmaydi: uni bizning token
 * bilan yuborib bo'lmaydi (server 403 qaytaradi).
 */
export function joriyniOqi(
  s: Saqlagich,
  userId: number,
  now: number,
): { davom: FaollikSeansi | null; yopilgan: FaollikSeansi | null } {
  const v = oqi(s, JORIY_KALIT);
  if (!seansmi(v) || v.userId !== userId)
    return { davom: null, yopilgan: null };
  const yangi =
    v.kun === tashkentKuni(now) && now - v.lastActiveAt <= SEANS_TANAFFUSI_MS;
  return yangi ? { davom: v, yopilgan: null } : { davom: null, yopilgan: v };
}

export function joriyniOchir(s: Saqlagich): void {
  try {
    s.removeItem(JORIY_KALIT);
  } catch {
    // Jim o'tiladi.
  }
}

/**
 * Shu `userId`ga tegishli yuborilmagan yuklarni qaytaradi. Boshqa
 * foydalanuvchining yozuvlari (va eski, `userId`siz yozuvlar) hech qachon
 * qaytarilmaydi — chiqishda navbatga tushib qolgan seans keyingi kirgan
 * boshqa o'quvchiga yozilib ketmasligi uchun. Bunday begona/buzilgan
 * yozuvlar shu o'qishda saqlagichdan ham butunlay olib tashlanadi: ular hech
 * qachon to'g'ri egasiga qayta biriktirilmaydi, faqat tashlab yuboriladi.
 *
 * Entries from any day but today (Tashkent) are dropped the same way: sent
 * now, they would be counted as today's time.
 */
export function kutilmoqdaOqi(
  s: Saqlagich,
  userId: number,
  now: number,
): FaollikPayload[] {
  const bugun = tashkentKuni(now);
  const hammasi = kutilmoqdaXomniOqi(s);
  const shu = hammasi.filter((y) => y.userId === userId && y.kun === bugun);
  if (shu.length !== hammasi.length) yoz(s, KUTILMOQDA_KALIT, shu);
  return shu.map((y) => y.payload);
}

export function kutilmoqdaQosh(s: Saqlagich, seans: FaollikSeansi): void {
  const royxat = kutilmoqdaXomniOqi(s).filter(
    (y) => y.payload.sessionId !== seans.sessionId,
  );
  royxat.push({
    userId: seans.userId,
    kun: seans.kun,
    payload: payloadFor(seans),
  });
  yoz(s, KUTILMOQDA_KALIT, royxat.slice(-KUTILMOQDA_MAX));
}

export function kutilmoqdaOchir(s: Saqlagich, sessionId: string): void {
  yoz(
    s,
    KUTILMOQDA_KALIT,
    kutilmoqdaXomniOqi(s).filter((y) => y.payload.sessionId !== sessionId),
  );
}

/**
 * Xotiradagi zaxira saqlagich. `window.localStorage`ga qo'l tegizishning
 * o'zi ba'zi brauzerlarda (qattiq maxfiylik rejimi, bloklangan sayt
 * ma'lumotlari, ba'zi webview'lar) `SecurityError` tashlaydi — bu holatda
 * hisob shu saqlagichga o'tadi: seans davomida o'lchash va yuborish davom
 * etadi, faqat sahifa yangilanganda saqlanib qolmaydi.
 */
export function xotiraSaqlagichi(): Saqlagich {
  const xotira = new Map<string, string>();
  return {
    getItem: (k) => xotira.get(k) ?? null,
    setItem: (k, v) => void xotira.set(k, v),
    removeItem: (k) => void xotira.delete(k),
  };
}
