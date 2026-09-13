import {
  SEANS_TANAFFUSI_MS,
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

const son = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

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

function payloadmi(v: unknown): v is FaollikPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const sections = o.sections as Record<string, unknown> | undefined;
  return (
    typeof o.sessionId === "string" &&
    o.platform === "WEB" &&
    son(o.activeSeconds) &&
    son(o.radioSeconds) &&
    !!sections &&
    son(sections.LERNEN) &&
    son(sections.OTHER)
  );
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
  if (!seansmi(v) || v.userId !== userId) return { davom: null, yopilgan: null };
  const yangi = v.kun === tashkentKuni(now) && now - v.lastActiveAt <= SEANS_TANAFFUSI_MS;
  return yangi ? { davom: v, yopilgan: null } : { davom: null, yopilgan: v };
}

export function joriyniOchir(s: Saqlagich): void {
  try {
    s.removeItem(JORIY_KALIT);
  } catch {
    // Jim o'tiladi.
  }
}

export function kutilmoqdaOqi(s: Saqlagich): FaollikPayload[] {
  const v = oqi(s, KUTILMOQDA_KALIT);
  return Array.isArray(v) ? v.filter(payloadmi) : [];
}

export function kutilmoqdaQosh(s: Saqlagich, p: FaollikPayload): void {
  const royxat = kutilmoqdaOqi(s).filter((x) => x.sessionId !== p.sessionId);
  royxat.push(p);
  yoz(s, KUTILMOQDA_KALIT, royxat.slice(-KUTILMOQDA_MAX));
}

export function kutilmoqdaOchir(s: Saqlagich, sessionId: string): void {
  yoz(
    s,
    KUTILMOQDA_KALIT,
    kutilmoqdaOqi(s).filter((x) => x.sessionId !== sessionId),
  );
}
