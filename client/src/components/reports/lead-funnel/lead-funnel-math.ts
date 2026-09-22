import { tashkentNow } from "@/lib/tashkent-time";
import type { FunnelStage, PeopleStage } from "./lead-funnel-types";

/**
 * Voronkaning ko'rinish mantiqi — sof funksiyalar, chunki vitest `node`
 * muhitida ishlaydi va komponent render qilib bo'lmaydi.
 */

export const FUNNEL_ORDER: FunnelStage[] = [
  "lead",
  "enrolled",
  "attended",
  "paid",
];

export const STAGE_LABELS: Record<PeopleStage, string> = {
  lead: "Lid",
  enrolled: "Guruhga yozildi",
  attended: "Darsga keldi",
  paid: "To'lov qildi",
  unpaid: "Darsga kelgan, lekin to'lamagan",
};

/** «Keyingi bosqichga o'tmaganlar» tugmasining har bosqichdagi ma'nosi. */
export const STUCK_LABELS: Record<Exclude<FunnelStage, "paid">, string> = {
  lead: "Guruhga yozilmaganlar",
  enrolled: "Darsga kelmaganlar",
  attended: "To'lov qilmaganlar",
};

export interface FunnelRow {
  stage: FunnelStage;
  label: string;
  count: number;
  /** Birinchi bosqichga nisbatan, 0–100. Birinchi bosqich 0 bo'lsa `null`. */
  pctOfFirst: number | null;
  /** Oldingi bosqichdan tushib qolganlar soni; birinchi bosqichda `null`. */
  lostFromPrev: number | null;
  /** Oldingi bosqichdan o'tganlar ulushi, 0–100; birinchi bosqichda `null`. */
  pctOfPrev: number | null;
  /** Blok kengligi, 0–1. Birinchi bosqich 0 bo'lsa hammasi 0. */
  widthRatio: number;
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export function buildFunnelRows(
  stages: Record<FunnelStage, number>,
): FunnelRow[] {
  const first = stages.lead;
  return FUNNEL_ORDER.map((stage, i) => {
    const count = stages[stage];
    const prev = i === 0 ? null : stages[FUNNEL_ORDER[i - 1]];
    return {
      stage,
      label: STAGE_LABELS[stage],
      count,
      pctOfFirst: pct(count, first),
      lostFromPrev: prev === null ? null : Math.max(prev - count, 0),
      pctOfPrev: prev === null ? null : pct(count, prev),
      widthRatio: first > 0 ? Math.min(count / first, 1) : 0,
    };
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Voronka shu kundan boshlab sanaydi (CEO qarori, 13.09.2026): 10.09.2026 dan
 * har bir yangi o'quvchi lid qoldiradi, undan oldingi davr to'liq emas va
 * ko'rsatilmaydi. Server ham xuddi shu chegarani qo'yadi —
 * server/src/reports/lead-funnel/lead-funnel.math.ts `FUNNEL_START_DATE`.
 */
export const FUNNEL_START_DATE = "2026-09-10";

const later = (a: string, b: string) => (a > b ? a : b);

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Joriy Toshkent oyi: 1-kundan oxirgi kungacha. Voronka boshlangan oyda
 * boshlanish `FUNNEL_START_DATE` ga suriladi.
 */
export function currentMonthRange(now: Date = new Date()): {
  startDate: string;
  endDate: string;
} {
  const [y, m] = tashkentNow(now).dateStr.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  return {
    startDate: later(`${y}-${mm}-01`, FUNNEL_START_DATE),
    endDate: `${y}-${mm}-${String(lastDayOfMonth(y, m)).padStart(2, "0")}`,
  };
}

/**
 * URL'dagi oraliqni o'qiydi. Ikkalasi ham to'g'ri va tartibli bo'lmasa, yoki
 * butunlay voronka boshlanishidan oldin bo'lsa, joriy oyga qaytadi — yarim
 * buzilgan havola jim ravishda boshqa davr ko'rsatmasin. Boshlanish esa
 * `FUNNEL_START_DATE` dan oldin bo'lsa o'sha kunga suriladi.
 */
export function resolveRange(
  startRaw: string | null,
  endRaw: string | null,
  now: Date = new Date(),
): { startDate: string; endDate: string; isDefault: boolean } {
  if (
    startRaw &&
    endRaw &&
    DATE_RE.test(startRaw) &&
    DATE_RE.test(endRaw) &&
    startRaw <= endRaw &&
    endRaw >= FUNNEL_START_DATE
  ) {
    return {
      startDate: later(startRaw, FUNNEL_START_DATE),
      endDate: endRaw,
      isDefault: false,
    };
  }
  return { ...currentMonthRange(now), isDefault: true };
}

/**
 * Bosqich ro'yxati so'rovining parametrlari. FAQAT server DTO'si biladigan
 * maydonlar: global ValidationPipe `forbidNonWhitelisted` — `resolveRange`
 * qaytaradigan `isDefault` ni ham yuborish har so'rovni 400 qilgan edi.
 * `unpaid` davrga bog'liq emas, unga sana yuborilmaydi.
 */
export function peopleQueryParams(input: {
  stage: PeopleStage;
  mode: "all" | "stuck";
  page: number;
  pageSize: number;
  range: { startDate: string; endDate: string };
}): Record<string, string | number> {
  const params: Record<string, string | number> = {
    stage: input.stage,
    mode: input.mode,
    page: input.page,
    pageSize: input.pageSize,
  };
  if (input.stage !== "unpaid") {
    params.startDate = input.range.startDate;
    params.endDate = input.range.endDate;
  }
  return params;
}

/** Oraliq bugungi kunni qamrab oladimi — kogorta izohini ko'rsatish uchun. */
export function rangeIncludesToday(
  range: { startDate: string; endDate: string },
  now: Date = new Date(),
): boolean {
  const today = tashkentNow(now).dateStr;
  return range.startDate <= today && today <= range.endDate;
}

/**
 * "YYYY-MM-DD" yoki ISO vaqtni Toshkent kuni sifatida "dd.MM.yyyy" ga
 * aylantiradi. Sana satri `new Date()` ga berilmaydi — u UTC yarim tuni bo'lib
 * brauzer mintaqasida bir kun orqaga siljishi mumkin.
 */
export function displayDate(value: string): string {
  const dateStr = DATE_RE.test(value)
    ? value
    : tashkentNow(new Date(value)).dateStr;
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

