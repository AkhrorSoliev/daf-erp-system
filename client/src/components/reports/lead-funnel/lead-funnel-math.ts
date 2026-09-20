import { formatPercent } from "@/lib/format-utils";
import { tashkentNow } from "@/lib/tashkent-time";
import type {
  FunnelPeriod,
  FunnelStage,
  PeopleStage,
  SourceBreakdownRow,
} from "./lead-funnel-types";

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

/** Yo'qotish qatori: «↓ N kishi <shu bosqichga o'tmadi>». Kalit — o'tilmagan bosqich. */
export const LOSS_LABELS: Record<Exclude<FunnelStage, "lead">, string> = {
  enrolled: "guruhga yozilmadi",
  attended: "darsga kelmadi",
  paid: "to'lov qilmadi",
};

export const PEOPLE_STAGES: PeopleStage[] = [...FUNNEL_ORDER, "unpaid"];

export function isPeopleStage(value: string): value is PeopleStage {
  return (PEOPLE_STAGES as string[]).includes(value);
}

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
  /** Oldingi bosqichdan o'tmaganlar ulushi, butun foiz; birinchi bosqichda null. */
  lostPct: number | null;
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
      lostPct:
        prev === null || prev === 0
          ? null
          : Math.round(((prev - count) / prev) * 100),
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
  sourceId?: string;
  status?: string;
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
    if (input.sourceId) params.sourceId = input.sourceId;
  } else if (input.status) {
    params.status = input.status;
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

export const PERIOD_PRESETS = ["shu-oy", "otgan-oy", "boshidan", "oraliq"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
export const DEFAULT_PRESET: PeriodPreset = "shu-oy";

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  "shu-oy": "Shu oy",
  "otgan-oy": "O'tgan oy",
  boshidan: "Boshidan",
  oraliq: "Oraliq",
};

/**
 * Preset'ning hisoblangan oralig'i. `null` — oraliq butunlay voronka
 * chegarasidan oldin (sentyabr 2026 da «O'tgan oy» = avgust): server bunday
 * so'rovni 400 bilan rad etadi, shuning uchun tugma ham ko'rsatilmaydi.
 */
export function presetRange(
  preset: Exclude<PeriodPreset, "oraliq">,
  now: Date = new Date(),
): FunnelPeriod | null {
  const today = tashkentNow(now).dateStr;
  switch (preset) {
    case "shu-oy":
      return currentMonthRange(now);
    case "otgan-oy": {
      const [y, m] = today.split("-").map(Number);
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const mm = String(pm).padStart(2, "0");
      const endDate = `${py}-${mm}-${String(lastDayOfMonth(py, pm)).padStart(2, "0")}`;
      if (endDate < FUNNEL_START_DATE) return null;
      return { startDate: later(`${py}-${mm}-01`, FUNNEL_START_DATE), endDate };
    }
    case "boshidan":
      return { startDate: FUNNEL_START_DATE, endDate: today };
  }
}

export function visiblePresets(now: Date = new Date()): PeriodPreset[] {
  return PERIOD_PRESETS.filter(
    (p) => p === "oraliq" || presetRange(p, now) !== null,
  );
}

/**
 * URL → davr. `oraliq` sanalari `resolveRange` orqali tekshiriladi (buzilgan
 * bo'lsa joriy oyga qaytadi); ko'rinmaydigan yoki noma'lum preset ham joriy
 * oyga qaytadi — yarim buzilgan havola jim boshqa davr ko'rsatmasin.
 */
export function resolvePeriodFilter(
  input: { period: string; startDate: string; endDate: string },
  now: Date = new Date(),
): { preset: PeriodPreset; startDate: string; endDate: string } {
  if (input.period === "oraliq") {
    const r = resolveRange(input.startDate || null, input.endDate || null, now);
    if (!r.isDefault) {
      return { preset: "oraliq", startDate: r.startDate, endDate: r.endDate };
    }
  } else if (
    input.period === "otgan-oy" ||
    input.period === "boshidan"
  ) {
    const range = presetRange(input.period, now);
    if (range) return { preset: input.period, ...range };
  }
  return { preset: DEFAULT_PRESET, ...currentMonthRange(now) };
}

/** Kishi soni bo'yicha eng katta yo'qotish bo'lgan bosqich (o'tilmagan bosqich). */
export function biggestLossStage(rows: FunnelRow[]): FunnelStage | null {
  let best: FunnelRow | null = null;
  for (const row of rows) {
    if (row.lostFromPrev !== null && row.lostFromPrev > 0) {
      if (!best || row.lostFromPrev > (best.lostFromPrev ?? 0)) best = row;
    }
  }
  return best?.stage ?? null;
}

/** Liddan to'lovgacha, butun foiz; lid 0 bo'lsa null. */
export function conversionPct(lead: number, paid: number): number | null {
  return lead > 0 ? Math.round((paid / lead) * 100) : null;
}

/** 146 lidda 0,1 % aniqlik yolg'on — shu hisobotda foizlar butun sonda. */
export function wholePercent(value: number | null): string {
  return formatPercent(value, { maximumFractionDigits: 0 });
}

export type SourceListRow = SourceBreakdownRow & { key: string; isRest: boolean };

export const TOP_SOURCES = 5;

/** Loyiha qoidasi: uzun dum «Boshqalar (N ta manba)» ga yig'iladi, u bosilmaydi. */
export function collapseSources(
  rows: SourceBreakdownRow[],
  top: number = TOP_SOURCES,
): SourceListRow[] {
  const toRow = (r: SourceBreakdownRow): SourceListRow => ({
    ...r,
    key: r.id ?? "none",
    isRest: false,
  });
  if (rows.length <= top) return rows.map(toRow);
  const head = rows.slice(0, top).map(toRow);
  const tail = rows.slice(top);
  const sum = (k: "lead" | "enrolled" | "attended" | "paid") =>
    tail.reduce((acc, r) => acc + r[k], 0);
  return [
    ...head,
    {
      id: null,
      name: `Boshqalar (${tail.length} ta manba)`,
      lead: sum("lead"),
      enrolled: sum("enrolled"),
      attended: sum("attended"),
      paid: sum("paid"),
      key: "rest",
      isRest: true,
    },
  ];
}
