/**
 * URL filtrlarining o'qish/yozish qoidalari — React'dan mustaqil, shuning uchun
 * test qilinadi. `useUrlFilters` shu yerdagi funksiyalarni chaqiradi, xolos.
 */

export type ParamType = "string" | "number" | "array";

export interface ParamConfig {
  type: ParamType;
  /** `array` uchun bo'sh ro'yxat — "filtrsiz" degani. */
  defaultValue: string | number | readonly string[];
}

export type FilterSchema = Record<string, ParamConfig>;

/**
 * Ko'p tanlovli filtr URL'da vergul bilan yoziladi (`?role=CEO,Teacher`).
 * Takrorlanuvchi kalit (`role=CEO&role=Teacher`) o'rniga shu shakl tanlandi:
 * havolani odam o'qiy oladi va serverdagi `toStringArray` bilan bir xil tilda
 * gaplashadi.
 */
export function parseArrayParam(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Bitta so'rov satridan sxemaga mos filtr qiymatlarini o'qiydi. */
export function readFilters(
  schema: FilterSchema,
  params: URLSearchParams,
): Record<string, string | number | string[]> {
  const result: Record<string, string | number | string[]> = {};
  for (const key of Object.keys(schema)) {
    const config = schema[key];
    const raw = params.get(key);
    if (config.type === "array") {
      result[key] = parseArrayParam(raw);
    } else if (raw === null) {
      result[key] = config.defaultValue as string | number;
    } else if (config.type === "number") {
      const parsed = parseInt(raw, 10);
      result[key] = isNaN(parsed) ? (config.defaultValue as number) : parsed;
    } else {
      result[key] = raw;
    }
  }
  return result;
}

/**
 * Filtr qiymatlarini so'rov satriga yozadi. Standart qiymat (massiv uchun bo'sh
 * ro'yxat) URL'da iz qoldirmaydi — toza sahifaning manzili ham toza bo'ladi.
 * Sxemaga kirmagan parametrlar tegilmaydi.
 */
export function writeFilters(
  schema: FilterSchema,
  params: URLSearchParams,
  values: Record<string, unknown>,
): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of Object.keys(schema)) {
    const config = schema[key];
    const value = values[key];
    if (config.type === "array") {
      const list = Array.isArray(value) ? (value as string[]) : [];
      if (list.length === 0) next.delete(key);
      else next.set(key, list.join(","));
      continue;
    }
    if (value === config.defaultValue || value === undefined || value === "") {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }
  return next;
}

/**
 * Ko'p tanlovli filtrni so'rov parametriga aylantiradi.
 * Bo'sh ro'yxat `undefined` beradi — axios bunday kalitni umuman yubormaydi.
 */
export function listParam(values: readonly string[]): string | undefined {
  return values.length > 0 ? values.join(",") : undefined;
}
