/** Baholar shu oydan beri yig'iladi (spec 2026-10-13). */
export const RATING_FLOOR_MONTH = "2026-10";

const oneDecimal = (x: number) => x.toFixed(1).replace(".", ",");

export function averageText(average: number | null): string {
  return average === null ? "—" : `${oneDecimal(average)} ⭐`;
}

export function trend(
  current: number | null,
  previous: number | null,
): { text: string; tone: "up" | "down" | "same" } | null {
  if (current === null || previous === null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return { text: "o'zgarmadi", tone: "same" };
  return diff > 0
    ? { text: `↑ ${oneDecimal(diff)}`, tone: "up" }
    : { text: `↓ ${oneDecimal(-diff)}`, tone: "down" };
}

export function responseText(rated: number, delivered: number, rate: number | null): string {
  return rate === null ? "—" : `${rated} / ${delivered} · ${rate}%`;
}

/** "2026-10-05" → "05.10.2026". */
export function dayText(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}
