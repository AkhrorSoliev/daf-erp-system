import { msg } from "@/i18n/msg";

/**
 * The Ta'lim looks a student can pick (ADR-0125). The ids mirror
 * `server/src/common/lernen-temalar.ts` (lernen-temalar.test.ts compares
 * them). `tayyor` says the look is built: only those are offered in
 * Sozlamalar. `swatch` is only the dot drawn on the card.
 */
export const LERNEN_TEMALAR = [
  { id: "toza", label: msg("Toza"), hint: msg("Oq fon, qalin yumshoq tugmalar"), swatch: "#ff6b4a", tayyor: true },
  { id: "ormon", label: msg("O'rmon"), hint: msg("Yumshoq qatlamli o'rmon"), swatch: "#2f6b4f", tayyor: true },
  { id: "dengiz", label: msg("Dengiz"), hint: msg("Suv osti dunyosi"), swatch: "#2b78a8", tayyor: false },
  { id: "alp", label: msg("Nemis sayohati"), hint: msg("Tongdan tungacha"), swatch: "#8b5cf6", tayyor: false },
] as const;

export type LernenTemaId = (typeof LERNEN_TEMALAR)[number]["id"];

export const LERNEN_TEMA_IDLARI: readonly LernenTemaId[] = LERNEN_TEMALAR.map((t) => t.id);

export const DEFAULT_LERNEN_TEMA: LernenTemaId = "toza";

export const TAYYOR_TEMALAR = LERNEN_TEMALAR.filter((t) => t.tayyor);

export function isLernenTema(value: unknown): value is LernenTemaId {
  return typeof value === "string" && (LERNEN_TEMA_IDLARI as readonly string[]).includes(value);
}

export function lernenTemaOrDefault(value: unknown): LernenTemaId {
  return isLernenTema(value) ? value : DEFAULT_LERNEN_TEMA;
}
