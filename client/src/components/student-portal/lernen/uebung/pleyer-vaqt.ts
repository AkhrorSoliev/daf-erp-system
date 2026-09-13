/**
 * Soniya → `m:ss`. `<audio>.duration` metadata kelguncha `NaN`, oqim
 * uchun `Infinity` — ikkalasi ham «0:00»: pleyer hech qachon
 * «NaN:NaN» chizmasin.
 */
export function formatVaqt(sekunden: number): string {
  if (!Number.isFinite(sekunden) || sekunden < 0) return "0:00";
  const s = Math.floor(sekunden);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
