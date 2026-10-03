/** "2026-09-30" → "30.09.2026" (loyihaning sana formati). */
export function sanaKorinishi(iso: string): string {
  const [yil, oy, kun] = iso.split("-");
  return `${kun}.${oy}.${yil}`;
}

/** Kalendar kuniga kun qo'shadi (UTC ichida — soat mintaqasi aralashmaydi). */
export function kunQosh(iso: string, kun: number): string {
  const sana = new Date(`${iso}T00:00:00Z`);
  sana.setUTCDate(sana.getUTCDate() + kun);
  return sana.toISOString().slice(0, 10);
}

/** YYYY-MM-DD va haqiqiy kalendar kuni (2026-02-30, 2026-13-01 emas). Xato bermaydi. */
export function haqiqiySanami(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const sana = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(sana.getTime()) && sana.toISOString().slice(0, 10) === iso;
}
